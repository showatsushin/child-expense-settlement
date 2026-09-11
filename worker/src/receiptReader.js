export const OPENAI_RECEIPT_READER_MODEL = 'gpt-4.1-mini';
export const MAX_RECEIPT_READER_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_RECEIPT_READER_BODY_BYTES = 6 * 1024 * 1024;
export const RECEIPT_IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png']);
export const OPENAI_RECEIPT_READER_INSTRUCTIONS = `You are a receipt reader. Read only facts visibly supported by the single supplied receipt image. Never invent, infer, complete, or calculate a vendor, date, product, quantity, unit price, amount, or total. If any value is uncertain, return null and set needsReview to true. Never use the receipt total to fill an item amount. Never add a line that is not visibly present. Preserve the visible source line in sourceText. Do not return categories, purposes, medical necessity, submission decisions, cost sharing, or legal judgments.`;

const text = (value, field, limit) => {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a string or null`);
  const result = value.trim();
  if (result.length > limit) throw new Error(`${field} is too long`);
  return result || null;
};
const number = (value, field) => {
  if (value == null) return null;
  if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100_000_000) throw new Error(`${field} is invalid`);
  return Number(value);
};
const confidence = (value) => value == null ? null : Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1 ? Number(value) : (() => { throw new Error('confidence is invalid'); })();
const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function receiptReaderSchema() {
  const nullableString = { type: ['string', 'null'] }; const nullableNumber = { type: ['number', 'null'] };
  return { type: 'object', additionalProperties: false, required: ['rawText', 'vendor', 'purchaseDate', 'receiptTotalAmount', 'items', 'warnings'], properties: {
    rawText: { type: 'string' }, vendor: nullableString, purchaseDate: nullableString, receiptTotalAmount: nullableNumber,
    items: { type: 'array', maxItems: 120, items: { type: 'object', additionalProperties: false, required: ['sourceText', 'productName', 'quantity', 'unitPrice', 'amount', 'confidence', 'needsReview'], properties: { sourceText: nullableString, productName: nullableString, quantity: nullableNumber, unitPrice: nullableNumber, amount: nullableNumber, confidence: nullableNumber, needsReview: { type: 'boolean' } } } },
    warnings: { type: 'array', maxItems: 20, items: { type: 'string' } }
  } };
}

export function validateReceiptReadInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request must be an object');
  const mimeType = String(value.mimeType || '').toLowerCase();
  if (!RECEIPT_IMAGE_MIME_TYPES.includes(mimeType)) throw new Error('Unsupported image type');
  if (typeof value.imageDataUrl !== 'string') throw new Error('imageDataUrl must be a string');
  const prefix = `data:${mimeType};base64,`;
  if (!value.imageDataUrl.startsWith(prefix)) throw new Error('imageDataUrl does not match mimeType');
  const base64 = value.imageDataUrl.slice(prefix.length);
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('imageDataUrl is invalid');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if (Math.floor(base64.length * 3 / 4) - padding > MAX_RECEIPT_READER_IMAGE_BYTES) throw new Error('Image is too large');
  return { imageDataUrl: value.imageDataUrl, mimeType };
}

export function evaluateReceiptReaderQuality({ rawText = '', items = [], receiptTotalAmount = null, warnings = [] } = {}) {
  const valid = items.filter((item) => item.productName && item.amount != null);
  const itemTotalAmount = round(valid.reduce((sum, item) => sum + item.amount, 0)); const difference = receiptTotalAmount == null ? null : round(receiptTotalAmount - itemTotalAmount);
  const lowConfidenceCount = items.filter((item) => !item.productName || item.amount == null || item.needsReview).length;
  const hasSignals = Boolean(rawText || receiptTotalAmount != null || valid.length || warnings.length);
  const status = !valid.length ? (hasSignals ? 'low_confidence' : 'failed') : receiptTotalAmount != null && Math.abs(difference) <= 1 && lowConfidenceCount === 0 ? 'success' : 'partial';
  return { status, candidateCount: valid.length, lowConfidenceCount, lineCount: String(rawText).split(/\r?\n/).filter(Boolean).length, monetaryLineCount: valid.length + (receiptTotalAmount == null ? 0 : 1), receiptTotalAmount, itemTotalAmount, difference, totalConsistent: receiptTotalAmount != null && Math.abs(difference) <= 1 };
}

function outputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  const content = response?.output?.flatMap((item) => item?.content || []).find((item) => item?.type === 'output_text');
  if (typeof content?.text === 'string') return content.text;
  throw new Error('OpenAI response has no structured text');
}

export function normalizeOpenAiReceiptResponse(response) {
  let parsed; try { parsed = JSON.parse(outputText(response)); } catch { throw new Error('OpenAI response is not valid structured JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.items) || !Array.isArray(parsed.warnings)) throw new Error('OpenAI response has an invalid schema');
  const items = parsed.items.slice(0, 120).map((item) => ({ sourceText: text(item?.sourceText, 'sourceText', 1000), productName: text(item?.productName, 'productName', 240), quantity: number(item?.quantity, 'quantity'), unitPrice: number(item?.unitPrice, 'unitPrice'), amount: number(item?.amount, 'amount'), confidence: confidence(item?.confidence), needsReview: Boolean(item?.needsReview) }));
  const rawText = text(parsed.rawText, 'rawText', 16000) || '';
  const result = { provider: 'openai', rawText, vendor: text(parsed.vendor, 'vendor', 240), purchaseDate: text(parsed.purchaseDate, 'purchaseDate', 20), receiptTotalAmount: number(parsed.receiptTotalAmount, 'receiptTotalAmount'), items, warnings: [...new Set(parsed.warnings.map((warning) => text(warning, 'warning', 240)).filter(Boolean))].slice(0, 20) };
  return { ...result, quality: evaluateReceiptReaderQuality(result) };
}

function usage(response) { const inputTokens = Number(response?.usage?.input_tokens); const outputTokens = Number(response?.usage?.output_tokens); const totalTokens = Number(response?.usage?.total_tokens); return { inputTokens: Number.isFinite(inputTokens) ? inputTokens : null, outputTokens: Number.isFinite(outputTokens) ? outputTokens : null, totalTokens: Number.isFinite(totalTokens) ? totalTokens : null }; }

export async function readReceiptWithOpenAi(input, env, { fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  if (!env.OPENAI_API_KEY) { const error = new Error('OpenAI receipt reader is not configured'); error.code = 'OPENAI_NOT_CONFIGURED'; throw error; }
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: env.OPENAI_RECEIPT_READER_MODEL || OPENAI_RECEIPT_READER_MODEL, store: false, instructions: OPENAI_RECEIPT_READER_INSTRUCTIONS, input: [{ role: 'user', content: [{ type: 'input_text', text: 'Read this receipt image into the supplied schema. Return null for anything uncertain.' }, { type: 'input_image', image_url: input.imageDataUrl, detail: 'high' }] }], text: { format: { type: 'json_schema', name: 'receipt_reader_result', strict: true, schema: receiptReaderSchema() } }, max_output_tokens: 1200 }) });
    if (!response.ok) { const error = new Error('OpenAI request failed'); error.code = 'OPENAI_REQUEST_FAILED'; throw error; }
    const body = await response.json(); return { ...normalizeOpenAiReceiptResponse(body), metadata: { model: env.OPENAI_RECEIPT_READER_MODEL || OPENAI_RECEIPT_READER_MODEL, usage: usage(body) } };
  } catch (cause) { if (cause?.name === 'AbortError') { const error = new Error('OpenAI request timed out'); error.code = 'OPENAI_TIMEOUT'; throw error; } throw cause; }
  finally { clearTimeout(timer); }
}
