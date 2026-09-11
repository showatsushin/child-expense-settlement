import { createLocalJWKSet, jwtVerify } from 'jose';
import { MAX_RECEIPT_READER_BODY_BYTES, readReceiptWithOpenAi, validateReceiptReadInput } from './receiptReader.js';

export const MODEL_ID = '@cf/meta/llama-3.1-8b-instruct-fast';
export const ALLOWED_CATEGORIES = Object.freeze(['食費', '衣類', '医療費', '教育費', '学校費', '保育費', '習い事', '交通費', '通信費', '日用品', '住居関連', '行事費', '保険', 'その他']);
export const ITEM_CATEGORIES = Object.freeze(['\u4ed8\u304d\u6dfb\u3044\u5bdd\u5177\u30ec\u30f3\u30bf\u30eb\u4ee3','\u98f2\u6599\u6c34','\u30ea\u30cf\u30d3\u30ea\u30fb\u6a5f\u80fd\u8a13\u7df4\u7528\u54c1','\u98df\u6599\u54c1','\u670d\u85ac\u88dc\u52a9\u7528\u54c1','\u5165\u6d74\u88dc\u52a9\u7528\u54c1','\u7642\u990a\u30fb\u4ecb\u52a9\u7528\u54c1','\u885b\u751f\u7528\u54c1','\u53ce\u7d0d\u7528\u54c1','\u305d\u306e\u4ed6']);
export const MAX_BODY_BYTES = 24 * 1024;
const MAX_OCR_TEXT = 8000;
const MAX_SHORT_TEXT = 240;
const MAX_REASON_LENGTH = 480;
const AI_TIMEOUT_MS = 12_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const LEGAL_LANGUAGE = /(養育費として当然認められる|法的に負担義務がある|相手方が支払うべき|裁判所で認められる|必ず清算対象となる|法律上必要である|法的(?:に|判断)|裁判所|支払義務|養育費として)/;
const requestRates = new Map();
let jwksCache = { until: 0, keySet: null };

export class HttpError extends Error { constructor(status, code, message, diagnostic = {}) { super(message); this.name = 'HttpError'; this.status = status; this.code = code; this.diagnostic = diagnostic; } }
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const byteLength = (value) => new TextEncoder().encode(value).byteLength;
const asText = (value, field, limit) => { if (value == null) return ''; if (typeof value !== 'string') throw new HttpError(400, 'MALFORMED_REQUEST', `${field} must be a string`); const trimmed = value.trim(); if (trimmed.length > limit) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `${field} is too large`); return trimmed; };

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = [env.ALLOWED_ORIGIN || 'https://showatsushin.github.io', env.DEV_ALLOWED_ORIGIN].filter(Boolean);
  if (origin && !allowed.includes(origin)) throw new HttpError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed');
  return origin && allowed.includes(origin) ? origin : '';
}
function corsHeaders(origin) { return origin ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600', vary: 'Origin' } : {}; }
function response(body, status, origin) { return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...corsHeaders(origin) } }); }
const DIAGNOSTIC_STAGES = new Set(['route', 'auth', 'validation', 'ai_call', 'ai_response_received', 'json_parse', 'schema_validation', 'response_mapping', 'openai_call', 'openai_response_received', 'structured_output_parse']);
const diagnosticText = (value) => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(value) ? value : null;
const diagnosticKeys = (value) => Array.isArray(value) ? value.filter((key) => diagnosticText(key)).slice(0, 20) : [];
function diagnosticFor(error, fallbackStage) { const raw = error?.diagnostic || {}; return { stage: DIAGNOSTIC_STAGES.has(raw.stage) ? raw.stage : fallbackStage, upstreamStatus: Number.isInteger(raw.upstreamStatus) ? raw.upstreamStatus : null, errorClass: diagnosticText(error?.name) || 'Error', errorCode: diagnosticText(error?.code) || (error instanceof HttpError ? error.code : 'INTERNAL_ERROR'), schemaField: diagnosticText(raw.schemaField), responseKeys: diagnosticKeys(raw.responseKeys), timeout: Boolean(raw.timeout) }; }
function errorResponse(error, origin, diagnostic) { const status = error instanceof HttpError ? error.status : 500; const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR'; return response({ error: { code, message: status >= 500 ? 'AI提案を取得できませんでした。ローカル候補は引き続き利用できます。' : error.message, stage: diagnostic.stage, requestId: diagnostic.requestId } }, status, origin); }
function logResult({ requestId, route, provider, model, status, startedAt, diagnostic }) { console.log(JSON.stringify({ event: 'ai_diagnostic', route, requestId, status, latencyMs: Date.now() - startedAt, provider, model, stage: diagnostic.stage, errorClass: diagnostic.errorClass, errorCode: diagnostic.errorCode, ...(diagnostic.upstreamStatus != null ? { upstreamStatus: diagnostic.upstreamStatus } : {}), ...(diagnostic.schemaField ? { schemaField: diagnostic.schemaField } : {}), ...(diagnostic.responseKeys.length ? { responseKeys: diagnostic.responseKeys } : {}), ...(diagnostic.timeout ? { timeout: true } : {}) })); }
function bearer(request) { const value = request.headers.get('Authorization') || ''; const match = /^Bearer\s+([^\s]+)$/i.exec(value); if (!match) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required'); return match[1]; }

export function validateInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'MALFORMED_REQUEST', 'Request must be an object');
  const category = asText(value.category, 'category', 40);
  if (category && !ALLOWED_CATEGORIES.includes(category)) throw new HttpError(400, 'INVALID_CATEGORY', 'category must be an existing category');
  const amount = value.amount == null || value.amount === '' ? null : Number(value.amount);
  if (amount != null && (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000)) throw new HttpError(400, 'MALFORMED_REQUEST', 'amount is invalid');
  return {
    ocrText: asText(value.ocrText, 'ocrText', MAX_OCR_TEXT), correctedText: asText(value.correctedText, 'correctedText', MAX_OCR_TEXT),
    paidDate: asText(value.paidDate, 'paidDate', 20), vendor: asText(value.vendor, 'vendor', MAX_SHORT_TEXT), amount,
    category, childLabel: asText(value.childLabel, 'childLabel', MAX_SHORT_TEXT),
  };
}

