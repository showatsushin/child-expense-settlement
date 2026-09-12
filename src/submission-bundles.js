import { buildEvidenceManifest } from './evidence-manifest.js';

// One bundle is always rendered as its settlement material immediately followed
// by the original identified by the same evidence number.
export function buildSubmissionBundles(records, evidences) {
  const byId = new Map((records || []).map((record) => [record.id, record]));
  return buildEvidenceManifest(records, evidences).map(({ evidence, receipts }) => ({
    evidence,
    receipts: receipts.map((receipt) => byId.get(receipt.id)).filter(Boolean),
  }));
}
