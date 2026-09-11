import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

test('favicon assets and cache-versioned links are present', async () => {
  const html = await readFile('index.html', 'utf8');
  for (const name of ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192x192.png', 'icon-512x512.png']) {
    assert.ok((await stat(name)).size > 0, name);
  }
  assert.match(html, /favicon\.ico\?v=20260911-ocr/);
  assert.match(html, /apple-touch-icon\.png\?v=20260911-ocr/);
});