function textList(value, field, maxItems, maxLength) {
  if (!Array.isArray(value)) throw new HttpError(400, 'MALFORMED_REQUEST', field + ' must be an array');
  return value.slice(0, maxItems).map((item, index) => asText(item, field + '.' + index, maxLength)).filter(Boolean);
}

function validateKnowledgeCandidates(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, 'MALFORMED_REQUEST', 'knowledgeCandidates must be an array');
  return value.slice(0, 5).map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new HttpError(400, 'MALFORMED_REQUEST', 'knowledgeCandidates.' + index + ' must be an object');
    const key = asText(candidate.key, 'knowledgeCandidates.' + index + '.key', 80);
    const category = asText(candidate.category, 'knowledgeCandidates.' + index + '.category', 80);
    if (!key || !ITEM_CATEGORIES.includes(category)) throw new HttpError(400, 'INVALID_KNOWLEDGE_CANDIDATE', 'knowledge candidate is invalid');
    const purposeFacts = textList(candidate.purposeFacts, 'knowledgeCandidates.' + index + '.purposeFacts', 12, MAX_SHORT_TEXT);
    if (!purposeFacts.length) throw new HttpError(400, 'INVALID_KNOWLEDGE_CANDIDATE', 'knowledge candidate needs purpose facts');
    const source = asText(candidate.source, 'knowledgeCandidates.' + index + '.source', 80);
    if (source !== 'user_confirmed_document') throw new HttpError(400, 'INVALID_KNOWLEDGE_CANDIDATE', 'knowledge source is invalid');
    return {
      key,
      category,
      purposeFacts,
      authorityFacts: textList(candidate.authorityFacts || [], 'knowledgeCandidates.' + index + '.authorityFacts', 8, MAX_SHORT_TEXT),
      separationFacts: textList(candidate.separationFacts || [], 'knowledgeCandidates.' + index + '.separationFacts', 8, MAX_SHORT_TEXT),
      source,
      matchedAlias: asText(candidate.matchedAlias, 'knowledgeCandidates.' + index + '.matchedAlias', MAX_SHORT_TEXT),
    };
  });
}

