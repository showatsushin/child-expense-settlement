import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePreprocessPlan } from '../src/services/documentRecognition.js';

test('receipt image preprocessing upscales small photos but bounds long receipt pixels', () => {
  const phone = imagePreprocessPlan(800, 1200);
  assert.equal(phone.applied, true); assert.equal(phone.width, 1600); assert.equal(phone.height, 2400);
  const longReceipt = imagePreprocessPlan(1000, 10000);
  assert.ok(longReceipt.width * longReceipt.height <= 12000000);
  assert.ok(longReceipt.scale <= 1.2);
});