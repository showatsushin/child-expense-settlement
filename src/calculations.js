export function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function normalizeRate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0;
}

export function calculateOtherBurdenAmount(amount, otherBurdenRate) {
  return Math.round(toNonNegativeNumber(amount) * normalizeRate(otherBurdenRate) / 100);
}

// Phase 1 policy: display and store no negative unpaid balance; overpayment is not lost in alreadyPaidAmount.
export function calculateOutstandingAmount(otherBurdenAmount, alreadyPaidAmount) {
  return Math.max(0, calculateOtherBurdenAmount(otherBurdenAmount, 100) - toNonNegativeNumber(alreadyPaidAmount));
}

export function complementRate(rate) { return 100 - normalizeRate(rate); }

export function nextEvidenceNumber(evidences) {
  const max = (Array.isArray(evidences) ? evidences : []).reduce((highest, item) => {
    const match = String(item?.evidenceNumber || '').match(/^E-(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `E-${String(max + 1).padStart(3, '0')}`;
}

export function calculateSummary(records) {
  return (Array.isArray(records) ? records : []).reduce((summary, record) => {
    summary.count += 1; summary.amount += toNonNegativeNumber(record.amount?.value ?? record.amount);
    summary.other += toNonNegativeNumber(record.otherBurdenAmount); summary.paid += toNonNegativeNumber(record.alreadyPaidAmount);
    summary.outstanding += toNonNegativeNumber(record.outstandingAmount);
    if ((record.parentingExpenseStatus?.value ?? record.parentingExpenseStatus) === '要確認' || (record.specialExpenseStatus?.value ?? record.specialExpenseStatus) === '要確認' || (record.settlementStatus?.value ?? record.settlementStatus) === '未確認') summary.review += 1;
    return summary;
  }, { count: 0, amount: 0, other: 0, paid: 0, outstanding: 0, review: 0 });
}