export function validateItemInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'MALFORMED_REQUEST', 'Request must be an object');
  const category = asText(value.category, 'category', 80);
  if (category && !ITEM_CATEGORIES.includes(category)) throw new HttpError(400, 'INVALID_ITEM_CATEGORY', 'category must be an existing item category');
  return {
    productName: asText(value.productName, 'productName', MAX_SHORT_TEXT),
    category,
    purchaseDate: asText(value.purchaseDate, 'purchaseDate', 20),
    vendor: asText(value.vendor, 'vendor', MAX_SHORT_TEXT),
    ocrTextRelevantExcerpt: asText(value.ocrTextRelevantExcerpt, 'ocrTextRelevantExcerpt', MAX_OCR_TEXT),
    childLabel: asText(value.childLabel, 'childLabel', MAX_SHORT_TEXT),
    existingContext: asText(value.existingContext, 'existingContext', 1000),
    knowledgeCandidates: validateKnowledgeCandidates(value.knowledgeCandidates),
  };
}

async function projectKeySet(env) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, ''); if (!base) throw new HttpError(500, 'AUTH_CONFIGURATION_ERROR', 'Authentication verification is not configured');
  if (jwksCache.keySet && jwksCache.until > Date.now()) return jwksCache.keySet;
  const jwksResponse = await fetch(`${base}/auth/v1/.well-known/jwks.json`);
  if (!jwksResponse.ok) throw new HttpError(503, 'AUTH_VERIFICATION_UNAVAILABLE', 'Authentication verification is unavailable');
  const jwks = await jwksResponse.json();
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) return null;
  jwksCache = { keySet: createLocalJWKSet(jwks), until: Date.now() + 10 * 60_000 };
  return jwksCache.keySet;
}
export async function verifySupabaseToken(token, env) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, ''); const keySet = await projectKeySet(env);
  if (keySet) {
    try { const verified = await jwtVerify(token, keySet, { issuer: `${base}/auth/v1`, audience: 'authenticated' }); if (!verified.payload.sub || verified.payload.role !== 'authenticated') throw new Error('missing authenticated claims'); return verified.payload; }
    catch { throw new HttpError(401, 'INVALID_TOKEN', 'Authentication is invalid'); }
  }
  if (!env.SUPABASE_ANON_KEY) throw new HttpError(500, 'AUTH_CONFIGURATION_ERROR', 'Authentication verification is not configured');
  const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!userResponse.ok) throw new HttpError(401, 'INVALID_TOKEN', 'Authentication is invalid');
  const user = await userResponse.json(); if (!user?.id) throw new HttpError(401, 'INVALID_TOKEN', 'Authentication is invalid'); return { sub: user.id, role: 'authenticated' };
}
function checkRateLimit(subject) { const now = Date.now(); const state = requestRates.get(subject); const next = !state || now - state.startedAt >= RATE_WINDOW_MS ? { startedAt: now, count: 1 } : { ...state, count: state.count + 1 }; requestRates.set(subject, next); if (next.count > RATE_LIMIT) throw new HttpError(429, 'RATE_LIMITED', 'Too many AI suggestion requests'); }
const aiResponseKeys = (value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).filter((key) => diagnosticText(key)).sort().slice(0, 20) : [];
function aiResponseError(stage, schemaField, keys = []) { return new HttpError(502, 'AI_INVALID_RESPONSE', 'AI response is invalid', { stage, schemaField, responseKeys: keys }); }
function extractAiPayload(result) { const candidate = result?.response ?? result; if (typeof candidate === 'string') { try { return JSON.parse(candidate); } catch { throw aiResponseError('json_parse', 'response', aiResponseKeys(result)); } } if (!candidate || typeof candidate !== 'object') throw aiResponseError('schema_validation', 'root', aiResponseKeys(result)); return candidate; }
const confidence = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1 ? Number(value) : 0;
const safeText = (value, field, limit) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || LEGAL_LANGUAGE.test(value)) throw aiResponseError('schema_validation', field); return value.trim(); };
export function normalizeAiResponse(result) {
  const raw = extractAiPayload(result); const categoryInput = raw.categorySuggestion || {}; const categoryValid = ALLOWED_CATEGORIES.includes(categoryInput.value);
  const categorySuggestion = { value: categoryValid ? categoryInput.value : 'その他', confidence: categoryValid ? confidence(categoryInput.confidence) : 0, reason: categoryValid ? safeText(categoryInput.reason, 'category reason', MAX_SHORT_TEXT) : '既存の費目に一致しないため要確認' };
  if (!Array.isArray(raw.reasonSuggestions)) throw aiResponseError('schema_validation', 'reasonSuggestions', aiResponseKeys(raw));
  const styles = ['concise', 'standard', 'detailed']; const byStyle = new Map(raw.reasonSuggestions.map((item) => [item?.style, item]));
  const reasonSuggestions = styles.map((style) => { const item = byStyle.get(style); if (!item) throw aiResponseError('schema_validation', 'reasonSuggestions.' + style, aiResponseKeys(raw)); return { style, value: safeText(item.value, 'reasonSuggestions.' + style, MAX_REASON_LENGTH), confidence: confidence(item.confidence) }; });
  const missingFields = Array.isArray(raw.missingFields) ? [...new Set(raw.missingFields.filter((field) => ['ocrText', 'correctedText', 'paidDate', 'vendor', 'amount', 'category', 'childLabel'].includes(field)))].slice(0, 7) : [];
  return { categorySuggestion, reasonSuggestions, missingFields, needsReview: Boolean(raw.needsReview) || !categoryValid };
}
export function normalizeItemAiResponse(result) {
  const raw = extractAiPayload(result); const categoryInput = raw.categorySuggestion || {}; const categoryValid = ITEM_CATEGORIES.includes(categoryInput.value);
  const categorySuggestion = { value: categoryValid ? categoryInput.value : '\u305d\u306e\u4ed6', confidence: categoryValid ? confidence(categoryInput.confidence) : 0, reason: categoryValid ? safeText(categoryInput.reason, 'item category reason', MAX_SHORT_TEXT) : '\u5546\u54c1\u7a2e\u5225\u306b\u4e00\u81f4\u3057\u306a\u3044\u305f\u3081\u8981\u78ba\u8a8d' };
  const source = Array.isArray(raw.purposeSuggestions) ? raw.purposeSuggestions : raw.reasonSuggestions;
  if (!Array.isArray(source)) throw aiResponseError('schema_validation', 'purposeSuggestions', aiResponseKeys(raw));
  const styles = ['concise', 'standard', 'detailed']; const byStyle = new Map(source.map((item) => [item?.style, item]));
  const purposeSuggestions = styles.map((style) => { const item = byStyle.get(style); if (!item) throw aiResponseError('schema_validation', 'purposeSuggestions.' + style, aiResponseKeys(raw)); return { style, value: safeText(item.value, 'purposeSuggestions.' + style, MAX_REASON_LENGTH), confidence: confidence(item.confidence) }; });
  const missingFields = Array.isArray(raw.missingFields) ? [...new Set(raw.missingFields.filter((field) => ['productName', 'category', 'purchaseDate', 'vendor', 'ocrTextRelevantExcerpt', 'childLabel', 'existingContext'].includes(field)))].slice(0, 7) : [];
  return { categorySuggestion, purposeSuggestions, missingFields, needsReview: Boolean(raw.needsReview) || !categoryValid };
}

