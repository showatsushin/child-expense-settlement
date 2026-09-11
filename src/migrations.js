import { createEvidenceDocument, sanitizeExpenseRecords, createReceiptItem } from './models.js';

export const SCHEMA_VERSION = 3;
function migrateRecordToReceipt(record) { const normalized = { ...record }; if (Array.isArray(record?.items) && record.items.length) return normalized; const amount = record?.amount?.value ?? record?.amount ?? 0; const legacyStatus = record?.parentingExpenseStatus?.value ?? record?.parentingExpenseStatus; const submissionStatus = legacyStatus === '対象外' ? 'excluded' : legacyStatus === '対象' ? 'included' : 'review'; normalized.receiptTotalAmount = Number.isFinite(Number(record?.receiptTotalAmount)) ? Number(record.receiptTotalAmount) : Number(amount) || 0; normalized.items = [createReceiptItem({ receiptId: record?.id || '', lineOrder: 1, productName: '', amount, category: 'その他', purpose: record?.reason, submissionStatus, source: 'imported', confidence: null, basis: ['legacy ExpenseRecord migration'], notes: '' }, record?.id || '')]; return normalized; }

export function migratePhase1Data({ records, evidences, children, schemaVersion = 1 } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    records: sanitizeExpenseRecords((Array.isArray(records) ? records : []).map(migrateRecordToReceipt)),
    evidences: Array.isArray(evidences) ? evidences.filter((item) => item && typeof item === 'object').map(createEvidenceDocument) : [],
    children: Array.isArray(children) ? children.filter((item) => item && item.id).map((item) => ({ id: String(item.id), name: String(item.name || '') })) : [],
    migratedFrom: Number(schemaVersion) || 1,
  };
}
