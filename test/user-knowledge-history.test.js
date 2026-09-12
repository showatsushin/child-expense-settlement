import test from 'node:test';
import assert from 'node:assert/strict';
import { historySuggestions, normalizeKnowledgeHistory, rememberConfirmation } from '../src/user-knowledge-history.js';
import { extractDateCandidates, extractMerchantCandidates } from '../src/ocr-extract.js';
import { applySelectedKnowledge } from '../src/services/purchasePurposeSelection.js';

test('confirmed merchant correction is offered later but never written into a new form value automatically', () => {
  const history = rememberConfirmation({}, 'merchantCorrections', 'セブン-イレブン\nKOYO国立成育医療研究センター', 'セブン-イレブン KOYO国立成育医療研究センター');
  const suggestions = historySuggestions(history, 'merchantCorrections', 'セブン-イレブン KOYO国立成育医療研究センター');
  assert.equal(suggestions[0].confirmed, 'セブン-イレブン KOYO国立成育医療研究センター');
  assert.equal(suggestions[0].source, 'user_confirmed_history');
});

test('merchant candidates exclude phone and address lines while preserving a brand and branch display candidate', () => {
  const candidates = extractMerchantCandidates('セブン-イレブン\nKOYO国立成育医療研究センター\nTEL 03-1234-5678\n東京都世田谷区大蔵2丁目');
  assert.ok(candidates.some((candidate) => candidate.brand.includes('セブン')));
  assert.equal(candidates.some((candidate) => /03-1234-5678|東京都/.test(candidate.value)), false);
});

test('invalid calendar dates are not candidate dates', () => {
  assert.deepEqual(extractDateCandidates('2000-02-80\n2026-02-04').map((candidate) => candidate.value), ['2026-02-04']);
});

test('Knowledge selection retains sourceExcerpt while manual editing stays a separate final value', () => {
  const selected = applySelectedKnowledge({ productName: 'シールブック' }, 'rehabilitation_training');
  const edited = { ...selected, purpose: { value: '本人が実際に使うため購入', source: 'manual' }, purposeSource: 'manual_override' };
  assert.equal(edited.sourceExcerpt, selected.sourceExcerpt); assert.notEqual(edited.purpose.value, edited.sourceExcerpt);
});

test('history normalizer keeps future correction groups and audit timestamps', () => {
  const result = normalizeKnowledgeHistory({ productCorrections: [{ raw: 'water', confirmed: '飲料水', createdAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z', source: 'user_confirmed_history' }] });
  assert.equal(result.productCorrections[0].confirmed, '飲料水'); assert.ok(result.productCorrections[0].createdAt); assert.equal(result.categoryHistory.length, 0);
});
