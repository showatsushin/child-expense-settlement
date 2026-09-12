import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const phase2 = await readFile(new URL('../phase2.js', import.meta.url), 'utf8');
const receiptItems = await readFile(new URL('../receipt-items.js', import.meta.url), 'utf8');

test('capture UI has distinct save-later and read-now routes', () => {
  assert.match(phase2, /id="saveCamera"/);
  assert.match(phase2, /id="readCamera"/);
  assert.match(phase2, /id="quickFile"/);
  assert.match(phase2, /id="readFile"/);
  assert.match(phase2, /capture\(event\.target\.files\?\.\[0\], \{ readNow: true \}\)/);
});

test('both routes store the original as unorganized before any optional reader execution', () => {
  assert.match(phase2, /saveUnorganizedEvidence/);
  assert.match(phase2, /if \(readNow\) await readActiveEvidence\(\)/);
});

test('ReceiptItem controller waits for the authenticated phase2 form instead of abandoning OCR wiring', () => {
  assert.match(receiptItems, /installWhenFormIsReady/);
  assert.match(receiptItems, /setInterval/);
  assert.match(receiptItems, /if \(!form\) return false/);
  assert.match(receiptItems, /applyReceiptReaderCandidates/);
});

test('the unorganized working box retains reviewed evidence until it is attached', () => {
  assert.match(phase2, /evidence\.status !== 'attached'/);
});

test('the active evidence workspace stays visible, resumes after reload, and does not share capture state', () => {
  assert.match(phase2, /id = 'currentEvidence'/);
  assert.match(phase2, /function renderCurrentEvidence\(\)/);
  assert.match(phase2, /saveCurrentEvidenceId/);
  assert.match(phase2, /loadCurrentEvidenceId/);
  assert.match(phase2, /function prepareNewCapture\(\)/);
  assert.match(phase2, /#deferCurrent/);
  assert.match(phase2, /#continueCurrent/);
});

test('Reader waits for the receipt item workspace instead of losing its result', () => {
  assert.match(phase2, /function receiptItemsController\(\)/);
  assert.match(phase2, /商品明細の表示を準備中/);
  assert.match(phase2, /restoreWorkspaceItems/);
});
