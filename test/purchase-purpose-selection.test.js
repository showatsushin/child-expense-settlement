import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptItem } from '../src/models.js';
import {
  applySelectedKnowledge,
  knowledgeCandidatesForProduct,
} from '../src/services/purchasePurposeSelection.js';
import { purchasePurposeKnowledgeByKey } from '../src/data/purchasePurposeKnowledge.js';

test('Knowledge candidates normalize a capacity qualifier and offer no match when none exists', () => {
  assert.equal(knowledgeCandidatesForProduct('いろはす（555ml）')[0].key, 'drinking_water');
  assert.deepEqual(knowledgeCandidatesForProduct('該当しない商品'), []);
});

test('Knowledge candidates may contain more than one matching option', () => {
  const candidates = knowledgeCandidatesForProduct('服薬補助');
  assert.ok(candidates.length >= 2);
});

test('selecting Knowledge copies its exact source excerpt and retains submission status', () => {
  const item = {
    productName: '服薬補助',
    submissionStatus: 'review',
    purpose: { value: '手入力済み', source: 'manual' },
  };
  const selected = applySelectedKnowledge(item, 'medication_aid_non_bitter');
  const knowledge = purchasePurposeKnowledgeByKey('medication_aid_non_bitter');

  assert.equal(selected.category, knowledge.category);
  assert.equal(selected.purpose.value, knowledge.sourceExcerpt);
  assert.equal(selected.purpose.source, 'knowledge');
  assert.equal(selected.knowledgeKey, knowledge.key);
  assert.equal(selected.knowledgeSource, knowledge.source);
  assert.equal(selected.knowledgeVersion, knowledge.version);
  assert.equal(selected.submissionStatus, 'review');
});

test('manual purpose and a custom category remain possible after Knowledge selection', () => {
  const selected = applySelectedKnowledge(
    { productName: 'いろはす（555ml）', submissionStatus: 'included' },
    'drinking_water',
  );
  const saved = createReceiptItem({
    ...selected,
    category: '入院生活用品',
    purpose: { value: '利用者が修正した本文', source: 'manual' },
  });

  assert.equal(saved.category, '入院生活用品');
  assert.equal(saved.purpose.value, '利用者が修正した本文');
  assert.equal(saved.knowledgeKey, 'drinking_water');
  assert.equal(saved.knowledgeVersion, 2);
  assert.equal(saved.submissionStatus, 'included');
});

test('saved source excerpt is a snapshot and has the exact rehabilitation original', () => {
  const selected = applySelectedKnowledge({}, 'rehabilitation_training');
  const knowledge = purchasePurposeKnowledgeByKey('rehabilitation_training');

  assert.equal(selected.purpose.value, knowledge.sourceExcerpt);
  assert.match(selected.purpose.value, /医師から脳症後のリハビリと機能回復/);
  assert.match(selected.purpose.value, /手指の運動機能や巧緻性/);
  assert.match(selected.purpose.value, /注意・集中等の機能への刺激・眼と手の協働、視覚認知等への刺激/);
});
