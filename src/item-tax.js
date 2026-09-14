export const TAX_RATE_OPTIONS = Object.freeze(['8', '10', 'exempt', 'out_of_scope', 'unknown']);
export const AMOUNT_INPUT_MODES = Object.freeze(['tax_included', 'tax_excluded']);

export const taxRateLabel = (value) => ({ '8':'8%', '10':'10%', exempt:'非課税', out_of_scope:'対象外', unknown:'不明' })[value] || '不明';
export const amountInputModeLabel = (value) => value === 'tax_excluded' ? '税抜' : '税込';
export const normalizeTaxRate = (value) => TAX_RATE_OPTIONS.includes(value) ? value : 'unknown';
export const normalizeAmountInputMode = (value) => AMOUNT_INPUT_MODES.includes(value) ? value : 'tax_included';

// A reference amount only.  ReceiptItem.amount remains the human-confirmed
// final amount and is changed only by an explicit UI action.
export function calculateTaxInclusiveAmount(taxExclusiveAmount, taxRate) {
  const amount = Number(taxExclusiveAmount); const rate = normalizeTaxRate(taxRate);
  if (!Number.isFinite(amount) || amount < 0 || !['8', '10'].includes(rate)) return null;
  return Math.round(amount * (1 + Number(rate) / 100));
}
