import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpenseRecord, createReceiptItem } from '../src/models.js';
import { receiptClaimTotal, receiptItemTotal, receiptTotal } from '../src/calculations.js';
import { calculateTaxInclusiveAmount } from '../src/item-tax.js';
import { buildWorkbookData } from '../src/output-models.js';
import { makeReceiptItemsCsv } from '../src/export.js';

test('legacy ReceiptItem defaults tax data without changing its final amount', () => {
  const item = createReceiptItem({ id:'legacy', amount:184, submissionStatus:'included' });
  assert.equal(item.amount, 184); assert.equal(item.taxRate, 'unknown'); assert.equal(item.amountInputMode, 'tax_included');
});

test('tax-exclusive reference calculations use one-yen rounding for 8 and 10 percent only', () => {
  assert.equal(calculateTaxInclusiveAmount(100, '8'), 108);
  assert.equal(calculateTaxInclusiveAmount(100, '10'), 110);
  assert.equal(calculateTaxInclusiveAmount(101, '8'), 109);
  ['exempt','out_of_scope','unknown'].forEach((rate) => assert.equal(calculateTaxInclusiveAmount(100, rate), null));
});

test('tax metadata never recalculates final item amount or receipt and claim totals', () => {
  const item = createReceiptItem({ amount:184, taxRate:'8', amountInputMode:'tax_included', submissionStatus:'included' });
  const record = createExpenseRecord({ amount:184, receiptTotalAmount:184, items:[item] });
  const editedTax = createReceiptItem({ ...item, taxRate:'10' });
  const changed = createExpenseRecord({ ...record, items:[editedTax] });
  assert.equal(changed.items[0].amount, 184); assert.equal(receiptTotal(changed), 184); assert.equal(receiptItemTotal(changed), 184); assert.equal(receiptClaimTotal(changed), 184);
});

test('Excel and receipt-item CSV include tax information while retaining amount columns', () => {
  const item = createReceiptItem({ id:'item', amount:108, taxRate:'8', amountInputMode:'tax_excluded', submissionStatus:'included', productName:'水' });
  const record = createExpenseRecord({ id:'record', amount:108, receiptTotalAmount:108, items:[item] });
  const workbook = buildWorkbookData([record], [], []); const csv = makeReceiptItemsCsv([record], new Map());
  assert.deepEqual(workbook.receiptItems[0].slice(7, 10), ['金額','税率','金額入力区分']);
  assert.deepEqual(workbook.receiptItems[1].slice(7, 10), [108,'8%','税抜']);
  assert.match(csv, /税率/); assert.match(csv, /金額入力区分/); assert.match(csv, /8%/); assert.match(csv, /税抜/);
});
