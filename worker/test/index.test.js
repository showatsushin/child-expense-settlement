import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_CATEGORIES, ITEM_CATEGORIES, HttpError, MAX_BODY_BYTES, handleRequest, normalizeAiResponse } from '../src/index.js';

const env = { ALLOWED_ORIGIN: 'https://showatsushin.github.io' };
const validModelResponse = { response: { categorySuggestion: { value: '医療費', confidence: .91, reason: '診療に関する記載があるため' }, reasonSuggestions: [ { style: 'concise', value: '子どもの診察・治療に伴い発生した医療費。', confidence: .9 }, { style: 'standard', value: '入力された日付と支払先に基づく医療費の下書き。', confidence: .85 }, { style: 'detailed', value: '入力された資料に基づく医療費としての支出説明の下書き。', confidence: .8 } ], missingFields: [], needsReview: false } };
const request = (body = {}, options = {}) => new Request('https://child-expense-ai.steep-tooth-3561.workers.dev/suggest-expense', { method: 'POST', headers: { Origin: 'https://showatsushin.github.io', Authorization: 'Bearer valid-token', 'content-type': 'application/json', ...(options.headers || {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const dependencies = { verifyToken: async () => ({ sub: crypto.randomUUID(), role: 'authenticated' }), runAi: async () => validModelResponse };

test('OPTIONS は許可originへ preflight を返す', async () => { const response = await handleRequest(new Request('https://x/suggest-expense', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGIN } }), env); assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), env.ALLOWED_ORIGIN); });
test('CORS は未許可originを拒否し wildcard を返さない', async () => { const response = await handleRequest(request({}, { headers: { Origin: 'https://evil.example' } }), env, dependencies); assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null); });
test('認証なしは401', async () => { const response = await handleRequest(new Request('https://x/suggest-expense', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, 'content-type': 'application/json' }, body: '{}' }), env, dependencies); assert.equal(response.status, 401); });
test('不正JSONは400', async () => { const response = await handleRequest(request('{bad'), env, dependencies); assert.equal(response.status, 400); });
test('payload上限超過は413', async () => { const payload = `{"ocrText":"${'x'.repeat(MAX_BODY_BYTES)}"}`; const response = await handleRequest(request(payload), env, dependencies); assert.equal(response.status, 413); });
test('費目入力は既存master外を拒否する', async () => { const response = await handleRequest(request({ category: '法務費' }), env, dependencies); assert.equal(response.status, 400); });
test('モデルのenum外費目はその他・要確認へ正規化する', () => { const normalized = normalizeAiResponse({ response: { ...validModelResponse.response, categorySuggestion: { value: '法務費', confidence: 1, reason: 'x' } } }); assert.equal(normalized.categorySuggestion.value, 'その他'); assert.equal(normalized.needsReview, true); });
test('AI invalid JSONは502', async () => { const response = await handleRequest(request(), env, { ...dependencies, runAi: async () => ({ response: 'not json' }) }); assert.equal(response.status, 502); });
test('AIの禁止法的表現は公開responseから除外する', async () => { const invalid = structuredClone(validModelResponse); invalid.response.reasonSuggestions[0].value = '養育費として当然認められる支出。'; const response = await handleRequest(request(), env, { ...dependencies, runAi: async () => invalid }); assert.equal(response.status, 502); });
test('正常AI応答を固定public schemaへ正規化する', async () => { const response = await handleRequest(request({ category: '医療費', vendor: '架空医院' }), env, dependencies); assert.equal(response.status, 200); const body = await response.json(); assert.deepEqual(body.categorySuggestion.value, '医療費'); assert.deepEqual(body.reasonSuggestions.map((item) => item.style), ['concise', 'standard', 'detailed']); assert.ok(ALLOWED_CATEGORIES.includes(body.categorySuggestion.value)); });
test('GETではAIを実行しない', async () => { let called = false; const response = await handleRequest(new Request('https://x/suggest-expense', { method: 'GET', headers: { Origin: env.ALLOWED_ORIGIN } }), env, { ...dependencies, runAi: async () => { called = true; return validModelResponse; } }); assert.equal(response.status, 405); assert.equal(called, false); });
test('不正tokenは401', async () => { const response = await handleRequest(request(), env, { ...dependencies, verifyToken: async () => { throw new HttpError(401, 'INVALID_TOKEN', 'Authentication is invalid'); } }); assert.equal(response.status, 401); });

