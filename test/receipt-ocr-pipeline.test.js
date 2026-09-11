import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReceiptOcr, parseReceiptMoney } from '../src/receipt-ocr-pipeline.js';
import { receiptOcrFixtures } from './fixtures/receipt-ocr-fixtures.js';

function key([name, amount]) { return `${name}:${amount}`; }

test('receipt OCR extracts anonymized multi-item formats without zero candidates', () => {
  let expectedCount = 0; let matchedCount = 0; let observedCount = 0; let zeroCandidateCount = 0;
  for (const fixture of receiptOcrFixtures) {
    const result = analyzeReceiptOcr(fixture.text);
    const observed = result.items.map((item) => [item.productName, item.amount]);
    const expectedKeys = new Set(fixture.expected.map(key));
    const observedKeys = new Set(observed.map(key));
    expectedCount += expectedKeys.size; observedCount += observedKeys.size;
    matchedCount += [...expectedKeys].filter((value) => observedKeys.has(value)).length;
    if (!result.items.length) zeroCandidateCount += 1;
    assert.equal(result.headers.receiptTotalAmount, fixture.total, `${fixture.name}: receipt total`);
    assert.equal(result.items.length, fixture.expected.length, `${fixture.name}: candidate count`);
    for (const expected of fixture.expected) assert.ok(observedKeys.has(key(expected)), `${fixture.name}: ${key(expected)}`);
    assert.ok(result.items.every((item) => item.submissionStatus === 'review'), `${fixture.name}: review status`);
    assert.ok(result.items.every((item) => item.sourceLineNumbers.length > 0), `${fixture.name}: source lines`);
    assert.ok(!result.items.some((item) => /\u5408\u8a08|\u5c0f\u8a08|\u6d88\u8cbb\u7a0e|\u73fe\u91d1|\u304a\u91e3\u308a/.test(item.productName)), `${fixture.name}: non-items filtered`);
  }
  assert.equal(zeroCandidateCount, 0, 'zero-candidate rate');
  assert.equal(matchedCount / expectedCount, 1, 'item recall');
  assert.equal(matchedCount / observedCount, 1, 'item precision');
});

test('receipt OCR normalizes yen, comma, and OCR spacing without NaN', () => {
  assert.equal(parseReceiptMoney('\u00a51,480'), 1480);
  assert.equal(parseReceiptMoney('\uffe5 1, 480'), 1480);
  assert.equal(parseReceiptMoney('1 480'), 1480);
  assert.equal(parseReceiptMoney('not-a-number'), null);
});

test('receipt OCR marks monetary zero-candidate extraction as low confidence, not success', () => {
  const result = analyzeReceiptOcr('\u67b6\u7a7a\u5e97\n\u4e0d\u660e\u306a\u5546\u54c1\n\u5c0f\u8a08 100\n\u5408\u8a08 100\n\u73fe\u91d1 100');
  assert.equal(result.items.length, 0);
  assert.equal(result.quality.status, 'low_confidence');
  assert.equal(result.quality.monetaryLineCount, 3);
});

test('receipt OCR retains a difference instead of inventing a missing amount', () => {
  const result = analyzeReceiptOcr('\u67b6\u7a7a\u5e97\n\u98f2\u6599\u6c34 100\n\u5408\u8a08 300');
  assert.deepEqual(result.items.map((item) => [item.productName, item.amount]), [['\u98f2\u6599\u6c34', 100]]);
  assert.equal(result.quality.difference, 200);
  assert.equal(result.quality.status, 'partial');
});