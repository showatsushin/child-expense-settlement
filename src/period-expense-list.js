import { receiptClaimTotal, receiptTotal } from './calculations.js';

const fieldValue = (value) => value?.value ?? value ?? '';

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
  const rows = (Array.isArray(records) ? records : [])
    .filter((record) => {
      const paidDate = String(record?.paidDate || '');
      return (!start || (paidDate && paidDate >= start)) && (!end || (paidDate && paidDate <= end));
    })
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
  }, { rows: [], receiptTotal: 0, submissionTotal: 0, otherBurdenAmount: 0 });
}
