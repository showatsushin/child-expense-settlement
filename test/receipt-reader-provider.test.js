import test from 'node:test';
import assert from 'node:assert/strict';
import { TesseractReceiptReader, configuredReceiptReaderProvider, evaluateReceiptReaderQuality, normalizeReceiptReaderResult } from '../src/services/receiptReaderProvider.js';

test('ReceiptReader Provider contract preserves source text and keeps unknown values null', () => {
  const result = normalizeReceiptReaderResult({ provider: 'openai', rawText: 'SHOP\nwater 100', vendor: 'SHOP', receiptTotalAmount: 100, items: [{ sourceText: 'water 100', productName: 'water', quantity: null, unitPrice: null, amount: 100, confidence: .9, needsReview: false }, { sourceText: 'unclear', productName: null, amount: null, needsReview: true }] });
  assert.equal(result.provider, 'openai'); assert.equal(result.items[0].sourceText, 'water 100'); assert.equal(result.items[1].productName, null); assert.equal(result.quality.status, 'partial');
});

test('Tesseract remains a ReceiptReader provider and uses the existing OCR pipeline', async () => {
  const result = await TesseractReceiptReader.read({ file: {}, recognize: async () => ({ rawText: 'Store\nwater 100\nTOTAL 100', engine: 'test', confidence: .8, preprocessing: {} }) });
  assert.equal(result.provider, 'tesseract'); assert.equal(result.items.length, 1); assert.equal(result.items[0].amount, 100); assert.equal(result.items[0].sourceText, 'water 100');
});

test('common quality never fills a missing amount from the receipt total', () => {
  const quality = evaluateReceiptReaderQuality({ rawText: 'Store\nunknown\nTOTAL 300', receiptTotalAmount: 300, items: [{ productName: 'unknown', amount: null, needsReview: true }] });
  assert.equal(quality.candidateCount, 0); assert.equal(quality.itemTotalAmount, 0); assert.equal(quality.difference, 300); assert.equal(quality.status, 'low_confidence');
});


test('production default is OpenAI while Tesseract remains selectable', () => {
  assert.equal(configuredReceiptReaderProvider(undefined), 'openai');
  assert.equal(configuredReceiptReaderProvider('tesseract'), 'tesseract');
  assert.equal(configuredReceiptReaderProvider('unsupported'), 'openai');
});
