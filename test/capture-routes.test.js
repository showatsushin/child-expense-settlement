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
  assert.match(phase2, /#currentEvidence'\)\.scrollIntoView/);
});

test('Reader waits for the receipt item workspace instead of losing its result', () => {
  assert.match(phase2, /function receiptItemsController\(\)/);
  assert.match(phase2, /商品明細の表示を準備中/);
  assert.match(phase2, /restoreWorkspaceItems/);
});

test('capture mode keeps the saved original visible while hiding the organization form', () => {
  assert.match(phase2, /let screenMode = 'capture'/);
  assert.match(phase2, /id="captureCamera"/);
  assert.match(phase2, /id="captureFile"/);
  assert.match(phase2, /id="savePending"/);
  assert.match(phase2, /id="readPending"/);
  assert.doesNotMatch(phase2, /id="cancelPending"/);
  assert.match(phase2, /\.capture-mode #organizeWorkspace/);
  assert.match(phase2, /id = 'currentEvidenceWorkspace'/);
  assert.match(phase2, /id = 'organizeFormWorkspace'/);
  assert.match(phase2, /\.capture-mode #organizeFormWorkspace/);
  assert.match(phase2, /\.organize-mode\.reader-pending #organizeFormWorkspace/);
});

test('opening saved evidence recalculates visibility after restoring its OCR state', () => {
  const openEvidence = phase2.slice(phase2.indexOf('async function openEvidence'), phase2.indexOf('function headersSnapshot'));
  assert.ok(openEvidence.indexOf("activeEvidenceId = evidence.id") < openEvidence.indexOf("window.receiptItemsController?.setItems(organizer.items || [])"));
  assert.ok(openEvidence.indexOf("window.receiptItemsController?.setItems(organizer.items || [])") < openEvidence.indexOf("if (readerHasResult()) screenMode = 'organize'; renderMode();"));
  assert.match(phase2, /#currentEvidenceWorkspace'\)\.hidden = screenMode === 'capture' && !activeEvidence\(\)/);
  assert.match(phase2, /\.organize-mode\.reader-pending #organizeFormWorkspace/);
});

test('organization mode is a vertical workspace and shows fields only after Reader results', () => {
  assert.match(phase2, /workspace.id = 'organizeWorkspace'/);
  assert.match(phase2, /function startOrganizing\(\)/);
  assert.match(phase2, /function readerHasResult\(\)/);
  assert.match(phase2, /screenMode === 'organize' && !readerHasResult\(\)/);
});

test('a selected original offers exactly save or read now, and read now uses the same evidence', () => {
  assert.match(phase2, /未整理に保存<\/button><button id="readPending"[^>]*>今すぐ読み取る/);
  assert.match(phase2, /savePendingCapture\(\{ readNow: true \}\)/);
  assert.match(phase2, /await readActiveEvidence\(\)/);
});

test('each new capture input clears the prior evidence workspace before selecting its file', () => {
  for (const input of ['captureCamera', 'captureFile']) {
    assert.match(phase2, new RegExp(`\\$\\('#${input}'\\)\\.addEventListener\\('change', \\(event\\) => \\{ const file = event\\.target\\.files\\?\\.\\[0\\]; if \\(!file\\) return; prepareNewCapture\\(\\); selectForCapture\\(file\\); \\}\\)`));
  }
  assert.match(receiptItems, /existingItems\.length === 0/);
});
