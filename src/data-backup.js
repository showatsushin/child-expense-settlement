import { strFromU8, strToU8, unzipSync, zipSync } from '../node_modules/fflate/esm/browser.js';
import { normalizeConfirmedHistory } from './confirmed-history.js';

export const BACKUP_FORMAT_VERSION = 1;

export class BackupValidationError extends Error {
  constructor(message) { super(message); this.name = 'BackupValidationError'; }
}

const json = (value) => strToU8(JSON.stringify(value));
const parseJson = (archive, path) => {
  if (!archive[path]) throw new BackupValidationError(`${path} がありません。`);
  try { return JSON.parse(strFromU8(archive[path])); } catch { throw new BackupValidationError(`${path} は正しいJSONではありません。`); }
};
const parseOptionalJson = (archive, path, fallback) => archive[path] ? parseJson(archive, path) : fallback;
const asArray = (value, name) => {
  if (!Array.isArray(value)) throw new BackupValidationError(`${name} は配列ではありません。`);
  return value;
};
const nonEmptyId = (value, name) => {
  const id = String(value || '');
  if (!id) throw new BackupValidationError(`${name} にIDがありません。`);
  return id;
};
const uniqueIds = (values, label) => {
  const seen = new Set();
  values.forEach((value) => { const id = nonEmptyId(value?.id, label); if (seen.has(id)) throw new BackupValidationError(`${label} のIDが重複しています。`); seen.add(id); });
  return seen;
};
const itemCount = (records) => records.reduce((count, record) => count + (Array.isArray(record?.items) ? record.items.length : 0), 0);
const extensionFor = (evidence) => {
  const byMime = { 'image/jpeg':'jpg', 'image/png':'png', 'application/pdf':'pdf' };
  const type = String(evidence?.mimeType || '').toLowerCase();
  if (byMime[type]) return byMime[type];
  const extension = String(evidence?.fileName || '').split('.').pop().toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(extension) ? extension : 'bin';
};
const originalPath = (evidence) => `originals/${encodeURIComponent(nonEmptyId(evidence?.id, 'Evidence'))}.${extensionFor(evidence)}`;
const toBytes = async (file) => {
  if (!file || typeof file.arrayBuffer !== 'function') throw new BackupValidationError('保存済み原本を読み取れません。');
  return new Uint8Array(await file.arrayBuffer());
};
const containsPath = (files, path) => typeof files?.has === 'function' ? files.has(path) : Object.prototype.hasOwnProperty.call(files || {}, path);

