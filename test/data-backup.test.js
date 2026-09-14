import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from '../node_modules/fflate/esm/browser.js';
import { BackupValidationError, createBackupArchive, parseBackupArchive, restoreBackup } from '../src/data-backup.js';

const APP_SCHEMA_VERSION = 3;
const clone = (value) => structuredClone(value);
const bytes = async (file) => Array.from(new Uint8Array(await file.arrayBuffer()));

function userStorage({ records = [], evidences = [], children = [], files = [], schemaVersion = APP_SCHEMA_VERSION } = {}) {
  let state = { records:clone(records), evidences:clone(evidences), children:clone(children), schemaVersion };
  let blobs = new Map(files.map((entry) => [entry.id, entry.file])); let replaceCalls = 0;
  return {
    secret: 'never-back-up-this',
    loadBackupState: () => clone(state),
    listFiles: async () => [...blobs].map(([id, file]) => ({ id, file })),
    replaceBackupState: async (next) => { replaceCalls += 1; state = { records:clone(next.records), evidences:clone(next.evidences), children:clone(next.children), schemaVersion:next.schemaVersion }; blobs = new Map(next.files.map((entry) => [entry.id, entry.file])); },
    snapshot: async () => ({ state:clone(state), files:await Promise.all([...blobs].map(async ([id, file]) => ({ id, bytes:await bytes(file), type:file.type }))), replaceCalls }),
  };
}

function fixture() {
  const evidence = { id:'ev_keep', evidenceNumber:'E-001', fileName:'IMG_1234.JPG', mimeType:'image/jpeg', size:3, createdAt:'2026-09-14T10:00:00.000Z', status:'attached', ocr:{ status:'completed', rawText:'raw', correctedText:'corrected' } };
  const item = { id:'item_keep', receiptId:'record_keep', lineOrder:1, productName:'water', quantity:1, unitPrice:120, amount:120, category:'飲料水', purpose:{ value:'水分補給', source:'manual_override', confidence:null }, submissionStatus:'included', knowledgeKey:'drinking_water', knowledgeSource:'knowledge', knowledgeVersion:2, purposeSource:'manual_override', categorySource:'manual_override', originalKnowledgePurpose:'元の目的', notes:'edited', createdAt:'2026-09-14T10:00:00.000Z', updatedAt:'2026-09-14T10:05:00.000Z' };
  const record = { id:'record_keep', evidenceIds:['ev_keep'], paidDate:'2026-09-14', amount:{ value:120, source:'manual', confidence:null }, vendor:{ value:'store', source:'manual', confidence:null }, category:{ value:'食費', source:'manual', confidence:null }, childId:{ value:'child_keep', source:'manual', confidence:null }, settlementStatus:{ value:'未確認', source:'manual', confidence:null }, items:[item], notes:'record note', createdAt:'2026-09-14T10:00:00.000Z', updatedAt:'2026-09-14T10:05:00.000Z' };
  return { records:[record], evidences:[evidence], children:[{ id:'child_keep', name:'子1' }], files:[{ id:'ev_keep', file:new Blob([new Uint8Array([1,2,3])], { type:'image/jpeg' }) }] };
}

test('backup contains only the active storage data, preserves receipt items and does not mutate it', async () => {
  const active = userStorage(fixture()); const before = await active.snapshot();
  const result = await createBackupArchive({ storage:active, appSchemaVersion:APP_SCHEMA_VERSION, createdAt:'2026-09-14T19:00:00.000Z' });
  const parsed = await parseBackupArchive(result.archive, { appSchemaVersion:APP_SCHEMA_VERSION }); const after = await active.snapshot();
  assert.equal(result.manifest.backupFormatVersion, 1); assert.equal(result.manifest.recordCount, 1); assert.equal(result.manifest.evidenceCount, 1); assert.equal(result.manifest.originalFileCount, 1); assert.equal(result.manifest.receiptItemCount, 1);
  assert.equal(parsed.records[0].id, 'record_keep'); assert.equal(parsed.records[0].items[0].id, 'item_keep'); assert.equal(parsed.records[0].items[0].knowledgeKey, 'drinking_water'); assert.equal(parsed.evidences[0].id, 'ev_keep'); assert.deepEqual(await bytes(parsed.files[0].file), [1,2,3]);
  assert.deepEqual(after, before, 'backup must be read-only'); assert.equal(result.warnings.length, 0);
});

