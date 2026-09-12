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


export function money(value) { const number = Number(value); return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0; }
export function receiptItemTotal(record) { return money((Array.isArray(record?.items) ? record.items : []).reduce((total, item) => total + Math.max(0, Number(item?.amount) || 0), 0)); }
export function receiptClaimTotal(record) { return money((Array.isArray(record?.items) ? record.items : []).filter((item) => item?.submissionStatus === 'included').reduce((total, item) => total + Math.max(0, Number(item?.amount) || 0), 0)); }
export function receiptTotal(record) { return money(record?.receiptTotalAmount ?? record?.amount?.value ?? record?.amount ?? 0); }
export function receiptDifference(record) { return money(receiptTotal(record) - receiptItemTotal(record)); }
export function categorySubtotals(records) { const totals = new Map(); (Array.isArray(records) ? records : []).forEach((record) => (record.items || []).forEach((item) => { if (item?.submissionStatus !== 'included') return; const category = String(item.category || ''); totals.set(category, money((totals.get(category) || 0) + Math.max(0, Number(item.amount) || 0))); })); return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right, 'ja')).map(([category, amount]) => ({ category, amount })); }
export function calculateReceiptSummary(records) { const source = Array.isArray(records) ? records : []; return { receiptCount: source.length, receiptTotalAmount: money(source.reduce((total, record) => total + receiptTotal(record), 0)), itemTotalAmount: money(source.reduce((total, record) => total + receiptItemTotal(record), 0)), claimTotalAmount: money(source.reduce((total, record) => total + receiptClaimTotal(record), 0)), categorySubtotals: categorySubtotals(source) }; }
