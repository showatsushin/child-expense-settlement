import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEvidenceDocument } from '../src/models.js';
import { saveDraftEvidence, attachDraftEvidence, discardDraftEvidence, discardUnorganizedEvidence, latestDraftEvidence, markEvidenceUnorganized, unorganizedEvidences, deleteReceiptAndExclusiveEvidence } from '../src/evidence-lifecycle.js';

function file(name = 'receipt.jpg', size = 3) { return { name, type: 'image/jpeg', size }; }

test('selection immediately creates and stores draft evidence without date or amount', async () => {
  const writes = []; const input = file();
  const evidence = await saveDraftEvidence({ file: input, evidences: [], saveFile: async (id, blob) => writes.push([id, blob]) });
  assert.equal(evidence.status, 'draft'); assert.equal(evidence.evidenceNumber, 'E-001'); assert.equal(writes[0][0], evidence.id); assert.equal(writes[0][1], input);
});

test('a saved draft file can be read for OCR before registration', async () => {
  const files = new Map(); const input = file('camera.jpg', 0);
  const evidence = await saveDraftEvidence({ file: input, evidences: [], saveFile: async (id, blob) => files.set(id, blob) });
  assert.equal(files.get(evidence.id), input); assert.equal(evidence.status, 'draft');
});

test('saving a draft as unorganized keeps its original blob and does not invoke a reader', async () => {
  const writes = []; const input = file('later.jpg');
  const evidence = await saveDraftEvidence({ file: input, evidences: [], saveFile: async (id, blob) => writes.push([id, blob]) });
  const saved = markEvidenceUnorganized({ evidenceId: evidence.id, evidences: [evidence] });
  assert.equal(saved, evidence); assert.equal(evidence.status, 'unorganized'); assert.deepEqual(writes, [[evidence.id, input]]);

  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  const saveAction = phase2.slice(phase2.indexOf('function saveUnorganized'), phase2.indexOf('async function ocr'));
  assert.match(phase2, /id="saveUnorganized"[^>]*>未整理に保存/);
  assert.match(phase2, /id="ocr"[^>]*>文字を読み取る/);
  assert.match(saveAction, /markEvidenceUnorganized/);
  assert.doesNotMatch(saveAction, /readReceipt|recognizeImage|extractPdfText|applyReceiptReaderCandidates/);
  assert.match(phase2.slice(phase2.indexOf('async function ocr')), /readReceipt/);
});

test('unorganized box filters existing evidence only and deletes only an unreferenced unorganized original', async () => {
  const evidences = [{ id: 'draft', status: 'draft' }, { id: 'saved', status: 'unorganized' }, { id: 'attached', status: 'attached' }, { id: 'referenced', status: 'unorganized' }];
  assert.deepEqual(unorganizedEvidences(evidences).map((evidence) => evidence.id), ['saved', 'referenced']);
  assert.equal(unorganizedEvidences(evidences)[0], evidences[1]);

  const deleted = [];
  const kept = await discardUnorganizedEvidence({ evidenceId: 'referenced', records: [{ evidenceIds: ['referenced'] }], evidences, deleteFile: async (id) => deleted.push(id) });
  assert.equal(kept.evidences, evidences); assert.deepEqual(deleted, []);

  const removed = await discardUnorganizedEvidence({ evidenceId: 'saved', records: [], evidences, deleteFile: async (id) => deleted.push(id) });
  assert.deepEqual(deleted, ['saved']); assert.deepEqual(removed.deletedEvidenceIds, ['saved']); assert.deepEqual(removed.evidences.map((evidence) => evidence.id), ['draft', 'attached', 'referenced']);
});

