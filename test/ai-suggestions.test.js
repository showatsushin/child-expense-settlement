import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sourced } from '../src/models.js';
import { AiSuggestionError, suggestAiExpense } from '../src/services/expenseSuggestion.js';

const response = { categorySuggestion: { value: '医療費', confidence: .91, reason: '診療に関する記載があるため' }, reasonSuggestions: [ { style: 'concise', value: '子どもの診察・治療に伴い発生した医療費。', confidence: .9 }, { style: 'standard', value: '2026-09-10、子どもの診察・治療に伴い支払った医療費。', confidence: .86 }, { style: 'detailed', value: '入力された資料に基づく医療費としての支出説明の下書き。', confidence: .8 } ], missingFields: [], needsReview: false };

test('frontend AI successは最小入力だけをWorkerへ送り、AI出所を付与する', async () => {
  let called; const result = await suggestAiExpense({ ocrRawText: '診療', correctedText: '', paidDate: '2026-09-10', vendor: '架空医院', amount: 12800, category: '医療費', child: '子1', notes: '送らない' }, { accessToken: 'test-token', workerUrl: 'https://worker.example', fetchImpl: async (url, init) => { called = { url, init }; return new Response(JSON.stringify(response), { status: 200 }); } });
  assert.equal(called.url, 'https://worker.example/suggest-expense'); assert.equal(called.init.headers.Authorization, 'Bearer test-token'); const payload = JSON.parse(called.init.body); assert.deepEqual(Object.keys(payload).sort(), ['amount', 'category', 'childLabel', 'correctedText', 'ocrText', 'paidDate', 'vendor']); assert.equal(payload.notes, undefined); assert.equal(result.reasonSuggestions[0].source, 'ai'); assert.equal(result.categorySuggestion.value, '医療費');
});
test('frontend AI failureはローカル候補を妨げない汎用エラーになる', async () => { await assert.rejects(() => suggestAiExpense({}, { accessToken: 'token', workerUrl: 'https://worker.example', fetchImpl: async () => { throw new Error('offline'); } }), AiSuggestionError); });
test('AI候補を使用後に手動で編集した値はmanual出所になる', () => { const ai = sourced(response.reasonSuggestions[0].value, 'ai', .9); const manual = sourced(`${ai.value} 確認済み。`, 'manual', null); assert.equal(ai.source, 'ai'); assert.equal(manual.source, 'manual'); });
test('AIは明示クリックのイベント内でだけ呼び出される', async () => { const ui = await readFile(new URL('../reason-suggestions.js', import.meta.url), 'utf8'); const click = ui.indexOf("ai.addEventListener('click'"); const call = ui.indexOf('suggestAiExpense', click); assert.ok(click >= 0 && call > click); });