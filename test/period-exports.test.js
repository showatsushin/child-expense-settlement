import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRecordsByPeriod, validatePeriod } from '../src/period-expense-list.js';
import { buildAppendOnlySubmissionNumberingPreview, nextSubmissionNumber, periodFileSuffix, selectedEvidencesForRecords, unnumberedEvidencesForRecords } from '../src/period-exports.js';
import { applySubmissionNumbering, formatSubmissionEvidenceNumber } from '../src/submission-evidence-number.js';

const evidence = (id, evidenceNumber, submissionEvidenceNumber = null, createdAt = '2026-01-01T00:00:00.000Z') => ({ id, evidenceNumber, status:'attached', createdAt, submissionEvidenceNumber, fileName:`${id}.jpg` });
const record = (id, paidDate, evidenceIds) => ({ id, paidDate, evidenceIds });

test('common period filter includes both boundaries and reports unknown purchase dates', () => {
  const records = [record('before','2026-01-31',['e1']),record('first','2026-02-01',['e2']),record('last','2026-02-28',['e3']),record('after','2026-03-01',['e4']),record('unknown','',['e5']),record('invalid','2026-02-30',['e6'])];
  const result = filterRecordsByPeriod(records, { startDate:'2026-02-01', endDate:'2026-02-28' });
  assert.deepEqual(result.selectedRecords.map((item) => item.id), ['first','last']);
  assert.deepEqual(result.excludedUnknownDateRecords.map((item) => item.id), ['unknown','invalid']);
});

test('period validation rejects missing, invalid, and reversed dates', () => {
  assert.equal(validatePeriod({ startDate:'', endDate:'2026-02-28' }).valid, false);
  assert.equal(validatePeriod({ startDate:'2026-02-30', endDate:'2026-02-28' }).valid, false);
  assert.equal(validatePeriod({ startDate:'2026-03-01', endDate:'2026-02-28' }).valid, false);
  assert.deepEqual(validatePeriod({ startDate:'2026-02-01', endDate:'2026-02-28' }), { valid:true, startDate:'2026-02-01', endDate:'2026-02-28' });
});

test('period evidence selection includes only selected records and their originals', () => {
  const records = [record('inside','2026-02-10',['e1','e2']),record('outside','2026-03-01',['e3'])];
  const evidences = [evidence('e1','E-001'),evidence('e2','E-002'),evidence('e3','E-003')];
  assert.deepEqual(selectedEvidencesForRecords([records[0]], evidences).map((item) => item.id), ['e1','e2']);
});

test('append-only numbering starts after the existing maximum, skips gaps, and leaves existing and outside evidence unchanged', () => {
  const records = [record('old','2026-01-10',['old']),record('insideLate','2026-02-13',['insideLate']),record('insideEarly','2026-02-10',['insideEarly']),record('outside','2026-03-01',['outside'])];
  const evidences = [
    evidence('old','E-001',{ prefix:'甲', number:5, subNumber:null }),
    evidence('insideLate','E-025',null,'2026-02-03T00:00:00.000Z'),
    evidence('insideEarly','E-021',null,'2026-02-02T00:00:00.000Z'),
    evidence('outside','E-030'),
  ];
  const preview = buildAppendOnlySubmissionNumberingPreview(records.slice(1,3), evidences);
  assert.deepEqual(preview.map((item) => [item.evidenceNumber, formatSubmissionEvidenceNumber(item.next)]), [['E-021','甲第6号証'],['E-025','甲第7号証']]);
  assert.equal(nextSubmissionNumber(evidences), 6);
  assert.deepEqual(unnumberedEvidencesForRecords(records.slice(1,3), selectedEvidencesForRecords(records.slice(1,3), evidences)).map((item) => item.evidence.id), ['insideEarly','insideLate']);
  const after = applySubmissionNumbering(evidences, preview);
  assert.equal(formatSubmissionEvidenceNumber(after.find((item) => item.id === 'old').submissionEvidenceNumber), '甲第5号証');
  assert.equal(after.find((item) => item.id === 'outside').submissionEvidenceNumber, null);
  assert.equal(after.find((item) => item.id === 'insideEarly').evidenceNumber, 'E-021');
});

test('period file suffix is stable and safe for exports', () => {
  assert.equal(periodFileSuffix({ startDate:'2026-02-01', endDate:'2026-02-28' }), '20260201-20260228');
});
