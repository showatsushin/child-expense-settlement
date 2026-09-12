import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPeriodExpenseList, monthDateRange } from '../src/period-expense-list.js';

test('monthDateRange returns the requested calendar month', () => {
  assert.deepEqual(monthDateRange(new Date(2026, 8, 12)), { start: '2026-09-01', end: '2026-09-30' });
  assert.deepEqual(monthDateRange(new Date(2026, 8, 12), -1), { start: '2026-08-01', end: '2026-08-31' });
});

test('buildPeriodExpenseList filters by payment date and totals receipt-level values', () => {
  const list = buildPeriodExpenseList([
    { id: 'late', paidDate: '2026-09-30', vendor: { value: 'B' }, category: { value: '費目B' }, reason: '自由記載', amount: { value: 700 }, otherBurdenRate: 100, otherBurdenAmount: 700, items: [{ amount: 400, submissionStatus: 'included' }, { amount: 300, submissionStatus: 'excluded' }] },
    { id: 'outside', paidDate: '2026-10-01', amount: { value: 900 }, otherBurdenAmount: 900 },
    { id: 'early', paidDate: '2026-09-01', vendor: { value: 'A' }, category: { value: '費目A' }, reason: '候補', receiptTotalAmount: 500, otherBurdenRate: 50, otherBurdenAmount: 250, items: [{ amount: 500, submissionStatus: 'included' }] },
  ], { start: '2026-09-01', end: '2026-09-30' });

  assert.deepEqual(list.rows.map((row) => row.record.id), ['early', 'late']);
  assert.equal(list.rows[0].legacyReason, '候補');
  assert.equal(list.receiptTotal, 1200);
  assert.equal(list.submissionTotal, 900);
  assert.equal(list.otherBurdenAmount, 950);
});
