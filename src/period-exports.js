import {
  DEFAULT_SUBMISSION_EVIDENCE_PREFIX,
  normalizeSubmissionEvidenceNumber,
  submissionNumberingCandidates,
} from './submission-evidence-number.js';

export function selectedEvidencesForRecords(records, evidences) {
  const ids = new Set((records || []).flatMap((record) => record?.evidenceIds || []));
  return (evidences || []).filter((evidence) => ids.has(evidence.id));
}

export function unnumberedEvidencesForRecords(records, evidences) {
  return submissionNumberingCandidates(records, evidences)
    .map(({ evidence, purchaseDate }) => ({ evidence, purchaseDate }))
    .filter(({ evidence }) => !normalizeSubmissionEvidenceNumber(evidence.submissionEvidenceNumber));
}

export function nextSubmissionNumber(evidences, { prefix = DEFAULT_SUBMISSION_EVIDENCE_PREFIX } = {}) {
  return (evidences || []).reduce((maximum, evidence) => {
    const value = normalizeSubmissionEvidenceNumber(evidence?.submissionEvidenceNumber);
    return value?.prefix === prefix ? Math.max(maximum, value.number) : maximum;
  }, 0) + 1;
}

// This is deliberately append-only: the preview contains only selected,
// currently unnumbered evidence. Existing numbers and period-external data
// do not appear and therefore cannot be changed by confirmation.
export function buildAppendOnlySubmissionNumberingPreview(selectedRecords, allEvidences, { prefix = DEFAULT_SUBMISSION_EVIDENCE_PREFIX } = {}) {
  const selectedEvidences = selectedEvidencesForRecords(selectedRecords, allEvidences);
  const first = nextSubmissionNumber(allEvidences, { prefix });
  return unnumberedEvidencesForRecords(selectedRecords, selectedEvidences)
    .map(({ evidence, purchaseDate }, index) => ({
      evidenceId: evidence.id,
      evidenceNumber: evidence.evidenceNumber,
      purchaseDate,
      current: null,
      next: { prefix, number: first + index, subNumber: null },
    }));
}

export function periodFileSuffix({ startDate, endDate }) {
  return `${String(startDate || '').replaceAll('-', '')}-${String(endDate || '').replaceAll('-', '')}`;
}

export async function missingOriginals(evidences, getFile) {
  const missing = [];
  for (const evidence of evidences || []) {
    if (!await getFile(evidence.id)) missing.push(evidence);
  }
  return missing;
}