test('unorganized box reuses the existing blob preview and has no Reader action', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  const boxRender = phase2.slice(phase2.indexOf('async function renderUnorganizedBox'), phase2.indexOf('async function deleteUnorganized'));
  const boxDelete = phase2.slice(phase2.indexOf('async function deleteUnorganized'), phase2.indexOf('async function ocr'));
  assert.match(phase2, /id='unorganizedBox'/);
  assert.match(boxRender, /unorganizedEvidences\(evidences\)/);
  assert.match(boxRender, /getFile\(evidence\.id\)/);
  assert.match(boxRender, /renderPreview\(preview,file,evidence\.fileName\)/);
  assert.match(phase2, /revokeUnorganizedPreviews/);
  assert.doesNotMatch(boxRender, /saveFile|readReceipt|ocr\(|applyReceiptReaderCandidates/);
  assert.match(boxDelete, /discardUnorganizedEvidence/);
  assert.doesNotMatch(boxDelete, /readReceipt|ocr\(|applyReceiptReaderCandidates/);
});

test('organizing an unorganized evidence reloads its existing preview without changing status or starting a Reader', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  const organize = phase2.slice(phase2.indexOf('async function organizeUnorganizedEvidence'), phase2.indexOf('async function ocr'));
  assert.match(organize, /evidence\?\.status!==['"]unorganized['"]/);
  assert.match(organize, /getFile\(evidenceId\)/);
  assert.match(organize, /if\(!file\)\{\$\(['"]#filemsg['"]\)\.textContent/);
  assert.match(organize, /await reset\(\);pendingEvidenceId=evidence\.id;pendingFile=file;pendingOcr=evidence\.ocr/);
  assert.match(organize, /renderPreview\(\$\(['"]#preview['"]\),file,evidence\.fileName\)/);
  assert.match(organize, /scrollIntoView/);
  assert.doesNotMatch(organize, /saveFile|readReceipt|ocr\(|markEvidenceUnorganized|status\s*=/);
  assert.match(phase2, /data-organize-unorganized/);
  assert.match(phase2.slice(phase2.indexOf('async function ocr')), /readReceipt/);
});

test('organizing calls the existing preview renderer with the same evidence ID and saved blob', async () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  const source = phase2.slice(phase2.indexOf('async function organizeUnorganizedEvidence'), phase2.indexOf('async function ocr'));
  const evidence = { id: 'same-evidence', status: 'unorganized', evidenceNumber: 'E-001', fileName: 'saved.jpg', ocr: { status: 'not_started' } };
  const blob = { name: 'saved.jpg', type: 'image/jpeg' }; const calls = { getFile: [], preview: [], reset: 0, scrolled: 0 };
  const nodes = { '#filemsg': {}, '#filemeta': {}, '#cancelEvidence': { classList: { add() {} } }, '#saveUnorganized': {}, '#preview': { scrollIntoView() { calls.scrolled += 1; } } };
  const organize = new Function('emap', 'getFile', '$', 'reset', 'URL', 'renderPreview', 'previewUrl', 'pendingEvidenceId', 'pendingFile', 'pendingOcr', `${source}; return organizeUnorganizedEvidence;`)(
    () => new Map([[evidence.id, evidence]]), async (id) => { calls.getFile.push(id); return blob; }, (selector) => nodes[selector], async () => { calls.reset += 1; }, { revokeObjectURL() {} }, (container, file, label) => { calls.preview.push([container, file, label]); return 'blob:preview'; }, null, null, null, null);
  await organize(evidence.id);
  assert.deepEqual(calls.getFile, [evidence.id]); assert.equal(calls.reset, 1); assert.deepEqual(calls.preview, [[nodes['#preview'], blob, evidence.fileName]]); assert.equal(calls.scrolled, 1);
});

test('evidence list and unorganized box use closed native details with derived counts only', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  const collapsible = phase2.slice(phase2.indexOf('function updateCollapsibleSummary'), phase2.indexOf('function persist'));
  const render = phase2.slice(phase2.indexOf('function render()'), phase2.indexOf('async function edit'));
  assert.match(collapsible, /document\.createElement\(['"]details['"]\)/);
  assert.match(collapsible, /['"]証拠一覧['"]/);
  assert.match(collapsible, /['"]未整理BOX['"]/);
  assert.doesNotMatch(collapsible, /\.open\s*=\s*true|localStorage|saveFile|readReceipt/);
  assert.match(render, /updateCollapsibleSummary\(evidenceDetails,evidences\.length\)/);
  assert.match(render, /updateCollapsibleSummary\(unorganizedDetails,unorganized\.length\)/);
  assert.match(render, /unorganizedEvidences\(evidences\)/);
});

test('legacy evidence remains attached when no lifecycle status exists', () => {
  assert.equal(createEvidenceDocument({ evidenceNumber: 'E-001' }).status, 'attached');
});

test('attaching a saved draft never writes its blob twice and changes status', () => {
  const evidence = { id: 'e', status: 'draft', ocr: { status: 'not_started' } };
  const ids = attachDraftEvidence({ evidenceIds: ['e'], evidenceId: 'e', evidences: [evidence], ocr: { status: 'completed' } });
  assert.deepEqual(ids, ['e']); assert.equal(evidence.status, 'attached'); assert.equal(evidence.ocr.status, 'completed');
});

test('draft cancellation removes the blob and evidence metadata', async () => {
  const deleted = []; const result = await discardDraftEvidence({ evidenceId: 'e', evidences: [{ id: 'e', status: 'draft' }], deleteFile: async (id) => deleted.push(id) });
  assert.deepEqual(deleted, ['e']); assert.deepEqual(result, []);
});

test('cancelling an attached original cannot delete its blob', async () => {
  const deleted = []; const original = [{ id: 'e', status: 'attached' }];
  const result = await discardDraftEvidence({ evidenceId: 'e', evidences: original, deleteFile: async (id) => deleted.push(id) });
  assert.equal(result, original); assert.deepEqual(deleted, []);
});

test('latest draft is restored after reload and attached evidence is ignored', () => {
  assert.equal(latestDraftEvidence([{ id: 'old', status: 'draft', createdAt: '2026-01-01' }, { id: 'new', status: 'draft', createdAt: '2026-01-02' }, { id: 'a', status: 'attached', createdAt: '2026-01-03' }]).id, 'new');
});

test('receipt deletion removes exclusive evidence but preserves shared evidence', async () => {
  const deleted = []; const result = await deleteReceiptAndExclusiveEvidence({ receiptId: 'r1', records: [{ id: 'r1', evidenceIds: ['shared', 'only'] }, { id: 'r2', evidenceIds: ['shared'] }], evidences: [{ id: 'shared' }, { id: 'only' }], deleteFile: async (id) => deleted.push(id) });
  assert.deepEqual(deleted, ['only']); assert.deepEqual(result.records.map((record) => record.id), ['r2']); assert.deepEqual(result.evidences.map((evidence) => evidence.id), ['shared']);
});