test('item endpoint returns only item category and purpose candidates', async () => { const model = { response:{ categorySuggestion:{ value:ITEM_CATEGORIES[1],confidence:.8,reason:'product'}, purposeSuggestions:['concise','standard','detailed'].map((style) => ({ style,value:'item '+style,confidence:.7 })), missingFields:[],needsReview:false } }; const response = await handleRequest(new Request('https://x/suggest-item',{ method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,Authorization:'Bearer valid-token','content-type':'application/json'},body:JSON.stringify({productName:'water',category:ITEM_CATEGORIES[1],ocrTextRelevantExcerpt:'water 120'}) }),env,{...dependencies,runAi:async() => model}); assert.equal(response.status,200); const body=await response.json(); assert.equal(body.categorySuggestion.value,ITEM_CATEGORIES[1]); assert.deepEqual(body.purposeSuggestions.map((item) => item.style),['concise','standard','detailed']); });


test('item invalid AI response exposes only diagnostic stage and request id', async () => { const response = await handleRequest(new Request('https://x/suggest-item',{ method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,Authorization:'Bearer valid-token','content-type':'application/json'},body:JSON.stringify({productName:'water'}) }),env,{...dependencies,runAi:async() => ({ response:'not json' })}); const body=await response.json(); assert.equal(response.status,502); assert.equal(body.error.code,'AI_INVALID_RESPONSE'); assert.equal(body.error.stage,'json_parse'); assert.match(body.error.requestId,/^[0-9a-f-]{36}$/); assert.equal('responseKeys' in body.error,false); });

test('reader upstream failure exposes safe stage and request id', async () => { const response = await handleRequest(new Request('https://x/read-receipt',{ method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,Authorization:'Bearer valid-token','content-type':'application/json'},body:JSON.stringify({mimeType:'image/jpeg',imageDataUrl:'data:image/jpeg;base64,AAAA'}) }),env,{...dependencies,readReceipt:async() => { const error=new Error('upstream'); error.code='OPENAI_REQUEST_FAILED'; error.diagnostic={stage:'openai_call',upstreamStatus:429}; throw error; }}); const body=await response.json(); assert.equal(response.status,502); assert.equal(body.error.code,'OPENAI_REQUEST_FAILED'); assert.equal(body.error.stage,'openai_call'); assert.match(body.error.requestId,/^[0-9a-f-]{36}$/); assert.equal('upstreamStatus' in body.error,false); });


test('item Knowledge match overrides generic AI category and stays review-only', async () => {
  let modelCalled = false;
  const knowledgeCandidates = [{ key: 'drinking_water', category: ITEM_CATEGORIES[1], purposeFacts: ['documented purpose one', 'documented purpose two'], authorityFacts: [], separationFacts: [], source: 'user_confirmed_document', matchedAlias: 'water' }];
  const response = await handleRequest(new Request('https://x/suggest-item', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, Authorization: 'Bearer valid-token', 'content-type': 'application/json' }, body: JSON.stringify({ productName: 'water', category: ITEM_CATEGORIES[ITEM_CATEGORIES.length - 1], knowledgeCandidates }) }), env, { ...dependencies, runAi: async () => { modelCalled = true; throw new Error('must not use generic AI for a Knowledge match'); } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(modelCalled, false);
  assert.equal(body.categorySuggestion.value, ITEM_CATEGORIES[1]);
  assert.equal(body.knowledgeKey, 'drinking_water');
  assert.equal(body.needsReview, true);
  assert.deepEqual(body.purposeSuggestions.map((item) => item.style), ['concise', 'standard', 'detailed']);
  assert.match(body.purposeSuggestions[1].value, /documented purpose one/);
});
