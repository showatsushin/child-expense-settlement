import { createEvidenceDocument } from './models.js';
import { nextEvidenceNumber } from './calculations.js';

export async function saveDraftEvidence({ file, evidences, saveFile }) {
  const evidence = createEvidenceDocument({ evidenceNumber: nextEvidenceNumber(evidences), fileName: file.name, mimeType: file.type, size: file.size, status: 'draft' });
  await saveFile(evidence.id, file);
  return evidence;
}

export async function saveUnorganizedEvidence({ file, evidences, saveFile }) {
  const evidence = createEvidenceDocument({ evidenceNumber: nextEvidenceNumber(evidences), fileName: file.name, mimeType: file.type, size: file.size, status: 'unorganized' });
  await saveFile(evidence.id, file);
  return evidence;
}

export function attachDraftEvidence({ evidenceIds, evidenceId, evidences, ocr }) {
  const evidence = evidences.find((item) => item.id === evidenceId);
  if (evidence) { evidence.status = 'attached'; evidence.organization = null; evidence.updatedAt = new Date().toISOString(); if (ocr) evidence.ocr = ocr; }
  return [...new Set([...(Array.isArray(evidenceIds) ? evidenceIds : []), evidenceId].filter(Boolean))];
}

export async function discardDraftEvidence({ evidenceId, evidences, deleteFile }) {
  const evidence = evidences.find((item) => item.id === evidenceId);
  if (!evidence || evidence.status !== 'draft') return evidences;
  await deleteFile(evidence.id);
  return evidences.filter((item) => item.id !== evidence.id);
}

export async function discardUnattachedEvidence({ evidenceId, evidences, records = [], deleteFile }) {
  const evidence = evidences.find((item) => item.id === evidenceId);
  const referenced = (records || []).some((record) => (record.evidenceIds || []).includes(evidenceId));
  if (!evidence || referenced || evidence.status === 'attached') return evidences;
  await deleteFile(evidence.id);
  return evidences.filter((item) => item.id !== evidence.id);
}

export function latestDraftEvidence(evidences) {
  return [...(Array.isArray(evidences) ? evidences : [])].filter((item) => item?.status === 'draft').sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] || null;
}

export function unorganizedEvidence(evidences) {
  return (Array.isArray(evidences) ? evidences : []).filter((item) => item?.status !== 'attached');
}

export async function deleteReceiptAndExclusiveEvidence({ receiptId, records, evidences, deleteFile }) {
  const removed = (records || []).find((record) => record.id === receiptId);
  if (!removed) return { records, evidences, deletedEvidenceIds: [] };
  const remainingRecords = records.filter((record) => record.id !== receiptId);
  const stillUsed = new Set(remainingRecords.flatMap((record) => record.evidenceIds || []));
  const deletedEvidenceIds = [...new Set(removed.evidenceIds || [])].filter((id) => !stillUsed.has(id));
  for (const id of deletedEvidenceIds) await deleteFile(id);
  return { records: remainingRecords, evidences: evidences.filter((evidence) => !deletedEvidenceIds.includes(evidence.id)), deletedEvidenceIds };
}
