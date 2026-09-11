import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeForAi } from '../src/services/purchasePurposeKnowledge.js';
import { purchasePurposeKnowledgeByKey } from '../src/data/purchasePurposeKnowledge.js';

const expected = [
  ['いろはす（555ml）', 'drinking_water', '飲料水'],
  ['シールブック', 'rehabilitation_training', 'リハビリ・機能訓練用品'],
  ['小児用マスク', 'mask_hygiene', '衛生用品'],
  ['バスボム', 'bathing_aid', '入浴補助用品'],
  ['服薬用ゼリー', 'medication_aid', '服薬補助用品'],
];

test('canonical Knowledge matches product labels and ignores a size qualifier', () => {
  for (const [productName, key, category] of expected) {
    const [match] = knowledgeForAi(productName);
    assert.equal(match?.key, key, productName);
    assert.equal(match?.category, category, productName);
    assert.equal(match?.source, 'user_confirmed_document', productName);
  }
  assert.deepEqual(knowledgeForAi('一般商品'), []);
});

test('canonical drinking-water material keeps the documented original excerpt', () => {
  const water = purchasePurposeKnowledgeByKey('drinking_water');
  assert.match(water.sourceExcerpt, /毎日3本購入しているペットボトル全ての飲料水/);
  assert.match(water.sourceExcerpt, /母\(鈴木さゆり\)の分は別途購入/);
  assert.equal(water.source, 'user_confirmed_document');
  assert.equal(water.version, 2);
});
