import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('purchase-item cards use a single mobile column and preserve the OCR item path', async () => {
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../receipt-items.js', import.meta.url), 'utf8');
  assert.match(css, /\.receipt-item-grid,\.item-proposals\{grid-template-columns:1fr/);
  assert.match(css, /\.receipt-item-actions \.primary/);
  assert.match(ui, /receiptItemsController/);
  assert.match(ui, /extractReceiptItemCandidates/);
  assert.match(ui, /data-field="category"/);
  assert.match(ui, /過去に確定：/);
  assert.match(ui, /候補：/);
  assert.match(ui, /data-action="apply-category"/);
  assert.match(ui, /<details class="item-category-candidates"><summary>候補<\/summary>/);
  assert.match(css, /\.category-history-candidates\{padding:/);
});
