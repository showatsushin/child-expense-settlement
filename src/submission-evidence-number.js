export const DEFAULT_SUBMISSION_EVIDENCE_PREFIX = '甲';

const positiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const text = (value, max = 16) => String(value || '').trim().slice(0, max);

export function normalizeSubmissionEvidenceNumber(value) {
  if (!value || typeof value !== 'object') return null;
  const prefix = text(value.prefix); const number = positiveInteger(value.number); const subNumber = value.subNumber == null || value.subNumber === '' ? null : positiveInteger(value.subNumber);
  return prefix && number && (value.subNumber == null || value.subNumber === '' || subNumber) ? { prefix, number, subNumber } : null;
}

export function formatSubmissionEvidenceNumber(value) {
  const number = normalizeSubmissionEvidenceNumber(value);
  return number ? `${number.prefix}第${number.number}号証${number.subNumber ? `の${number.subNumber}` : ''}` : '';
}

export function submissionEvidenceNumberKey(value) {
  const number = normalizeSubmissionEvidenceNumber(value);
  return number ? `${number.prefix}\u0000${number.number}\u0000${number.subNumber || ''}` : '';
}

export function assertUniqueSubmissionEvidenceNumbers(evidences) {
  const seen = new Map();
  for (const evidence of evidences || []) {
    const key = submissionEvidenceNumberKey(evidence?.submissionEvidenceNumber); if (!key) continue;
    if (seen.has(key)) throw new Error(`提出用証拠番号 ${formatSubmissionEvidenceNumber(evidence.submissionEvidenceNumber)} は ${seen.get(key)} と ${evidence.evidenceNumber} で重複しています。`);
    seen.set(key, evidence.evidenceNumber || evidence.id || '');
  }
}

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '9999-12-31';
const registrationOrder = (evidence) => String(evidence?.createdAt || '');

export function submissionNumberingCandidates(records, evidences) {
  const sourceRecords = Array.isArray(records) ? records : [];
  return (Array.isArray(evidences) ? evidences : [])
    .filter((evidence) => evidence?.status === 'attached' && sourceRecords.some((record) => (record.evidenceIds || []).includes(evidence.id)))
    .map((evidence) => {
      const linked = sourceRecords.filter((record) => (record.evidenceIds || []).includes(evidence.id));
      return { evidence, purchaseDate:linked.map((record) => validDate(record.paidDate)).sort()[0] || '9999-12-31' };
    })
    .sort((left, right) => left.purchaseDate.localeCompare(right.purchaseDate) || registrationOrder(left.evidence).localeCompare(registrationOrder(right.evidence)) || String(left.evidence.id).localeCompare(String(right.evidence.id)));
}

export function buildSubmissionNumberingPreview(records, evidences, { prefix = DEFAULT_SUBMISSION_EVIDENCE_PREFIX } = {}) {
  const normalizedPrefix = text(prefix) || DEFAULT_SUBMISSION_EVIDENCE_PREFIX;
  return submissionNumberingCandidates(records, evidences).map(({ evidence, purchaseDate }, index) => ({ evidenceId:evidence.id, evidenceNumber:evidence.evidenceNumber, purchaseDate, current:normalizeSubmissionEvidenceNumber(evidence.submissionEvidenceNumber), next:{ prefix:normalizedPrefix, number:index + 1, subNumber:null } }));
}

export function applySubmissionNumbering(evidences, preview) {
  const byId = new Map((preview || []).map((entry) => [entry.evidenceId, normalizeSubmissionEvidenceNumber(entry.next)]));
  const next = (evidences || []).map((evidence) => byId.has(evidence.id) ? { ...evidence, submissionEvidenceNumber:byId.get(evidence.id) } : evidence);
  assertUniqueSubmissionEvidenceNumbers(next);
  return next;
}

export function compareSubmissionEvidenceNumbers(left, right) {
  const a = normalizeSubmissionEvidenceNumber(left?.submissionEvidenceNumber); const b = normalizeSubmissionEvidenceNumber(right?.submissionEvidenceNumber);
  if (a && b) return a.prefix.localeCompare(b.prefix, 'ja') || a.number - b.number || (a.subNumber || 0) - (b.subNumber || 0) || String(left.evidenceNumber).localeCompare(String(right.evidenceNumber), 'en', { numeric:true });
  if (a) return -1; if (b) return 1;
  return String(left?.evidenceNumber).localeCompare(String(right?.evidenceNumber), 'en', { numeric:true });
}
