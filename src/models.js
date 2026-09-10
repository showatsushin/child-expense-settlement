export const SOURCE_TYPES = ['manual', 'ocr', 'ai', 'imported'];

export function sourced(value = '', source = 'manual', confidence = null) {
  return { value, source: SOURCE_TYPES.includes(source) ? source : 'manual', confidence };
}

export const DEFAULT_CHILDREN = [
  { id: 'child-1', name: '子1' },
  { id: 'child-2', name: '子2' },
];

export const CATEGORY_OPTIONS = ['食費', '衣類', '医療費', '教育費', '学校費', '保育費', '習い事', '交通費', '通信費', '日用品', '住居関連', '行事費', '保険', 'その他'];
export const PARENTING_OPTIONS = ['対象', '対象外', '要確認'];
export const SPECIAL_OPTIONS = ['該当', '非該当', '要確認'];
export const SETTLEMENT_OPTIONS = ['未確認', '確認済', '未清算', '一部清算', '清算済', '争点', '対象外'];

export function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function createEvidenceDocument({ id = makeId('evidence'), evidenceNumber, fileName, mimeType, size = 0, createdAt = new Date().toISOString() } = {}) {
  return { id, evidenceNumber, fileName: String(fileName || ''), mimeType: String(mimeType || ''), size: Number(size) || 0, createdAt };
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
    createdAt: data.createdAt || now, updatedAt: now,
  };
}

export function sanitizeExpenseRecords(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').map(createExpenseRecord) : [];
}