function verifyPayload({ manifest, records, evidences, children, originals, files }, appSchemaVersion) {
  if (!manifest || typeof manifest !== 'object') throw new BackupValidationError('manifest.json が不正です。');
  if (manifest.backupFormatVersion !== BACKUP_FORMAT_VERSION) throw new BackupValidationError(`未対応の backupFormatVersion (${manifest.backupFormatVersion}) です。`);
  if (manifest.appSchemaVersion !== appSchemaVersion) throw new BackupValidationError(`appSchemaVersion (${manifest.appSchemaVersion}) が現在のアプリ (${appSchemaVersion}) と一致しません。`);
  if (!Number.isFinite(Date.parse(manifest.createdAt || ''))) throw new BackupValidationError('バックアップ作成日時が不正です。');
  const safeRecords = asArray(records, 'records'); const safeEvidences = asArray(evidences, 'evidence'); const safeChildren = asArray(children, 'children'); const safeOriginals = asArray(originals, 'originals');
  if (manifest.recordCount !== safeRecords.length || manifest.evidenceCount !== safeEvidences.length || manifest.originalFileCount !== safeOriginals.length) throw new BackupValidationError('manifest の件数と内容が一致しません。');
  if (Number.isInteger(manifest.receiptItemCount) && manifest.receiptItemCount !== itemCount(safeRecords)) throw new BackupValidationError('ReceiptItem 件数が一致しません。');
  const recordIds = uniqueIds(safeRecords, 'ReceiptRecord'); const evidenceIds = uniqueIds(safeEvidences, 'Evidence'); uniqueIds(safeChildren, '子ども設定');
  const receiptItemIds = new Set();
  safeRecords.forEach((record) => {
    asArray(record.evidenceIds || [], 'ReceiptRecord.evidenceIds').forEach((id) => { if (!evidenceIds.has(String(id))) throw new BackupValidationError(`ReceiptRecord ${record.id} が存在しないEvidenceを参照しています。`); });
    asArray(record.items || [], 'ReceiptRecord.items').forEach((item) => { const id = nonEmptyId(item?.id, 'ReceiptItem'); if (receiptItemIds.has(id)) throw new BackupValidationError('ReceiptItem のIDが重複しています。'); receiptItemIds.add(id); if (String(item.receiptId || '') !== String(record.id)) throw new BackupValidationError(`ReceiptItem ${id} のReceiptRecord参照が一致しません。`); });
  });
  const originalIds = new Set(); const originalPaths = new Set();
  safeOriginals.forEach((entry) => {
    const id = nonEmptyId(entry?.evidenceId, '原本'); const path = String(entry?.path || '');
    if (!evidenceIds.has(id) || originalIds.has(id) || originalPaths.has(path) || !path.startsWith('originals/') || !containsPath(files, path)) throw new BackupValidationError('Evidence原本の対応が不正です。');
    originalIds.add(id); originalPaths.add(path);
  });
  safeEvidences.forEach((evidence) => { if (!originalIds.has(String(evidence.id))) throw new BackupValidationError(`Evidence ${evidence.id} の原本がありません。`); });
  return { records:safeRecords, evidences:safeEvidences, children:safeChildren, originals:safeOriginals, recordIds, evidenceIds };
}

export async function createBackupArchive({ storage, appSchemaVersion, createdAt = new Date().toISOString() }) {
  const state = storage.loadBackupState(); const records = asArray(state.records, 'records'); const evidences = asArray(state.evidences, 'evidence'); const children = asArray(state.children, 'children'); const confirmedHistory = normalizeConfirmedHistory(state.confirmedHistory);
  const storedFiles = await storage.listFiles(); const fileById = new Map(storedFiles.map((entry) => [String(entry.id), entry.file]));
  const evidenceIds = new Set(evidences.map((evidence) => String(evidence?.id || '')).filter(Boolean));
  const missingEvidenceBlobIds = evidences.filter((evidence) => !fileById.has(String(evidence?.id || ''))).map((evidence) => String(evidence.id));
  const orphanBlobIds = storedFiles.map((entry) => String(entry.id)).filter((id) => !evidenceIds.has(id));
  const originals = []; const entries = {};
  for (const evidence of evidences) {
    const id = nonEmptyId(evidence?.id, 'Evidence'); const file = fileById.get(id); if (!file) continue;
    const path = originalPath(evidence); originals.push({ evidenceId:id, path }); entries[path] = await toBytes(file);
  }
  const referencedEvidenceIds = new Set(records.flatMap((record) => Array.isArray(record?.evidenceIds) ? record.evidenceIds.map(String) : []));
  const danglingRecordEvidenceIds = [...referencedEvidenceIds].filter((id) => !evidenceIds.has(id));
  const manifest = { backupFormatVersion:BACKUP_FORMAT_VERSION, appSchemaVersion, createdAt, recordCount:records.length, receiptItemCount:itemCount(records), evidenceCount:evidences.length, originalFileCount:originals.length, integrity:{ missingEvidenceBlobIds, orphanBlobIds, danglingRecordEvidenceIds } };
  entries['manifest.json'] = json(manifest); entries['data/records.json'] = json(records); entries['data/evidence.json'] = json(evidences); entries['data/children.json'] = json(children); entries['data/confirmed-history.json'] = json(confirmedHistory); entries['data/originals.json'] = json(originals); entries['data/schema.json'] = json({ schemaVersion:state.schemaVersion });
  const warnings = [
    ...missingEvidenceBlobIds.map((id) => `Evidence ${id} の原本Blobがありません。`),
    ...orphanBlobIds.map((id) => `Evidence metadataのない原本Blob ${id} があります。`),
    ...danglingRecordEvidenceIds.map((id) => `ReceiptRecordが存在しないEvidence ${id} を参照しています。`),
    ...(state.schemaVersion === appSchemaVersion ? [] : [`保存schemaVersion (${state.schemaVersion}) が現在のアプリ (${appSchemaVersion}) と一致しません。`]),
  ];
  return { manifest, archive:new Blob([zipSync(entries, { level:6 })], { type:'application/zip' }), warnings };
}

