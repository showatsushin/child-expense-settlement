import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEvidenceDocument } from '../src/models.js';
import { buildWorkbookData, buildWordDocumentModel } from '../src/output-models.js';
import { makeCsv, makePrintHtml, makeReceiptItemsCsv, makeReceiptSummaryCsv } from '../src/export.js';
import { applySubmissionNumbering, assertUniqueSubmissionEvidenceNumbers, buildSubmissionNumberingPreview, formatSubmissionEvidenceNumber } from '../src/submission-evidence-number.js';

const records = [
  { id:'late', paidDate:'2026-01-08', evidenceIds:['e3'], items:[] },
  { id:'same-a', paidDate:'2026-01-05', evidenceIds:['e2'], items:[] },
  { id:'early', paidDate:'2026-01-03', evidenceIds:['e1'], items:[] },
  { id:'same-b', paidDate:'2026-01-05', evidenceIds:['e4'], items:[] },
];
const evidences = [
  createEvidenceDocument({ id:'e1', evidenceNumber:'E-014', createdAt:'2026-09-01T00:00:00.000Z', status:'attached' }),
  createEvidenceDocument({ id:'e2', evidenceNumber:'E-021', createdAt:'2026-09-03T00:00:00.000Z', status:'attached' }),
  createEvidenceDocument({ id:'e3', evidenceNumber:'E-008', createdAt:'2026-09-02T00:00:00.000Z', status:'attached' }),
  createEvidenceDocument({ id:'e4', evidenceNumber:'E-009', createdAt:'2026-09-04T00:00:00.000Z', status:'attached' }),
  createEvidenceDocument({ id:'draft', evidenceNumber:'E-999', createdAt:'2026-09-05T00:00:00.000Z', status:'draft' }),
];

test('legacy evidence without a submission number remains readable and schema stays additive', () => {
  const evidence = createEvidenceDocument({ id:'legacy', evidenceNumber:'E-001', fileName:'old.jpg' });
  assert.equal(evidence.evidenceNumber, 'E-001'); assert.equal(evidence.submissionEvidenceNumber, null);
});

test('bulk numbering is purchase-date ascending, deterministic on the same day, and never changes E numbers', () => {
  const preview = buildSubmissionNumberingPreview(records, evidences);
  assert.deepEqual(preview.map((entry) => [entry.evidenceNumber, entry.purchaseDate, formatSubmissionEvidenceNumber(entry.next)]), [['E-014','2026-01-03','甲第1号証'],['E-021','2026-01-05','甲第2号証'],['E-009','2026-01-05','甲第3号証'],['E-008','2026-01-08','甲第4号証']]);
  const applied = applySubmissionNumbering(evidences, preview);
  assert.deepEqual(applied.map((evidence) => evidence.evidenceNumber), evidences.map((evidence) => evidence.evidenceNumber));
  assert.equal(applied.find((evidence) => evidence.id === 'draft').submissionEvidenceNumber, null);
  assert.deepEqual(buildSubmissionNumberingPreview(records, evidences), preview);
});

test('manual structured numbers format with future sub-number support and reject duplicates', () => {
  assert.equal(formatSubmissionEvidenceNumber({ prefix:'甲', number:1, subNumber:null }), '甲第1号証'); assert.equal(formatSubmissionEvidenceNumber({ prefix:'甲', number:1, subNumber:2 }), '甲第1号証の2');
  assert.throws(() => assertUniqueSubmissionEvidenceNumbers([{ id:'a', evidenceNumber:'E-001', submissionEvidenceNumber:{ prefix:'甲', number:1, subNumber:null } },{ id:'b', evidenceNumber:'E-002', submissionEvidenceNumber:{ prefix:'甲', number:1, subNumber:null } }]), /重複/);
});

test('Excel, CSV, Word, print, and submission material expose both number concepts', () => {
  const evidence = { id:'e', evidenceNumber:'E-001', submissionEvidenceNumber:{ prefix:'甲', number:1, subNumber:null }, fileName:'a.jpg', ocr:{} };
  const record = { id:'r', evidenceIds:['e'], paidDate:'2026-01-01', amount:{ value:100 }, vendor:{ value:'店' }, childId:{ value:'c' }, category:{ value:'費目' }, items:[{ amount:100, productName:'品', purpose:{ value:'目的' }, submissionStatus:'included' }] };
  const byId = new Map([['e', evidence]]); const workbook = buildWorkbookData([record], [evidence], [{ id:'c', name:'子' }]); const word = buildWordDocumentModel([record], [evidence], [], '全期間');
  assert.deepEqual(workbook.settlement[0].slice(0,2), ['内部管理番号','提出用証拠番号']); assert.deepEqual(workbook.settlement[1].slice(0,2), ['E-001','甲第1号証']); assert.deepEqual(workbook.evidence[1].slice(0,2), ['E-001','甲第1号証']); assert.match(word.receiptRows[0].evidence, /甲第1号証/); assert.match(word.receiptRows[0].evidence, /E-001/);
  [makeCsv([record], byId, new Map([['c',{ name:'子' }]])),makeReceiptSummaryCsv([record], byId),makeReceiptItemsCsv([record], byId),makePrintHtml([record], byId, new Map([['c',{ name:'子' }]]), '全期間')].forEach((output) => { assert.match(output, /内部管理番号/); assert.match(output, /提出用証拠番号/); assert.match(output, /甲第1号証/); });
  const material = readFileSync(new URL('../evidence-export.js', import.meta.url), 'utf8'); assert.match(material, /submissionNumber\(evidence\)/); assert.match(material, /内部管理番号/);
});

test('period-scoped submission export is available and preflights originals before rendering', () => {
  const material = readFileSync(new URL('../evidence-export.js', import.meta.url), 'utf8');
  assert.match(material, /renderSubmissionExport/);
  assert.match(material, /requireOriginals/);
  assert.match(material, /原本が見つかりません/);
  assert.match(material, /submission-evidence-/);
});

test('submission print keeps each original evidence heading and image in one print unit', () => {
  const material = readFileSync(new URL('../evidence-export.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(material, /original-evidence-content/); assert.match(material, /original-evidence-header/); assert.match(material, /original-evidence-image/);
  assert.match(css, /original-evidence-content\{break-inside:avoid;page-break-inside:avoid/);
  assert.match(css, /original-evidence-header\{break-after:avoid;page-break-after:avoid/);
  assert.match(css, /original-evidence-image img\{display:block;max-width:100%;height:auto;max-height:210mm/);
  assert.match(css, /submitted-evidence\{break-after:page;page-break-after:always/);
});

test('numbering UI previews before confirmation, warns on reassignment, and supports individual edits', () => {
  const ui = readFileSync(new URL('../submission-numbering-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /提出用証拠番号を一括採番/); assert.match(ui, /プレビューを表示しています。まだ保存していません。/); assert.match(ui, /既存の提出用証拠番号があります。再採番すると番号が変更されます。/); assert.match(ui, /個別に編集/); assert.match(ui, /assertUniqueSubmissionEvidenceNumbers/);
});
