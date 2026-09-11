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

export class HttpError extends Error { constructor(status, code, message) { super(message); this.name = 'HttpError'; this.status = status; this.code = code; } }
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
function errorResponse(error, origin) { const status = error instanceof HttpError ? error.status : 500; const code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR'; return response({ error: { code, message: status >= 500 ? 'AI提案を取得できませんでした。ローカル候補は引き続き利用できます。' : error.message } }, status, origin); }
function logResult({ requestId, status, startedAt, error }) { console.log(JSON.stringify({ event: 'suggest_expense', requestId, status, latencyMs: Date.now() - startedAt, model: MODEL_ID, ...(error ? { error } : {}) })); }
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

export function validateItemInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'MALFORMED_REQUEST', 'Request must be an object');
  const category = asText(value.category, 'category', 80);
  if (category && !ITEM_CATEGORIES.includes(category)) throw new HttpError(400, 'INVALID_ITEM_CATEGORY', 'category must be an existing item category');
  return { productName: asText(value.productName, 'productName', MAX_SHORT_TEXT), category, purchaseDate: asText(value.purchaseDate, 'purchaseDate', 20), vendor: asText(value.vendor, 'vendor', MAX_SHORT_TEXT), ocrTextRelevantExcerpt: asText(value.ocrTextRelevantExcerpt, 'ocrTextRelevantExcerpt', MAX_OCR_TEXT), childLabel: asText(value.childLabel, 'childLabel', MAX_SHORT_TEXT), existingContext: asText(value.existingContext, 'existingContext', 1000) };
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
function extractAiPayload(result) { const candidate = result?.response ?? result; if (typeof candidate === 'string') { try { return JSON.parse(candidate); } catch { throw new HttpError(502, 'AI_INVALID_RESPONSE', 'AI response is invalid'); } } if (!candidate || typeof candidate !== 'object') throw new HttpError(502, 'AI_INVALID_RESPONSE', 'AI response is invalid'); return candidate; }
const confidence = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1 ? Number(value) : 0;
const safeText = (value, field, limit) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > limit || LEGAL_LANGUAGE.test(value)) throw new HttpError(502, 'AI_INVALID_RESPONSE', `${field} is invalid`); return value.trim(); };
export function normalizeAiResponse(result) {
  const raw = extractAiPayload(result); const categoryInput = raw.categorySuggestion || {}; const categoryValid = ALLOWED_CATEGORIES.includes(categoryInput.value);
  const categorySuggestion = { value: categoryValid ? categoryInput.value : 'その他', confidence: categoryValid ? confidence(categoryInput.confidence) : 0, reason: categoryValid ? safeText(categoryInput.reason, 'category reason', MAX_SHORT_TEXT) : '既存の費目に一致しないため要確認' };
  if (!Array.isArray(raw.reasonSuggestions)) throw new HttpError(502, 'AI_INVALID_RESPONSE', 'AI reasons are invalid');
  const styles = ['concise', 'standard', 'detailed']; const byStyle = new Map(raw.reasonSuggestions.map((item) => [item?.style, item]));
  const reasonSuggestions = styles.map((style) => { const item = byStyle.get(style); if (!item) throw new HttpError(502, 'AI_INVALID_RESPONSE', 'AI reasons are incomplete'); return { style, value: safeText(item.value, `reason ${style}`, MAX_REASON_LENGTH), confidence: confidence(item.confidence) }; });
  const missingFields = Array.isArray(raw.missingFields) ? [...new Set(raw.missingFields.filter((field) => ['ocrText', 'correctedText', 'paidDate', 'vendor', 'amount', 'category', 'childLabel'].includes(field)))].slice(0, 7) : [];
  return { categorySuggestion, reasonSuggestions, missingFields, needsReview: Boolean(raw.needsReview) || !categoryValid };
}
export function normalizeItemAiResponse(result) {
  const raw = extractAiPayload(result); const categoryInput = raw.categorySuggestion || {}; const categoryValid = ITEM_CATEGORIES.includes(categoryInput.value);
  const categorySuggestion = { value: categoryValid ? categoryInput.value : '\u305d\u306e\u4ed6', confidence: categoryValid ? confidence(categoryInput.confidence) : 0, reason: categoryValid ? safeText(categoryInput.reason, 'item category reason', MAX_SHORT_TEXT) : '\u5546\u54c1\u7a2e\u5225\u306b\u4e00\u81f4\u3057\u306a\u3044\u305f\u3081\u8981\u78ba\u8a8d' };
  const source = Array.isArray(raw.purposeSuggestions) ? raw.purposeSuggestions : raw.reasonSuggestions;
  if (!Array.isArray(source)) throw new HttpError(502, 'AI_INVALID_RESPONSE', 'AI purposes are invalid');
  const styles = ['concise', 'standard', 'detailed']; const byStyle = new Map(source.map((item) => [item?.style, item]));
  const purposeSuggestions = styles.map((style) => { const item = byStyle.get(style); if (!item) throw new HttpError(502, 'AI_INVALID_RESPONSE', 'AI purposes are incomplete'); return { style, value: safeText(item.value, 'purpose ' + style, MAX_REASON_LENGTH), confidence: confidence(item.confidence) }; });
  const missingFields = Array.isArray(raw.missingFields) ? [...new Set(raw.missingFields.filter((field) => ['productName', 'category', 'purchaseDate', 'vendor', 'ocrTextRelevantExcerpt', 'childLabel', 'existingContext'].includes(field)))].slice(0, 7) : [];
  return { categorySuggestion, purposeSuggestions, missingFields, needsReview: Boolean(raw.needsReview) || !categoryValid };
}

