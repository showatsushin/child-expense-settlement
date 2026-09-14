import test from 'node:test';
import assert from 'node:assert/strict';
import {
  itemHistoryCandidates,
  knowledgeHistoryCandidates,
  normalizeConfirmedHistory,
  productHistoryCandidates,
  recordConfirmedHistory,
  sanitizeMerchantHistoryValue,
  taxRateHistoryCandidates,
  vendorHistoryCandidates,
  vendorHistoryCandidatesForQueries,
} from '../src/confirmed-history.js';
import { extractSuggestions } from '../src/ocr-extract.js';
import { confirmedHistoryKeyForUser } from '../src/user-storage.js';

test('registered human-confirmed values are stored separately and ranked as future candidates', () => {
  const confirmed = recordConfirmedHistory({}, {
    vendor: '確認店',
    sourceMerchant: '確認店 レジ表記',
    items: [{ sourceProductName: '飲料水500ML', productName: '飲料水 500ml', category: '飲料水', knowledgeKey: 'drinking_water', knowledgeVersion: 2, taxRate: '8' }],
    confirmedAt: '2026-09-12T12:00:00.000Z',
  });

  assert.deepEqual(confirmed.vendors.map((entry) => entry.value), ['確認店']);
  assert.deepEqual(confirmed.items.map((entry) => [entry.productName, entry.category, entry.knowledgeKey]), [['飲料水 500ml', '飲料水', 'drinking_water']]);
  assert.deepEqual(vendorHistoryCandidates(confirmed, '確認').map((entry) => entry.value), ['確認店']);
  assert.deepEqual(productHistoryCandidates(confirmed, '飲料水').map((entry) => entry.productName), ['飲料水 500ml']);
  assert.deepEqual(itemHistoryCandidates(confirmed, '飲料水').map((entry) => entry.knowledgeKey), ['drinking_water']);
  assert.equal(confirmed.merchantCorrections[0].source, 'user_confirmed_history');
  assert.equal(confirmed.merchantCorrections[0].sourceValue, '確認店 レジ表記');
  assert.equal(confirmed.productCorrections[0].confirmedValue, '飲料水 500ml');
  assert.equal(confirmed.productCorrections[0].sourceValue, '飲料水500ML');
  assert.equal(knowledgeHistoryCandidates(confirmed, '飲料水')[0].knowledgeKey, 'drinking_water');
  assert.equal(taxRateHistoryCandidates(confirmed, '飲料水')[0].confirmedTaxRate, '8');
  assert.equal(confirmedHistoryKeyForUser('user-a'), 'child-expense-settlement:user-a:confirmedHistory.v1');
});

test('tax history ranks human-confirmed rates, ignores unknown, and never mutates an item', () => {
  const confirmed = recordConfirmedHistory({}, {
    vendor: '売店',
    items: [
      { productName: 'ネピア ティッシュ 5コパック', category: '衛生用品', knowledgeKey: 'general_hygiene', taxRate: '10' },
      { productName: '未確認商品', category: '', knowledgeKey: null, taxRate: 'unknown' },
    ],
    confirmedAt: '2026-09-14T12:00:00.000Z',
  });
  const item = { productName: 'ネピア ティッシュ 5コパック', taxRate: 'unknown' };
  assert.equal(taxRateHistoryCandidates(confirmed, item.productName)[0].confirmedTaxRate, '10');
  assert.deepEqual(taxRateHistoryCandidates(confirmed, '未確認商品'), []);
  assert.equal(item.taxRate, 'unknown');
});

test('merchant history excludes phone, postal code, and labelled address or register details', () => {
  const merchant = sanitizeMerchantHistoryValue('国立成育医療研究センター 5階売店（くれよん） TEL:03-1234-5678 〒157-8535 住所:東京都世田谷区 レジ番号:12');
  assert.equal(merchant, '国立成育医療研究センター 5階売店（くれよん）');
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

test('OCR vendor candidates supplement a non-matching Reader vendor without duplicate history entries', () => {
  const vendor = '国立成育医療研究センター 5階売店';
  const history = recordConfirmedHistory({}, { vendor, items: [], confirmedAt: '2026-09-12T12:00:00.000Z' });
  const ocrVendorCandidates = extractSuggestions(`くれよん\n${vendor}`).vendors.map((candidate) => candidate.value);

  assert.deepEqual(
    vendorHistoryCandidatesForQueries(history, ['くれよん', ...ocrVendorCandidates, ...ocrVendorCandidates]).map((entry) => entry.value),
    [vendor],
  );
});
