import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExpenseRecord } from '../src/models.js';
import { initializeReceiptItems } from '../receipt-items.js';

const restoreGlobal = (name, value) => {
  if (value === undefined) delete globalThis[name];
  else globalThis[name] = value;
};

function createFormHarness() {
  const listeners = new Map();
  const hostListeners = new Map();
  const host = {
    addEventListener: (name, listener) => hostListeners.set(name, listener),
    querySelectorAll: () => [],
    className: '', id: '', innerHTML: '',
  };
  const fields = { append: (node) => assert.equal(node, host) };
  const form = {
    amount: { value: '0', addEventListener: () => {} },
    addEventListener: (name, listener) => {
      const entries = listeners.get(name) || [];
      entries.push(listener);
      listeners.set(name, entries);
    },
    querySelector: (selector) => selector === '.fields' ? fields : null,
  };
  return {
    form,
    listenerCount: (name) => (listeners.get(name) || []).length,
    hostListenerCount: () => hostListeners.size,
    createElement: () => host,
  };
}

test('ReceiptItem controller initializes only after the authenticated form exists, once, and restores saved items', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  try {
    globalThis.window = {};
    globalThis.document = { querySelector: () => null };
    assert.equal(initializeReceiptItems(), null, 'no form means no controller is created');
    assert.equal(globalThis.window.receiptItemsController, undefined);

    const harness = createFormHarness();
    globalThis.document = {
      querySelector: (selector) => selector === '#form' ? harness.form : null,
      createElement: harness.createElement,
    };
    const controller = initializeReceiptItems();
    assert.ok(controller);
    assert.equal(initializeReceiptItems(), controller, 'second initialization reuses the controller');
    assert.equal(harness.listenerCount('submit'), 1, 'form submit listener is not duplicated');
    assert.equal(harness.hostListenerCount(), 3, 'item listeners are installed once');

    const savedItems = Array.from({ length: 7 }, (_, index) => ({
      id: `item-${index + 1}`,
      productName: `商品${index + 1}`,
      quantity: index + 1,
      unitPrice: 100 + index,
      amount: (100 + index) * (index + 1),
      taxRate: index % 2 ? '10' : '8',
      amountInputMode: index % 2 ? 'tax_excluded' : 'tax_included',
      knowledgeKey: 'drinking_water',
      knowledgeSource: 'user_confirmed_document',
      knowledgeVersion: 2,
      category: '飲料水',
      purpose: { value: '登録済みの購入目的', source: 'knowledge', confidence: 1 },
      originalKnowledgePurpose: '登録済みの根拠本文',
      submissionStatus: index % 2 ? 'review' : 'included',
      source: 'manual', confidence: 0.9, basis: ['human confirmed'],
    }));
    controller.setItems(savedItems);
    const restored = controller.getItems();
    assert.equal(restored.length, 7);
    assert.deepEqual(restored.map((item) => ({
      productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice,
      amount: item.amount, taxRate: item.taxRate, amountInputMode: item.amountInputMode,
      knowledgeKey: item.knowledgeKey, knowledgeSource: item.knowledgeSource,
      knowledgeVersion: item.knowledgeVersion, category: item.category,
      purpose: item.purpose, originalKnowledgePurpose: item.originalKnowledgePurpose,
      submissionStatus: item.submissionStatus, source: item.source,
      confidence: item.confidence, basis: item.basis,
    })), savedItems.map((item) => ({
      productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice,
      amount: item.amount, taxRate: item.taxRate, amountInputMode: item.amountInputMode,
      knowledgeKey: item.knowledgeKey, knowledgeSource: item.knowledgeSource,
      knowledgeVersion: item.knowledgeVersion, category: item.category,
      purpose: item.purpose, originalKnowledgePurpose: item.originalKnowledgePurpose,
      submissionStatus: item.submissionStatus, source: item.source,
      confidence: item.confidence, basis: item.basis,
    })));

    const updated = createExpenseRecord({ id: 'same-record', createdAt: '2026-01-01T00:00:00.000Z', evidenceIds: ['same-evidence'], items: restored });
    assert.equal(updated.id, 'same-record');
    assert.deepEqual(updated.evidenceIds, ['same-evidence']);
    assert.equal(updated.items.length, 7);
  } finally {
    restoreGlobal('window', previousWindow);
    restoreGlobal('document', previousDocument);
  }
});

test('editing restores saved items through the initialized controller and never invokes Reader', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  const edit = phase2.slice(phase2.indexOf('async function edit(id)'), phase2.indexOf('async function showEvidence'));
  assert.match(phase2, /import \{ initializeReceiptItems \} from '\.\/receipt-items\.js';/);
  assert.match(phase2, /const receiptItemsController = initializeReceiptItems\(\);/);
  assert.match(edit, /receiptItemsController\.setItems\(r\.items\|\|\[\]\)/);
  assert.doesNotMatch(edit, /receiptItemsController\?\.|applyReceiptReaderCandidates|applyOcrCandidates/);
});
