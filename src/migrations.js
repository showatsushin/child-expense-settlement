import { createEvidenceDocument, sanitizeExpenseRecords } from './models.js';

export const SCHEMA_VERSION = 2;

export function migratePhase1Data({ records, evidences, children, schemaVersion = 1 } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    records: sanitizeExpenseRecords(records),
    evidences: Array.isArray(evidences) ? evidences.filter((item) => item && typeof item === 'object').map(createEvidenceDocument) : [],
    children: Array.isArray(children) ? children.filter((item) => item && item.id).map((item) => ({ id: String(item.id), name: String(item.name || '') })) : [],
    migratedFrom: Number(schemaVersion) || 1,
  };
}
