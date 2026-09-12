import test from 'node:test';
import assert from 'node:assert/strict';
import {
  itemHistoryCandidates,
  normalizeConfirmedHistory,
  productHistoryCandidates,
  recordConfirmedHistory,
  vendorHistoryCandidates,
} from '../src/confirmed-history.js';
import { confirmedHistoryKeyForUser } from '../src/user-storage.js';

test('registered human-confirmed values are stored separately and ranked as future candidates', () => {
  const confirmed = recordConfirmedHistory({}, {
    vendor: '確認店',
    items: [{ productName: '飲料水 500ml', category: '飲料水', knowledgeKey: 'drinking_water' }],
    confirmedAt: '2026-09-12T12:00:00.000Z',
  });

  assert.deepEqual(confirmed.vendors.map((entry) => entry.value), ['確認店']);
  assert.deepEqual(confirmed.items.map((entry) => [entry.productName, entry.category, entry.knowledgeKey]), [['飲料水 500ml', '飲料水', 'drinking_water']]);
  assert.deepEqual(vendorHistoryCandidates(confirmed, '確認').map((entry) => entry.value), ['確認店']);
  assert.deepEqual(productHistoryCandidates(confirmed, '飲料水').map((entry) => entry.productName), ['飲料水 500ml']);
  assert.deepEqual(itemHistoryCandidates(confirmed, '飲料水').map((entry) => entry.knowledgeKey), ['drinking_water']);
  assert.equal(confirmedHistoryKeyForUser('user-a'), 'child-expense-settlement:user-a:confirmedHistory.v1');
});

test('history normalizes duplicates without becoming an expense, evidence, or automatic selection', () => {
  const history = normalizeConfirmedHistory({
    vendors: [{ value: '確認店', count: 2, lastConfirmedAt: '2026-09-11T00:00:00.000Z' }],
    items: [{ productName: '飲料水', category: '飲料水', knowledgeKey: 'drinking_water', count: 2, lastConfirmedAt: '2026-09-11T00:00:00.000Z' }],
  });
  const item = { productName: '飲料水', category: 'その他', knowledgeKey: null };
  const candidates = itemHistoryCandidates(history, item.productName);

  assert.equal(candidates[0].knowledgeKey, 'drinking_water');
  assert.deepEqual(item, { productName: '飲料水', category: 'その他', knowledgeKey: null });
  assert.equal('evidenceIds' in history, false);
  assert.equal('items' in history, true);
});

test('normalized human-confirmed history ranks Reader spelling variants as explicit correction candidates', () => {
  const history = recordConfirmedHistory({}, {
    vendor: 'サンプル薬局',
    items: [{ productName: '飲料水 500ml', category: '飲料水', knowledgeKey: 'drinking_water' }],
    confirmedAt: '2026-09-12T12:00:00.000Z',
  });
  const readerVendor = 'サンプル 薬局';
  const readerProduct = '飲料水500ML';

  assert.equal(vendorHistoryCandidates(history, readerVendor)[0].value, 'サンプル薬局');
  assert.equal(productHistoryCandidates(history, readerProduct)[0].productName, '飲料水 500ml');
  assert.equal(readerVendor, 'サンプル 薬局');
  assert.equal(readerProduct, '飲料水500ML');
});