function aiSchema() { return { type: 'object', properties: { categorySuggestion: { type: 'object', properties: { value: { type: 'string', enum: ALLOWED_CATEGORIES }, confidence: { type: 'number' }, reason: { type: 'string' } }, required: ['value', 'confidence', 'reason'], additionalProperties: false }, reasonSuggestions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { style: { type: 'string', enum: ['concise', 'standard', 'detailed'] }, value: { type: 'string' }, confidence: { type: 'number' } }, required: ['style', 'value', 'confidence'], additionalProperties: false } }, missingFields: { type: 'array', items: { type: 'string' } }, needsReview: { type: 'boolean' } }, required: ['categorySuggestion', 'reasonSuggestions', 'missingFields', 'needsReview'], additionalProperties: false }; }
function itemAiSchema() { return { type: 'object', properties: { categorySuggestion: { type: 'object', properties: { value: { type: 'string', enum: ITEM_CATEGORIES }, confidence: { type: 'number' }, reason: { type: 'string' } }, required: ['value', 'confidence', 'reason'], additionalProperties: false }, purposeSuggestions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { style: { type: 'string', enum: ['concise', 'standard', 'detailed'] }, value: { type: 'string' }, confidence: { type: 'number' } }, required: ['style', 'value', 'confidence'], additionalProperties: false } }, missingFields: { type: 'array', items: { type: 'string' } }, needsReview: { type: 'boolean' } }, required: ['categorySuggestion', 'purposeSuggestions', 'missingFields', 'needsReview'], additionalProperties: false }; }
function itemAiMessages(input) { return [{ role: 'system', content: '\u5546\u54c1\u5358\u4f4d\u306e\u7a2e\u5225\u3068\u8cfc\u5165\u76ee\u7684\u306e\u5019\u88dc\u3092\u4f5c\u6210\u3059\u308b\u88dc\u52a9\u3067\u3059\u3002\u5165\u529b\u306b\u306a\u3044\u4e8b\u5b9f\u3001\u6cd5\u7684\u5224\u65ad\u3001\u533b\u7642\u8005\u7b49\u306e\u6307\u793a\u3092\u5275\u4f5c\u305b\u305a\u3001\u4eba\u306e\u78ba\u8a8d\u3092\u5fc5\u8981\u3068\u3059\u308b\u5019\u88dc\u3060\u3051\u3092JSON schema\u306b\u5f93\u3063\u3066\u8fd4\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u539f\u672c\u753b\u50cf\u3084PDF\u306f\u9001\u4fe1\u3055\u308c\u307e\u305b\u3093\u3002' }, { role: 'user', content: JSON.stringify(input) }]; }

