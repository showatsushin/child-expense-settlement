export function buildSubmissionBundles(records, evidences) {
  const evidenceById = new Map((evidences || []).map((evidence) => [evidence.id, evidence]));
  const bundles = (records || []).flatMap((record) => [...new Set(record.evidenceIds || [])]
    .map((evidenceId) => ({ evidence: evidenceById.get(evidenceId), receipts: [record] }))
    .filter((bundle) => bundle.evidence));
  return bundles.sort((left, right) => String(left.evidence.evidenceNumber).localeCompare(String(right.evidence.evidenceNumber), 'en', { numeric: true }));
}
