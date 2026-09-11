export const SOURCE_TYPES = ['manual', 'ocr', 'ocr_rule', 'template', 'ai', 'imported'];

export function sourced(value = '', source = 'manual', confidence = null) {
  return { value, source: SOURCE_TYPES.includes(source) ? source : 'manual', confidence };
}

export const DEFAULT_CHILDREN = [
  { id: 'child-1', name: '子1' },
  { id: 'child-2', name: '子2' },
];

export const CATEGORY_OPTIONS = ['食費', '衣類', '医療費', '教育費', '学校費', '保育費', '習い事', '交通費', '通信費', '日用品', '住居関連', '行事費', '保険', 'その他'];
// Purchase-item categories are distinct from the existing accounting categories.
export const ITEM_CATEGORY_OPTIONS = ['付き添い寝具レンタル代', '飲料水', 'リハビリ・機能訓練用品', '食料品', '服薬補助用品', '入浴補助用品', '療養・介助用品', '衛生用品', '収納用品', 'その他'];
export const SUBMISSION_STATUS_OPTIONS = ['included', 'excluded', 'review'];
export const PARENTING_OPTIONS = ['対象', '対象外', '要確認'];
export const SPECIAL_OPTIONS = ['該当', '非該当', '要確認'];
export const SETTLEMENT_OPTIONS = ['未確認', '確認済', '未清算', '一部清算', '清算済', '争点', '対象外'];

export function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function createEvidenceDocument({ id = makeId('evidence'), evidenceNumber, fileName, mimeType, size = 0, createdAt = new Date().toISOString(), ocr, status = 'attached' } = {}) {
  return { id, evidenceNumber, fileName: String(fileName || ''), mimeType: String(mimeType || ''), size: Number(size) || 0, createdAt, status: ['draft','attached'].includes(status) ? status : 'attached', ocr: normalizeOcr(ocr) };
}

function normalizePreprocessing(value) {
  if (!value || typeof value !== 'object') return null;
  const number = (input) => Number.isFinite(Number(input)) ? Number(input) : null;
  return { applied: Boolean(value.applied), mode: String(value.mode || 'original').slice(0, 80), width: number(value.width), height: number(value.height), scale: number(value.scale) };
}
function normalizeItemExtraction(value) {
  if (!value || typeof value !== 'object') return null;
  const number = (input, fallback = 0) => Number.isFinite(Number(input)) ? Number(input) : fallback;
  const nullableNumber = (input) => Number.isFinite(Number(input)) ? Number(input) : null;
  return {
    status: ['success', 'partial', 'low_confidence', 'failed'].includes(value.status) ? value.status : 'failed',
    candidateCount: Math.max(0, Math.floor(number(value.candidateCount))),
    lowConfidenceCount: Math.max(0, Math.floor(number(value.lowConfidenceCount))),
    lineCount: Math.max(0, Math.floor(number(value.lineCount))),
    monetaryLineCount: Math.max(0, Math.floor(number(value.monetaryLineCount))),
    receiptTotalAmount: nullableNumber(value.receiptTotalAmount),
    itemTotalAmount: number(value.itemTotalAmount),
    difference: nullableNumber(value.difference),
    totalConsistent: Boolean(value.totalConsistent)
  };
}

export function normalizeOcr(ocr) {
  const status = ['not_started', 'processing', 'completed', 'failed'].includes(ocr?.status) ? ocr.status : 'not_started';
  return {
    status,
    rawText: String(ocr?.rawText || ''),
    correctedText: String(ocr?.correctedText || ''),
    processedAt: ocr?.processedAt || null,
    engine: String(ocr?.engine || ''),
    confidence: Number.isFinite(Number(ocr?.confidence)) ? Number(ocr.confidence) : null,
    preprocessing: normalizePreprocessing(ocr?.preprocessing),
    itemExtraction: normalizeItemExtraction(ocr?.itemExtraction)
  };
}
export function createExpenseRecord(data = {}) {
  const now = new Date().toISOString();
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const withSource = (candidate, fallback = '') => sourced(candidate?.value ?? candidate ?? fallback, candidate?.source, candidate?.confidence ?? null);
  return {
    id: data.id || makeId('expense'),
    evidenceIds: Array.isArray(data.evidenceIds) ? data.evidenceIds : [],
    paidDate: data.paidDate || '', amount: withSource(data.amount, 0),
    vendor: withSource(data.vendor), category: withSource(data.category),
    childId: withSource(data.childId),
    parentingExpenseStatus: withSource(data.parentingExpenseStatus, '要確認'),
    specialExpenseStatus: withSource(data.specialExpenseStatus, '要確認'),
    payer: withSource(data.payer, '自分'), targetPeriod: data.targetPeriod || '',
    reason: withSource(data.reason), selfBurdenRate: number(data.selfBurdenRate, 0),
    otherBurdenRate: number(data.otherBurdenRate, 0), otherBurdenAmount: number(data.otherBurdenAmount, 0),
    alreadyPaidAmount: number(data.alreadyPaidAmount, 0), outstandingAmount: number(data.outstandingAmount, 0),
    settlementStatus: sourced(data.settlementStatus?.value ?? data.settlementStatus ?? '未確認'), notes: data.notes || '',
    receiptTotalAmount: number(data.receiptTotalAmount ?? data.amount?.value ?? data.amount, 0),
    items: sanitizeReceiptItems(data.items, data.id || ''),
    createdAt: data.createdAt || now, updatedAt: now,
  };
}

export function createReceiptItem(data = {}, receiptId = '') {
  const now = new Date().toISOString(); const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const category = ITEM_CATEGORY_OPTIONS.includes(data.category) ? data.category : 'その他'; const submissionStatus = SUBMISSION_STATUS_OPTIONS.includes(data.submissionStatus) ? data.submissionStatus : 'review';
  return { id: data.id || makeId('receipt-item'), receiptId: String(data.receiptId || receiptId || ''), lineOrder: Math.max(1, Math.floor(number(data.lineOrder, 1))), productName: String(data.productName || ''), quantity: Math.max(0, number(data.quantity, 1)), unitPrice: Math.max(0, number(data.unitPrice, 0)), amount: Math.max(0, number(data.amount, 0)), category, purpose: sourced(data.purpose?.value ?? data.purpose ?? '', data.purpose?.source, data.purpose?.confidence ?? null), submissionStatus, source: SOURCE_TYPES.includes(data.source) ? data.source : 'manual', confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : null, basis: Array.isArray(data.basis) ? data.basis.filter((item) => typeof item === 'string').map(String).slice(0, 12) : [], sourceLineNumbers: Array.isArray(data.sourceLineNumbers) ? data.sourceLineNumbers.map(Number).filter(Number.isInteger).filter((value) => value > 0).slice(0, 20) : [], sourceLines: Array.isArray(data.sourceLines) ? data.sourceLines.filter((line) => typeof line === 'string').map(String).slice(0, 20) : [], notes: String(data.notes || ''), createdAt: data.createdAt || now, updatedAt: now };
}
export function sanitizeReceiptItems(value, receiptId = '') { return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').map((item, index) => createReceiptItem({ ...item, lineOrder: item.lineOrder ?? index + 1 }, receiptId)) : []; }
export function sanitizeExpenseRecords(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').map(createExpenseRecord) : [];
}
