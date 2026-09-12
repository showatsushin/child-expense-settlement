import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenseRecord, createReceiptItem } from '../src/models.js';
import { migratePhase1Data, SCHEMA_VERSION } from '../src/migrations.js';
import { calculateReceiptSummary, receiptDifference, receiptClaimTotal, receiptItemTotal } from '../src/calculations.js';
import { extractReceiptItemCandidates } from '../src/receipt-item-ocr.js';
import { buildEvidenceManifest, receiptEvidenceRows } from '../src/evidence-manifest.js';
import { buildSubmissionBundles } from '../src/submission-bundles.js';
import { buildWorkbookData } from '../src/output-models.js';
import { databaseNameForUser } from '../src/user-storage.js';

const included = (data) => createReceiptItem({ submissionStatus: 'included', ...data });
const excluded = (data) => createReceiptItem({ submissionStatus: 'excluded', ...data });
const review = (data) => createReceiptItem({ submissionStatus: 'review', ...data });

test('receipt totals keep printed total, item total, and claim total separate', () => {
  const receipt = createExpenseRecord({ id: 'r', amount: 1480, receiptTotalAmount: 1480, items: [
    included({ amount: 400, category: '飲料水' }),
    included({ amount: 680, category: 'リハビリ・機能訓練用品' }),
    excluded({ amount: 400 }),
  ] });
  assert.equal(receiptItemTotal(receipt), 1480);
  assert.equal(receiptClaimTotal(receipt), 1080);
  assert.equal(receiptDifference(receipt), 0);
});
test('review and excluded items are never included in claim total', () => {
  const receipt = createExpenseRecord({ amount: 100, items: [included({ amount: 40 }), excluded({ amount: 30 }), review({ amount: 30 })] });
  assert.equal(receiptClaimTotal(receipt), 40);
});
test('category subtotals use included items only and support multiple categories', () => {
  const summary = calculateReceiptSummary([createExpenseRecord({ amount: 30, items: [included({ amount: 10, category: '飲料水' }), included({ amount: 20, category: '衛生用品' })] })]);
  assert.deepEqual(summary.categorySubtotals.map((item) => item.amount), [10, 20]);
});
test('free-form categories are preserved for aggregation', () => {
  const summary = calculateReceiptSummary([createExpenseRecord({ amount: 100, items: [included({ amount: 100, category: '感覚調整用品' })] })]);
  assert.equal(summary.categorySubtotals[0].category, '感覚調整用品');
  assert.equal(summary.categorySubtotals[0].amount, 100);
});
test('item categories start empty and are not coerced to その他', () => {
  const item = createReceiptItem({ productName: '未選択商品', amount: 100 });
  assert.equal(item.category, '');
  const summary = calculateReceiptSummary([createExpenseRecord({ amount: 100, items: [included({ amount: 100, category: item.category })] })]);
  assert.equal(summary.categorySubtotals[0].category, '');
});
test('zero and decimal values are safe and do not become NaN', () => {
  const receipt = createExpenseRecord({ amount: 0, receiptTotalAmount: 0, items: [included({ amount: 'bad' }), included({ amount: 1.005 })] });
  assert.equal(receiptItemTotal(receipt), 1.01);
  assert.equal(Number.isNaN(receiptDifference(receipt)), false);
});
test('legacy ExpenseRecord migrates to one receipt item without changing evidence number', () => {
  const state = migratePhase1Data({ schemaVersion: 2, records: [{ id: 'old', evidenceIds: ['e'], amount: { value: 1200 }, category: { value: '医療費' }, reason: { value: '旧理由' }, parentingExpenseStatus: { value: '対象' } }], evidences: [{ id: 'e', evidenceNumber: 'E-001', fileName: 'a.jpg' }] });
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.records[0].receiptTotalAmount, 1200);
  assert.equal(state.records[0].items.length, 1);
  assert.equal(state.records[0].items[0].purpose.value, '旧理由');
  assert.equal(state.records[0].items[0].submissionStatus, 'included');
  assert.equal(state.evidences[0].evidenceNumber, 'E-001');
});
test('OCR item candidates retain line order and never return invalid amount', () => {
  const items = extractReceiptItemCandidates('飲料水 400\n合計 1480\n用品 680');
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.lineOrder), [1, 3]);
  assert.ok(items.every((item) => Number.isFinite(item.amount)));
});
test('evidence manifest supports multiple originals, PDF and missing original metadata', () => {
  const records = [createExpenseRecord({ id: 'r', amount: 100, evidenceIds: ['b', 'a'], items: [included({ amount: 100 })] })];
  const entries = buildEvidenceManifest(records, [{ id: 'b', evidenceNumber: 'E-002', fileName: 'b.pdf', mimeType: 'application/pdf' }, { id: 'a', evidenceNumber: 'E-001', fileName: 'a.jpg', mimeType: 'image/jpeg' }]);
  assert.deepEqual(entries.map((entry) => entry.evidence.evidenceNumber), ['E-001', 'E-002']);
  assert.equal(entries[0].receipts[0].id, 'r');
  assert.deepEqual(receiptEvidenceRows(records, entries.map((entry) => entry.evidence))[0].evidenceNumbers, ['E-002', 'E-001']);
});
test('submission bundles remain in evidence-number order and keep each receipt with its original', () => {
  const records = [
    createExpenseRecord({ id: 'r2', evidenceIds: ['b'], amount: 200, items: [included({ productName: 'two', amount: 200 })] }),
    createExpenseRecord({ id: 'r1', evidenceIds: ['a'], amount: 100, items: [included({ productName: 'one', amount: 100 })] }),
  ];
  const evidences = [
    { id: 'b', evidenceNumber: 'E-002', fileName: 'two.jpg', mimeType: 'image/jpeg' },
    { id: 'a', evidenceNumber: 'E-001', fileName: 'one.jpg', mimeType: 'image/jpeg' },
  ];
  const bundles = buildSubmissionBundles(records, evidences);
  assert.deepEqual(bundles.map((bundle) => bundle.evidence.evidenceNumber), ['E-001', 'E-002']);
  assert.deepEqual(bundles.map((bundle) => bundle.receipts[0].id), ['r1', 'r2']);
  assert.deepEqual(bundles.map((bundle) => bundle.receipts[0].items.map((item) => item.productName)), [['one'], ['two']]);
});
test('submission bundles never mix records and can be scoped to one receipt', () => {
  const records = [
    createExpenseRecord({ id: 'r1', evidenceIds: ['shared'], amount: 100, items: [included({ productName: 'first', amount: 100 })] }),
    createExpenseRecord({ id: 'r2', evidenceIds: ['shared'], amount: 200, items: [included({ productName: 'second-a', amount: 100 }), included({ productName: 'second-b', amount: 100 })] }),
  ];
  const evidences = [{ id: 'shared', evidenceNumber: 'E-001', fileName: 'shared.jpg', mimeType: 'image/jpeg' }];
  const all = buildSubmissionBundles(records, evidences);
  assert.deepEqual(all.map((bundle) => bundle.receipts.map((record) => record.id)), [['r1'], ['r2']]);
  const one = buildSubmissionBundles([records[1]], evidences);
  assert.deepEqual(one.map((bundle) => bundle.receipts[0].id), ['r2']);
  assert.deepEqual(one[0].receipts[0].items.map((item) => item.productName), ['second-a', 'second-b']);
});
test('workbook contains receipt items, category totals, evidence list and summary', () => {
  const data = buildWorkbookData([createExpenseRecord({ amount: 100, evidenceIds: ['e'], items: [included({ productName: 'x', amount: 100, category: '飲料水' })] })], [{ id: 'e', evidenceNumber: 'E-001', fileName: 'x.jpg', ocr: {} }], []);
  assert.equal(data.receiptItems[0][0], '証拠番号');
  assert.equal(data.category[1][1], 100);
  assert.equal(data.evidence[1][0], 'E-001');
});
test('user-specific IndexedDB names cannot collide across users', () => {
  assert.notEqual(databaseNameForUser('user-a'), databaseNameForUser('user-b'));
  assert.match(databaseNameForUser('user-a'), /user-a$/);
});
test('saved receipt item preserves OCR source lines for audit', () => {
  const item = createReceiptItem({ productName: 'water', amount: 100, sourceLineNumbers: [3, 4, 0, 'bad'], sourceLines: ['water', '100'] });
  assert.deepEqual(item.sourceLineNumbers, [3, 4]);
  assert.deepEqual(item.sourceLines, ['water', '100']);
});
