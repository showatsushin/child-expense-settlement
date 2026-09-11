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
});
