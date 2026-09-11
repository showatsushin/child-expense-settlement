import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('OCR completion sends candidates to the ReceiptItem controller and removes receipt-level category and reason candidates', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  assert.match(phase2, /applyOcrCandidates/);
  assert.equal(phase2.includes("['category','費目',c.categories]"), false);
  assert.equal(phase2.includes("['reason','理由',c.reasons]"), false);
});

test('receipt items expose primary OCR application and human Knowledge selection, not AI purpose controls', () => {
  const items = readFileSync(new URL('../receipt-items.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(items, /applyOcrCandidates/);
  assert.match(items, /data-knowledge-key/);
  assert.match(items, /sourceExcerpt/);
  assert.doesNotMatch(items, /suggestAiItem/);
  assert.doesNotMatch(items, /data-category-proposal/);
  assert.doesNotMatch(html, /reason-suggestions\.js/);
});
