import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENAI_RECEIPT_READER_INSTRUCTIONS, normalizeOpenAiReceiptResponse, readReceiptWithOpenAi, validateReceiptReadInput } from '../src/receiptReader.js';
import { handleRequest } from '../src/index.js';

const imageDataUrl = 'data:image/jpeg;base64,AA==';
const structured = { output_text: JSON.stringify({ rawText: 'SHOP\nwater 100\nTOTAL 100', vendor: 'SHOP', purchaseDate: null, receiptTotalAmount: 100, items: [{ sourceText: 'water 100', productName: 'water', quantity: null, unitPrice: null, amount: 100, confidence: .9, needsReview: false }], warnings: [] }), usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } };

test('OpenAI mapping validates structured nulls and retains item source text', () => {
  const result = normalizeOpenAiReceiptResponse(structured); assert.equal(result.items[0].sourceText, 'water 100'); assert.equal(result.items[0].amount, 100); assert.equal(result.quality.status, 'success');
});

test('hallucination contract forbids invented fields and non-Reader classifications', () => {
  assert.match(OPENAI_RECEIPT_READER_INSTRUCTIONS, /Never invent/i); assert.match(OPENAI_RECEIPT_READER_INSTRUCTIONS, /null/i); assert.match(OPENAI_RECEIPT_READER_INSTRUCTIONS, /categories, purposes/i);
});

test('receipt input rejects MIME mismatch and oversize data', () => {
  assert.throws(() => validateReceiptReadInput({ mimeType: 'image/gif', imageDataUrl }));
  assert.throws(() => validateReceiptReadInput({ mimeType: 'image/jpeg', imageDataUrl: `data:image/jpeg;base64,${'A'.repeat(6 * 1024 * 1024)}` }));
});

test('OpenAI request uses Responses structured output, store false, and no input is logged', async () => {
  let called; const result = await readReceiptWithOpenAi(validateReceiptReadInput({ mimeType: 'image/jpeg', imageDataUrl }), { OPENAI_API_KEY: 'test-key' }, { fetchImpl: async (url, init) => { called = { url, init }; return new Response(JSON.stringify(structured), { status: 200 }); } });
  const request = JSON.parse(called.init.body); assert.equal(called.url, 'https://api.openai.com/v1/responses'); assert.equal(request.store, false); assert.equal(request.text.format.type, 'json_schema'); assert.equal(result.metadata.usage.totalTokens, 30);
});
test('OpenAI timeout is surfaced without a fallback reader', async () => {
  const fetchImpl = async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); }));
  await assert.rejects(() => readReceiptWithOpenAi(validateReceiptReadInput({ mimeType: 'image/jpeg', imageDataUrl }), { OPENAI_API_KEY: 'test-key' }, { fetchImpl, timeoutMs: 1 }), (error) => error.code === 'OPENAI_TIMEOUT');
});

test('read-receipt keeps JWT, CORS, and OpenAI failure boundaries', async () => {
  const request = new Request('https://x/read-receipt', { method: 'POST', headers: { Origin: 'https://showatsushin.github.io', Authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify({ mimeType: 'image/jpeg', imageDataUrl }) });
  const response = await handleRequest(request, { ALLOWED_ORIGIN: 'https://showatsushin.github.io' }, { verifyToken: async () => ({ sub: 'u', role: 'authenticated' }), readReceipt: async () => ({ provider: 'openai', ...normalizeOpenAiReceiptResponse(structured), metadata: {} }) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), 'https://showatsushin.github.io');
});