export async function parseBackupArchive(input, { appSchemaVersion }) {
  let bytes;
  try { bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer()); } catch { throw new BackupValidationError('バックアップファイルを読み取れません。'); }
  let files;
  try { files = unzipSync(bytes); } catch { throw new BackupValidationError('ZIPファイルを解析できません。'); }
  const manifest = parseJson(files, 'manifest.json'); const records = parseJson(files, 'data/records.json'); const evidences = parseJson(files, 'data/evidence.json'); const children = parseJson(files, 'data/children.json'); const confirmedHistory = normalizeConfirmedHistory(parseOptionalJson(files, 'data/confirmed-history.json', {})); const originals = parseJson(files, 'data/originals.json'); const schema = parseJson(files, 'data/schema.json');
  if (!Number.isInteger(schema?.schemaVersion)) throw new BackupValidationError('保存schemaVersionが不正です。');
  if (schema.schemaVersion !== appSchemaVersion) throw new BackupValidationError(`保存schemaVersion (${schema.schemaVersion}) が現在のアプリ (${appSchemaVersion}) と一致しません。`);
  const checked = verifyPayload({ manifest, records, evidences, children, originals, files }, appSchemaVersion);
  const evidenceById = new Map(checked.evidences.map((evidence) => [String(evidence.id), evidence]));
  return { manifest, records:checked.records, evidences:checked.evidences, children:checked.children, confirmedHistory, schemaVersion:schema.schemaVersion, files:checked.originals.map((entry) => ({ id:String(entry.evidenceId), file:new Blob([files[entry.path]], { type:String(evidenceById.get(String(entry.evidenceId))?.mimeType || 'application/octet-stream') }) })) };
}

export async function restoreBackup({ storage, backup, appSchemaVersion }) {
  const files = new Map(backup.files.map((entry) => [`originals/${encodeURIComponent(entry.id)}.${extensionFor(backup.evidences.find((evidence) => String(evidence.id) === String(entry.id)))}`, new Uint8Array()]));
  verifyPayload({ manifest:backup.manifest, records:backup.records, evidences:backup.evidences, children:backup.children, originals:backup.files.map((entry) => ({ evidenceId:entry.id, path:`originals/${encodeURIComponent(entry.id)}.${extensionFor(backup.evidences.find((evidence) => String(evidence.id) === String(entry.id)))}` })), files }, appSchemaVersion);
  await storage.replaceBackupState({ records:backup.records, evidences:backup.evidences, children:backup.children, confirmedHistory:normalizeConfirmedHistory(backup.confirmedHistory), schemaVersion:backup.schemaVersion, files:backup.files });
  const restored = storage.loadBackupState(); const restoredFiles = await storage.listFiles();
  const manifest = { ...backup.manifest, recordCount:restored.records.length, evidenceCount:restored.evidences.length, originalFileCount:restoredFiles.length, receiptItemCount:itemCount(restored.records) };
  verifyPayload({ manifest, records:restored.records, evidences:restored.evidences, children:restored.children, originals:restored.evidences.map((evidence) => ({ evidenceId:evidence.id, path:`originals/${encodeURIComponent(evidence.id)}.${extensionFor(evidence)}` })), files:new Map(restoredFiles.map((entry) => [`originals/${encodeURIComponent(entry.id)}.${extensionFor(restored.evidences.find((evidence) => String(evidence.id) === String(entry.id)))}`, new Uint8Array()])) }, appSchemaVersion);
  return { recordCount:restored.records.length, evidenceCount:restored.evidences.length, originalFileCount:restoredFiles.length, receiptItemCount:itemCount(restored.records) };
}
