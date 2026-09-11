import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { receiptReaderAbViewModel } from '../src/services/receiptReaderAbUi.js';

test('A/B view model keeps both reader results separate and exposes comparison metrics', () => {
  const models = receiptReaderAbViewModel({ comparison: {
    tesseract: { vendor: 'store', itemCount: 1, needsReviewCount: 1, itemTotalAmount: 100, difference: 20, processingMs: 120, rawText: 'raw', items: [{ productName: 'water', amount: 100, needsReview: true }] },
    openai: { vendor: 'store', itemCount: 1, needsReviewCount: 0, itemTotalAmount: 100, difference: 20, processingMs: 80, rawText: 'raw', items: [{ productName: 'water', amount: 100, needsReview: false }] },
  } });
  assert.equal(models.length, 2);
  assert.equal(models[0].provider, 'tesseract');
  assert.equal(models[1].provider, 'openai');
  assert.equal(models[1].processingMs, 80);
  assert.equal(models[0].items[0].needsReview, true);
});

test('A/B UI is isolated from evidence saving and ReceiptItem mutation paths', async () => {
  const [ui, phase] = await Promise.all([
    readFile(new URL('../src/services/receiptReaderAbUi.js', import.meta.url), 'utf8'),
    readFile(new URL('../phase2.js', import.meta.url), 'utf8'),
  ]);
  assert.match(phase, /installReceiptReaderAbUi\(\)/);
  assert.match(ui, /runReceiptReaderAbComparison\(selectedFile/);
  assert.doesNotMatch(ui, /saveDraftEvidence|createUserStorage|receiptItemsController|applyReceiptReaderCandidates/);
});