function aiMessages(input) { return [{ role: 'system', content: 'あなたは子ども関連支出の資料整理補助です。法的判断、相手の支払義務、養育費として認められること、裁判所で認められること、負担割合の決定をしてはいけません。入力された事実だけを使い、存在しない事実を追加しないでください。日本語で簡潔に回答し、指定JSON schema以外を返さないでください。支出理由は第三者が読んで事実関係を理解できる下書きにしてください。' }, { role: 'user', content: JSON.stringify(input) }]; }
function withTimeout(promise) { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new HttpError(504, 'AI_TIMEOUT', 'AI request timed out')), AI_TIMEOUT_MS); })]).finally(() => clearTimeout(timer)); }

export async function handleRequest(request, env, dependencies = {}) {
  const requestId = crypto.randomUUID(); const startedAt = Date.now(); let origin = '';
  try {
    origin = allowedOrigin(request, env); const url = new URL(request.url); const itemRequest = url.pathname === '/suggest-item';
    const readerRequest = url.pathname === '/read-receipt';
    if (readerRequest) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST');
      const contentLength = Number(request.headers.get('content-length') || 0); if (contentLength > MAX_RECEIPT_READER_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload is too large');
      const bodyText = await request.text(); if (byteLength(bodyText) > MAX_RECEIPT_READER_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload is too large');
      let body; try { body = JSON.parse(bodyText); } catch { throw new HttpError(400, 'MALFORMED_REQUEST', 'Request JSON is invalid'); }
      let input; try { input = validateReceiptReadInput(body); } catch (error) { throw new HttpError(/large/i.test(error.message) ? 413 : 400, /large/i.test(error.message) ? 'PAYLOAD_TOO_LARGE' : 'INVALID_RECEIPT_IMAGE', error.message); }
      const claims = await (dependencies.verifyToken || verifySupabaseToken)(bearer(request), env); checkRateLimit(claims.sub);
      let normalized;
      try { normalized = await (dependencies.readReceipt || readReceiptWithOpenAi)(input, env, { fetchImpl: dependencies.fetchOpenAi || fetch }); }
      catch (error) { const code = error?.code || 'OPENAI_UNAVAILABLE'; const status = code === 'OPENAI_TIMEOUT' ? 504 : code === 'OPENAI_NOT_CONFIGURED' ? 503 : 502; throw new HttpError(status, code, 'High-accuracy receipt reading failed'); }
      console.log(JSON.stringify({ event: 'read_receipt', provider: 'openai', requestId, status: 200, latencyMs: Date.now() - startedAt, model: normalized.metadata?.model || null, usage: normalized.metadata?.usage || null }));
      return response(normalized, 200, origin);
    }
    if (!itemRequest && url.pathname !== '/suggest-expense') throw new HttpError(404, 'NOT_FOUND', 'Not found');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST');
    const contentLength = Number(request.headers.get('content-length') || 0); if (contentLength > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload is too large');
    const bodyText = await request.text(); if (byteLength(bodyText) > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Payload is too large');
    let body; try { body = JSON.parse(bodyText); } catch { throw new HttpError(400, 'MALFORMED_REQUEST', 'Request JSON is invalid'); }
    const input = itemRequest ? validateItemInput(body) : validateInput(body); const claims = await (dependencies.verifyToken || verifySupabaseToken)(bearer(request), env); checkRateLimit(claims.sub);
    const run = dependencies.runAi || ((model, options) => env.AI.run(model, options));
    const raw = await withTimeout(run(MODEL_ID, { messages: itemRequest ? itemAiMessages(input) : aiMessages(input), max_tokens: 320, temperature: 0.2, response_format: { type: 'json_schema', json_schema: itemRequest ? itemAiSchema() : aiSchema() } }));
    const normalized = itemRequest ? normalizeItemAiResponse(raw) : normalizeAiResponse(raw); logResult({ requestId, status: 200, startedAt }); return response(normalized, 200, origin);
  } catch (error) { const status = error instanceof HttpError ? error.status : 500; logResult({ requestId, status, startedAt, error: error?.name || 'Error' }); return errorResponse(error, origin); }
}

export default { fetch(request, env) { return handleRequest(request, env); } };