test('archive never serializes unrelated local data or secrets', async () => {
  const active = userStorage(fixture()); const result = await createBackupArchive({ storage:active, appSchemaVersion:APP_SCHEMA_VERSION });
  const zip = unzipSync(new Uint8Array(await result.archive.arrayBuffer())); const entries = Object.fromEntries(Object.entries(zip).filter(([path]) => path.endsWith('.json')).map(([path, data]) => [path, strFromU8(data)]));
  assert.equal(JSON.stringify(entries).includes('never-back-up-this'), false); assert.deepEqual(Object.keys(entries).sort(), ['data/children.json','data/evidence.json','data/originals.json','data/records.json','data/schema.json','manifest.json']);
});

test('metadata/blob mismatch is warned on backup and rejected for restore', async () => {
  const data = fixture(); data.files = []; const active = userStorage(data);
  const result = await createBackupArchive({ storage:active, appSchemaVersion:APP_SCHEMA_VERSION });
  assert.match(result.warnings.join(' '), /ev_keep/);
  await assert.rejects(() => parseBackupArchive(result.archive, { appSchemaVersion:APP_SCHEMA_VERSION }), BackupValidationError);
});

test('restore keeps IDs, references, user edits, originals, and validates counts', async () => {
  const source = userStorage(fixture()); const archive = await createBackupArchive({ storage:source, appSchemaVersion:APP_SCHEMA_VERSION }); const selected = await parseBackupArchive(archive.archive, { appSchemaVersion:APP_SCHEMA_VERSION });
  const target = userStorage({ records:[{ id:'old', evidenceIds:[], items:[] }], evidences:[], children:[], files:[] }); const beforeConfirm = await target.snapshot();
  assert.equal(beforeConfirm.replaceCalls, 0, 'selecting and parsing must not restore');
  const restored = await restoreBackup({ storage:target, backup:selected, appSchemaVersion:APP_SCHEMA_VERSION }); const after = await target.snapshot();
  assert.deepEqual(restored, { recordCount:1, evidenceCount:1, originalFileCount:1, receiptItemCount:1 }); assert.equal(after.replaceCalls, 1); assert.equal(after.state.records[0].id, 'record_keep'); assert.equal(after.state.records[0].evidenceIds[0], 'ev_keep'); assert.equal(after.state.records[0].items[0].id, 'item_keep'); assert.equal(after.state.records[0].items[0].categorySource, 'manual_override'); assert.equal(after.state.evidences[0].fileName, 'IMG_1234.JPG'); assert.deepEqual(after.files[0].bytes, [1,2,3]);
});

test('bad ZIP and version mismatch stop before writing', async () => {
  const target = userStorage(fixture()); const before = await target.snapshot();
  await assert.rejects(() => parseBackupArchive(new Blob(['not a zip']), { appSchemaVersion:APP_SCHEMA_VERSION }), BackupValidationError);
  const source = userStorage(fixture()); const archive = await createBackupArchive({ storage:source, appSchemaVersion:APP_SCHEMA_VERSION });
  await assert.rejects(() => parseBackupArchive(archive.archive, { appSchemaVersion:4 }), BackupValidationError); assert.deepEqual(await target.snapshot(), before);
});

test('backup UI requires a selected, validated archive and an explicit confirmation action', () => {
  const ui = readFileSync(new URL('../data-backup-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /parseBackupArchive\(file/); assert.match(ui, /内容を検証しました。復元はまだ実行されていません。/); assert.match(ui, /id="confirmRestoreBackup"/); assert.match(ui, /confirm\('現在のデータへ復元します。/); assert.match(ui, /child-expense-pre-restore-/); assert.match(ui, /restoreBackup\(/);
});
