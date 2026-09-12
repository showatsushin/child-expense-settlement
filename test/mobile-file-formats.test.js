import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile } from '../src/file-preview.js';

test('mobile camera HEIC and WebP originals can enter the unorganized box', () => {
  assert.equal(validateFile({ name: 'camera.HEIC', type: 'image/heic', size: 10 }), '');
  assert.equal(validateFile({ name: 'camera.webp', type: 'image/webp', size: 10 }), '');
});
