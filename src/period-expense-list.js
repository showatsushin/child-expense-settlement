import { receiptClaimTotal, receiptTotal } from './calculations.js';

const fieldValue = (value) => value?.value ?? value ?? '';

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

export function isValidPurchaseDate(value) {
  const date = String(value || '');
  if (!DATE_INPUT.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function validatePeriod({ startDate = '', endDate = '' } = {}) {
  const start = String(startDate || ''); const end = String(endDate || '');
  if (!start || !end) return { valid: false, message: '開始日と終了日を指定してください。' };
  if (!isValidPurchaseDate(start) || !isValidPurchaseDate(end)) return { valid: false, message: '開始日または終了日が不正です。' };
  if (start > end) return { valid: false, message: '開始日は終了日以前にしてください。' };
  return { valid: true, startDate: start, endDate: end };
}

// The single source of truth for every period-scoped export.  Invalid and
// missing purchase dates are always reported separately, never silently
// included in a selected period.
export function filterRecordsByPeriod(records, { startDate = '', endDate = '' } = {}) {
  const selectedRecords = []; const excludedUnknownDateRecords = [];
  for (const record of Array.isArray(records) ? records : []) {
    const purchaseDate = String(record?.paidDate || '');
    if (!isValidPurchaseDate(purchaseDate)) { excludedUnknownDateRecords.push(record); continue; }
    if ((!startDate || purchaseDate >= startDate) && (!endDate || purchaseDate <= endDate)) selectedRecords.push(record);
  }
  return { selectedRecords, excludedUnknownDateRecords };
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function monthDateRange(referenceDate = new Date(), monthOffset = 0) {
  const firstDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + monthOffset, 1);
  const lastDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + monthOffset + 1, 0);
  return { start: toDateInputValue(firstDay), end: toDateInputValue(lastDay) };
}

export function buildPeriodExpenseList(records, { start = '', end = '' } = {}) {
  const { selectedRecords, excludedUnknownDateRecords } = filterRecordsByPeriod(records, { startDate:start, endDate:end });
  const rows = selectedRecords
    .sort((left, right) => String(left?.paidDate || '').localeCompare(String(right?.paidDate || '')))
    .map((record) => ({
      record,
      paidDate: String(record?.paidDate || ''),
      vendor: String(fieldValue(record?.vendor)),
      category: String(fieldValue(record?.category)),
      legacyReason: String(fieldValue(record?.reason)),
      receiptTotal: receiptTotal(record),
      submissionTotal: receiptClaimTotal(record),
      otherBurdenRate: Number(record?.otherBurdenRate) || 0,
      otherBurdenAmount: Number(record?.otherBurdenAmount) || 0,
    }));

  return rows.reduce((result, row) => {
    result.rows.push(row);
    result.receiptTotal += row.receiptTotal;
    result.submissionTotal += row.submissionTotal;
    result.otherBurdenAmount += row.otherBurdenAmount;
    return result;
  }, { rows: [], receiptTotal: 0, submissionTotal: 0, otherBurdenAmount: 0, excludedUnknownDateRecords });
}
