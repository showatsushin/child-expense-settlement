import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceDocument } from '../src/models.js';
import { saveDraftEvidence, attachDraftEvidence, discardDraftEvidence, latestDraftEvidence, deleteReceiptAndExclusiveEvidence } from '../src/evidence-lifecycle.js';

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