// Workers AI can satisfy the array schema while repeating a style.  Map by
// position so the product contract does not turn a valid response into 502.
normalizeItemAiResponse = (result) => {
  const raw = extractAiPayload(result); const category = raw.categorySuggestion || {}; const categoryValid = ITEM_CATEGORIES.includes(category.value); const source = Array.isArray(raw.purposeSuggestions) ? raw.purposeSuggestions : raw.reasonSuggestions;
  if (!Array.isArray(source) || source.length === 0) throw aiResponseError('schema_validation', 'purposeSuggestions', aiResponseKeys(raw));
  const purposeSuggestions = ['concise', 'standard', 'detailed'].map((style, index) => { const item = source[index] || source[0]; return { style, value: safeText(item?.value, `purposeSuggestions.${style}`, MAX_REASON_LENGTH), confidence: confidence(item?.confidence) }; });
  return { categorySuggestion: { value: categoryValid ? category.value : '???', confidence: categoryValid ? confidence(category.confidence) : 0, reason: categoryValid ? safeText(category.reason, 'item category reason', MAX_SHORT_TEXT) : '?????????????' }, purposeSuggestions, missingFields: [], needsReview: true, knowledgeKey: typeof raw.knowledgeKey === 'string' ? raw.knowledgeKey.slice(0, 80) : null };
};
function aiSchema() { return { type: 'object', properties: { categorySuggestion: { type: 'object', properties: { value: { type: 'string', enum: ALLOWED_CATEGORIES }, confidence: { type: 'number' }, reason: { type: 'string' } }, required: ['value', 'confidence', 'reason'], additionalProperties: false }, reasonSuggestions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { style: { type: 'string', enum: ['concise', 'standard', 'detailed'] }, value: { type: 'string' }, confidence: { type: 'number' } }, required: ['style', 'value', 'confidence'], additionalProperties: false } }, missingFields: { type: 'array', items: { type: 'string' } }, needsReview: { type: 'boolean' } }, required: ['categorySuggestion', 'reasonSuggestions', 'missingFields', 'needsReview'], additionalProperties: false }; }
function factsSentence(facts) {
  const selected = [];
  for (const fact of facts) {
    const next = [...selected, fact].join('?');
    if (next.length + 1 > MAX_REASON_LENGTH) break;
    selected.push(fact);
  }
  return selected.join('?') + '?';
}

