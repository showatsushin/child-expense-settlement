import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeForAi } from '../src/services/purchasePurposeKnowledge.js';
import { suggestItemWithKnowledge } from '../src/services/knowledgeItemSuggestion.js';

const expected = [
  ['\u3044\u308d\u306f\u3059\uff08555ml\uff09', 'drinking_water', '\u98f2\u6599\u6c34'],
  ['\u30b7\u30fc\u30eb\u30d6\u30c3\u30af', 'rehabilitation_training', '\u30ea\u30cf\u30d3\u30ea\u30fb\u6a5f\u80fd\u8a13\u7df4\u7528\u54c1'],
  ['\u5c0f\u5150\u7528\u30de\u30b9\u30af', 'mask_hygiene', '\u885b\u751f\u7528\u54c1'],
  ['\u30d0\u30b9\u30dc\u30e0', 'bathing_aid', '\u5165\u6d74\u88dc\u52a9\u7528\u54c1'],
  ['\u670d\u85ac\u7528\u30bc\u30ea\u30fc', 'medication_aid', '\u670d\u85ac\u88dc\u52a9\u7528\u54c1'],
];

test('canonical Knowledge matches product labels and ignores a size qualifier', () => {
  for (const [productName, key, category] of expected) {
    const [match] = knowledgeForAi(productName);
    assert.equal(match?.key, key, productName);
    assert.equal(match?.category, category, productName);
    assert.equal(match?.source, 'user_confirmed_document', productName);
  }
  assert.deepEqual(knowledgeForAi('\u4e00\u822c\u5546\u54c1'), []);
});

test('Knowledge match is sent structurally and remains the displayed basis', async () => {
  let payload;
  const [match] = knowledgeForAi('\u3044\u308d\u306f\u3059\uff08555ml\uff09');
  const response = {
    categorySuggestion: { value: match.category, confidence: 1, reason: 'Registered Knowledge: drinking_water' },
    purposeSuggestions: ['concise', 'standard', 'detailed'].map((style) => ({ style, value: match.purposeFacts.join('\u3002') + '\u3002', confidence: 1 })),
    knowledgeKey: match.key,
    needsReview: true,
    missingFields: [],
  };
  const result = await suggestItemWithKnowledge({ productName: '\u3044\u308d\u306f\u3059\uff08555ml\uff09' }, {}, '', {
    accessToken: 'token', workerUrl: 'https://worker.example', fetchImpl: async (_url, init) => {
      payload = JSON.parse(init.body);
      return new Response(JSON.stringify(response), { status: 200 });
    },
  });
  assert.equal(payload.knowledgeCandidates[0].key, 'drinking_water');
  assert.equal(payload.knowledgeCandidates[0].category, '\u98f2\u6599\u6c34');
  assert.deepEqual(payload.knowledgeCandidates[0].purposeFacts, match.purposeFacts);
  assert.equal(result.categorySuggestion.value, '\u98f2\u6599\u6c34');
  assert.equal(result.knowledgeKey, 'drinking_water');
  assert.equal(result.needsReview, true);
  assert.match(result.categorySuggestion.reason, /Knowledge/);
});
