import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDebouncedTask } from '../src/debounced-task.js';
import { shouldCheckPotentialDuplicatesForField } from '../src/duplicates.js';
import { normalizeConfirmedHistory, productHistoryCandidates, knowledgeHistoryCandidates, taxRateHistoryCandidates } from '../src/confirmed-history.js';

function fakeTimers() {
  let nextId = 0;
  const callbacks = new Map();
  return {
    setTimeoutFn(callback) { const id = ++nextId; callbacks.set(id, callback); return id; },
    clearTimeoutFn(id) { callbacks.delete(id); },
    runAll() { for (const callback of [...callbacks.values()]) callback(); },
  };
}

test('OCR correction debounce persists only the final value of ten inputs', () => {
  const timers = fakeTimers(); const saved = [];
  const task = createDebouncedTask({ delayMs:650, run:(value) => saved.push(value), ...timers });
  for (let index = 1; index <= 10; index += 1) task.schedule(`corrected-${index}`);
  assert.deepEqual(saved, []);
  timers.runAll();
  assert.deepEqual(saved, ['corrected-10']);
  task.schedule('corrected-10'); timers.runAll();
  assert.deepEqual(saved, ['corrected-10'], 'an unchanged value does not persist twice');
});

test('a pending OCR correction flushes synchronously on blur or before navigation', () => {
  const timers = fakeTimers(); const saved = [];
  const task = createDebouncedTask({ delayMs:650, run:(value) => saved.push(value), ...timers });
  task.schedule('pending');
  assert.equal(task.pending(), true);
  assert.equal(task.flush(), true);
  assert.deepEqual(saved, ['pending']);
  assert.equal(task.pending(), false);
  timers.runAll();
  assert.deepEqual(saved, ['pending']);
});

test('duplicate checks are restricted to the fields used by duplicate matching', () => {
  for (const name of ['paidDate', 'amount', 'vendor']) assert.equal(shouldCheckPotentialDuplicatesForField(name), true);
  for (const name of ['productName', 'purpose', 'notes', 'category', 'taxRate', 'knowledgeKey', '']) assert.equal(shouldCheckPotentialDuplicatesForField(name), false);
});

test('normalized history is reusable without changing candidate results', () => {
  const raw = {
    items: [{ productName:'water 500ml', category:'food', knowledgeKey:'drinking_water', taxRate:'8', count:2, lastConfirmedAt:'2026-09-12T00:00:00.000Z' }],
  };
  const normalized = normalizeConfirmedHistory(raw);
  assert.equal(normalizeConfirmedHistory(normalized), normalized, 'a render can share one normalized history object');
  assert.deepEqual(productHistoryCandidates(raw, 'water'), productHistoryCandidates(normalized, 'water'));
  assert.deepEqual(knowledgeHistoryCandidates(raw, 'water'), knowledgeHistoryCandidates(normalized, 'water'));
  assert.deepEqual(taxRateHistoryCandidates(raw, 'water'), taxRateHistoryCandidates(normalized, 'water'));
});

test('PERF-1 wires OCR flushes before persistence-sensitive transitions and shares render history', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  const receiptItems = readFileSync(new URL('../receipt-items.js', import.meta.url), 'utf8');
  assert.match(phase2, /createDebouncedTask\(\{ delayMs:650/);
  assert.match(phase2, /\$\('#corrected'\)\.addEventListener\('blur',flushPendingOcrPersist\)/);
  for (const selector of ['#form', '#resetForm', '#file', '#saveUnorganized', '#rows', '#evidences', '#unorganized']) {
    assert.match(phase2, new RegExp(`\\$\\('${selector.replace(/[#$]/g, '\\$&')}'\\)\\.addEventListener\\('[^']+',flushPendingOcrPersist,true\\)`));
  }
  const render = receiptItems.slice(receiptItems.indexOf('function render()'), receiptItems.indexOf('function update('));
  assert.match(render, /const history = normalizeConfirmedHistory\(confirmedHistory\(\)\)/);
  assert.match(render, /productHistoryCandidates\(history\)/);
  assert.doesNotMatch(render, /productHistoryCandidates\(confirmedHistory\(\)\)/);
});

test('PERF-2 updates one ReceiptItem card and totals without normal-edit full renders', () => {
  const ui = readFileSync(new URL('../receipt-items.js', import.meta.url), 'utf8');
  const renderItem = ui.slice(ui.indexOf('function renderItem('), ui.indexOf('function render()'));
  const update = ui.slice(ui.indexOf('function update('), ui.indexOf('function selectKnowledge('));
  const actions = ui.slice(ui.indexOf('function handleAction('), ui.indexOf('function applyReceiptReaderCandidates('));
  const ocrCandidates = ui.slice(ui.indexOf('function applyOcrCandidates('), ui.indexOf('function handleAction('));
  const inputHandler = ui.slice(ui.indexOf("host.addEventListener('input'"), ui.indexOf("host.addEventListener('change'"));
  const changeHandler = ui.slice(ui.indexOf("host.addEventListener('change'"), ui.indexOf("host.addEventListener('click'"));

  assert.match(ui, /data-item-id=/, 'cards have stable item identity independent of their index');
  assert.match(renderItem, /card\.replaceWith\(replacement\)/);
  assert.match(renderItem, /replacement\.querySelectorAll\('textarea\[data-autogrow\]'\)/);
  assert.doesNotMatch(renderItem, /normalizeConfirmedHistory|host\.innerHTML/);
  assert.match(update, /renderTotals\(\)/);
  assert.match(update, /renderItem\(id\)/);
  assert.doesNotMatch(update, /\brender\(\)/, 'normal updates never rebuild the item list');
  assert.match(ocrCandidates, /renderOcrQuality\(\)/, 'retained OCR candidates update only their quality status');

  assert.match(inputHandler, /const keepEditing = \['quantity', 'unitPrice', 'amount'\]/);
  assert.match(inputHandler, /renderSummary: keepEditing/);
  assert.doesNotMatch(inputHandler, /renderCard: true/, 'numeric input keeps its focused input element');
  assert.match(changeHandler, /renderItem\(card\.dataset\.id\)/, 'tax-exclusive changes update only their card');
  assert.match(changeHandler, /renderCard: true/, 'select changes update only their card');

  for (const action of ["'edit'", "'choose-knowledge'", "'finish-edit'"]) {
    const start = actions.indexOf(`action === ${action}`);
    const next = actions.indexOf('} else if', start + 1);
    assert.doesNotMatch(actions.slice(start, next < 0 ? undefined : next), /\brender\(\)/);
  }
  assert.match(actions, /update\(card\.dataset\.id, 'taxRate', nextRate, \{ renderCard: true \}\)/);
  assert.match(actions, /update\(card\.dataset\.id, 'amount', amount, \{ renderCard: true, renderSummary: true \}\)/);
  assert.match(actions, /items\.push\(item\);[\s\S]{0,120}render\(\)/, 'add may rebuild the list');
  assert.match(actions, /items = items\.filter[\s\S]{0,220}render\(\)/, 'delete may rebuild the list');
});