function knowledgeItemSuggestion(input) {
  const knowledge = input.knowledgeCandidates[0];
  const detailedFacts = [...knowledge.purposeFacts, ...knowledge.authorityFacts, ...knowledge.separationFacts];
  return {
    categorySuggestion: { value: knowledge.category, confidence: 1, reason: 'Registered Knowledge: ' + knowledge.key },
    purposeSuggestions: [
      { style: 'concise', value: factsSentence(knowledge.purposeFacts.slice(0, 1)), confidence: 1 },
      { style: 'standard', value: factsSentence(knowledge.purposeFacts), confidence: 1 },
      { style: 'detailed', value: factsSentence(detailedFacts), confidence: 1 },
    ],
    missingFields: [],
    needsReview: true,
    knowledgeKey: knowledge.key,
    basis: 'registered_knowledge',
  };
}

function itemAiSchema() { return { type: 'object', properties: { categorySuggestion: { type: 'object', properties: { value: { type: 'string', enum: ITEM_CATEGORIES }, confidence: { type: 'number' }, reason: { type: 'string' } }, required: ['value', 'confidence', 'reason'], additionalProperties: false }, purposeSuggestions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { style: { type: 'string', enum: ['concise', 'standard', 'detailed'] }, value: { type: 'string' }, confidence: { type: 'number' } }, required: ['style', 'value', 'confidence'], additionalProperties: false } }, missingFields: { type: 'array', items: { type: 'string' } }, needsReview: { type: 'boolean' }, knowledgeKey: { type: 'string' } }, required: ['categorySuggestion', 'purposeSuggestions', 'missingFields', 'needsReview'], additionalProperties: false }; }
function itemAiMessages(input) { return [{ role: 'system', content: 'Create review-only item category and purpose suggestions. When knowledgeCandidates is non-empty, registered knowledge is higher priority than every other input and general inference. Use only its documented facts, category, and key; do not add facts. The category must equal the selected knowledge category, knowledgeKey must equal its key, and needsReview must be true. When no Knowledge matches, mark general inference as needsReview. Never invent medical instructions, permissions, conditions, legal conclusions, or submission decisions. Return only JSON matching the schema.' }, { role: 'user', content: JSON.stringify(input) }]; }

function aiMessages(input) { return [{ role: 'system', content: 'あなたは子ども関連支出の資料整理補助です。法的判断、相手の支払義務、養育費として認められること、裁判所で認められること、負担割合の決定をしてはいけません。入力された事実だけを使い、存在しない事実を追加しないでください。日本語で簡潔に回答し、指定JSON schema以外を返さないでください。支出理由は第三者が読んで事実関係を理解できる下書きにしてください。' }, { role: 'user', content: JSON.stringify(input) }]; }
function withTimeout(promise) { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new HttpError(504, 'AI_TIMEOUT', 'AI request timed out')), AI_TIMEOUT_MS); })]).finally(() => clearTimeout(timer)); }

