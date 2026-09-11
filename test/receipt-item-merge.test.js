import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutofillOcrCandidates } from '../receipt-items.js';

test('OCR rerun never replaces existing human-edited receipt items', () => {
  const edited = [{ id: 'manual-1', productName: '\u4fee\u6b63\u6e08\u307f', amount: 480, source: 'manual' }];
  const candidates = [{ id: 'ocr-1', productName: '\u65b0\u3057\u3044OCR\u5019\u88dc', amount: 480 }];
  assert.equal(shouldAutofillOcrCandidates(edited, candidates), false);
  assert.equal(shouldAutofillOcrCandidates([], candidates), true);
  assert.equal(shouldAutofillOcrCandidates([], []), false);
});