export async function handleRequest(request, env, dependencies = {}) {
  const requestId = crypto.randomUUID(); const startedAt = Date.now(); let origin = '', route = 'unknown', provider = 'cloudflare_ai', model = MODEL_ID, stage = 'route';
  try {
    origin = allowedOrigin(request, env); const url = new URL(request.url); const itemRequest = url.pathname === '/suggest-item';
    const readerRequest = url.pathname === '/read-receipt';
    route = readerRequest ? 'read_receipt' : itemRequest ? 'suggest_item' : url.pathname === '/suggest-expense' ? 'suggest_expense' : 'unknown';
    if (readerRequest) {
      provider = 'openai'; model = env.OPENAI_RECEIPT_READER_MODEL || 'gpt-4.1-mini'; stage = 'route';
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST');
      stage = 'validation';

      const contentLength = Number(request.headers.get('content-length') || 0); if (contentLength > MAX_RECEIPT_READER_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload is too large');
      const bodyText = await request.text(); if (byteLength(bodyText) > MAX_RECEIPT_READER_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload is too large');
      let body; try { body = JSON.parse(bodyText); } catch { throw new HttpError(400, 'MALFORMED_REQUEST', 'Request JSON is invalid'); }
      let input; try { input = validateReceiptReadInput(body); } catch (error) { throw new HttpError(/large/i.test(error.message) ? 413 : 400, /large/i.test(error.message) ? 'PAYLOAD_TOO_LARGE' : 'INVALID_RECEIPT_IMAGE', error.message); }
      stage = 'auth'; const claims = await (dependencies.verifyToken || verifySupabaseToken)(bearer(request), env); checkRateLimit(claims.sub);

      let normalized;
      stage = 'openai_call';

      try { normalized = await (dependencies.readReceipt || readReceiptWithOpenAi)(input, env, { fetchImpl: dependencies.fetchOpenAi || fetch }); }

      catch (error) { const code = error?.code || 'OPENAI_UNAVAILABLE'; const status = code === 'OPENAI_TIMEOUT' ? 504 : code === 'OPENAI_NOT_CONFIGURED' ? 503 : 502; throw new HttpError(status, code, 'High-accuracy receipt reading failed', error?.diagnostic || { stage }); }
      console.log(JSON.stringify({ event: 'read_receipt', provider: 'openai', requestId, status: 200, latencyMs: Date.now() - startedAt, model: normalized.metadata?.model || null, usage: normalized.metadata?.usage || null }));
      console.log(JSON.stringify({ event: 'read_receipt_quality', requestId, provider: 'openai', model: normalized.metadata?.model || null, itemsCount: normalized.items.length, workerItemsCount: normalized.items.length, receiptTotalPresent: normalized.receiptTotalAmount != null, vendorPresent: Boolean(normalized.vendor), purchaseDatePresent: Boolean(normalized.purchaseDate), quality: normalized.quality?.status || 'failed', secondPassUsed: Boolean(normalized.metadata?.secondPassUsed), secondPassFailed: Boolean(normalized.metadata?.secondPassFailed), imageBytes: Math.max(0, Math.floor((input.imageDataUrl.split(',')[1]?.length || 0) * 3 / 4)), latencyMs: Date.now() - startedAt }));
      return response(normalized, 200, origin);
    }
    if (!itemRequest && url.pathname !== '/suggest-expense') throw new HttpError(404, 'NOT_FOUND', 'Not found');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST');
    stage = 'validation';

    const contentLength = Number(request.headers.get('content-length') || 0); if (contentLength > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload is too large');
    const bodyText = await request.text(); if (byteLength(bodyText) > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload is too large');
    let body; try { body = JSON.parse(bodyText); } catch { throw new HttpError(400, 'MALFORMED_REQUEST', 'Request JSON is invalid'); }
    const input = itemRequest ? validateItemInput(body) : validateInput(body); stage = 'auth'; const claims = await (dependencies.verifyToken || verifySupabaseToken)(bearer(request), env); checkRateLimit(claims.sub);
    let normalized;
    if (itemRequest && input.knowledgeCandidates.length) {
      stage = 'response_mapping';
      normalized = knowledgeItemSuggestion(input);
    } else {
      const run = dependencies.runAi || ((model, options) => env.AI.run(model, options));
      stage = 'ai_call';
      const raw = await withTimeout(run(MODEL_ID, { messages: itemRequest ? itemAiMessages(input) : aiMessages(input), max_tokens: 320, temperature: 0.2, response_format: { type: 'json_schema', json_schema: itemRequest ? itemAiSchema() : aiSchema() } }));
      stage = 'ai_response_received';
      normalized = itemRequest ? normalizeItemAiResponse(raw) : normalizeAiResponse(raw);
      stage = 'response_mapping';
    }
    logResult({ requestId, route, provider, model, status: 200, startedAt, diagnostic: { stage, errorClass: 'None', errorCode: 'NONE', upstreamStatus: null, schemaField: null, responseKeys: [], timeout: false } }); return response(normalized, 200, origin);
  } catch (error) { const status = error instanceof HttpError ? error.status : 500; const diagnostic = { ...diagnosticFor(error, stage), requestId }; logResult({ requestId, route, provider, model, status, startedAt, diagnostic }); return errorResponse(error, origin, diagnostic); }
}

export default { fetch(request, env) { return handleRequest(request, env); } };