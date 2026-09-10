import { CATEGORY_OPTIONS } from '../models.js';

// Local-only provider boundary. Suggestions are factual drafts and never save automatically.
export const REASON_TEMPLATES = Object.freeze({
  '医療費': { concise: '子どもの診察・治療に伴い発生した医療費。', activity: '診察・治療', noun: '医療費' },
  '教育費': { concise: '子どもの学習・教育に必要な費用として支出。', activity: '学習・教育', noun: '教育費' },
  '学校費': { concise: '子どもの学校生活に必要な学校関連費として支出。', activity: '学校生活', noun: '学校関連費' },
  '保育費': { concise: '子どもの保育に必要な費用として支出。', activity: '保育', noun: '保育費' },
  '習い事': { concise: '子どもの教育・活動に必要な費用として支出。', activity: '教育・活動', noun: '習い事に関する費用' },
  '衣類': { concise: '子どもの衣類・身の回り品として必要な費用を支出。', activity: '衣類・身の回り品', noun: '費用' },
  '交通費': { concise: '子どもの移動に伴い必要となった交通費。', activity: '移動', noun: '交通費' },
  '食費': { concise: '子どもの食事に関連して発生した費用。', activity: '食事', noun: '費用' },
  '保険': { concise: '子どもに関する保険料として支出。', activity: '保険', noun: '保険料' },
  'その他': { concise: '子どもに関連して必要となった費用。', activity: '関連する事項', noun: '費用' },
});

const text = (value) => String(value || '').trim();
const safeTemplate = (category) => REASON_TEMPLATES[text(category)] || REASON_TEMPLATES['その他'];
const appendBasis = (basis, label, value) => value ? [...basis, `${label}: ${value}`] : basis;
const limit = (value, length) => text(value).slice(0, length);
const legalLanguage = /(養育費として当然認められる|法的に負担義務がある|相手方が支払うべき|裁判所で認められる|必ず清算対象となる|法律上必要である|法的(?:に|判断)|裁判所|支払義務|養育費として)/;

export class AiSuggestionError extends Error { constructor(code = 'AI_UNAVAILABLE') { super('AI提案を取得できませんでした。ローカル候補は引き続き利用できます。'); this.code = code; } }
export const getAiWorkerUrl = () => text(globalThis.__APP_CONFIG__?.aiWorkerUrl);

export function suggestReasons(context = {}) {
  const category = text(context.category); const vendor = text(context.vendor); const paidDate = text(context.paidDate);
  const template = safeTemplate(category); const basis = appendBasis([], 'category', category || 'その他');
  const factBasis = appendBasis(appendBasis(basis, 'paidDate', paidDate), 'vendor', vendor);
  const datePrefix = paidDate ? `${paidDate}、` : '';
  const vendorPhrase = vendor ? `、${vendor}へ` : '';
  const detailedVendorPhrase = vendor ? `${vendor}を利用し、` : '';
  return [
    { value: template.concise, source: 'template', confidence: 1, basis, style: 'concise' },
    { value: `${datePrefix}子どもの${template.activity}に伴い${vendorPhrase}支払った${template.noun}。`, source: 'template', confidence: 1, basis: factBasis, style: 'standard' },
    { value: `${datePrefix}子どもの${template.activity}のため${detailedVendorPhrase}その際に発生した${template.noun}として支出。`, source: 'template', confidence: 1, basis: factBasis, style: 'detailed' },
  ];
}

export function toAiRequest(context = {}) {
  const category = text(context.category); return {
    ocrText: limit(context.ocrRawText, 8000), correctedText: limit(context.correctedText, 8000), paidDate: limit(context.paidDate, 20), vendor: limit(context.vendor, 240),
    amount: Number.isFinite(Number(context.amount)) && Number(context.amount) >= 0 ? Number(context.amount) : null,
    category: CATEGORY_OPTIONS.includes(category) ? category : '', childLabel: limit(context.child, 240),
  };
}
function normalizeAiPayload(payload, request) {
  const category = CATEGORY_OPTIONS.includes(payload?.categorySuggestion?.value) ? payload.categorySuggestion.value : 'その他';
  const confidence = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1 ? Number(value) : 0;
  const reasons = Array.isArray(payload?.reasonSuggestions) ? payload.reasonSuggestions : []; const styles = ['concise', 'standard', 'detailed'];
  const basis = ['AI提案', ...['category', 'paidDate', 'vendor'].filter((key) => ({ category: request.category, paidDate: request.paidDate, vendor: request.vendor })[key]).map((key) => `${key}: ${({ category: request.category, paidDate: request.paidDate, vendor: request.vendor })[key]}`)];
  const reasonSuggestions = styles.map((style) => { const item = reasons.find((candidate) => candidate?.style === style); if (!item || typeof item.value !== 'string' || !item.value.trim() || item.value.length > 480 || legalLanguage.test(item.value)) throw new AiSuggestionError('AI_INVALID_RESPONSE'); return { style, value: item.value.trim(), confidence: confidence(item.confidence), source: 'ai', basis }; });
  return { categorySuggestion: { value: category, confidence: confidence(payload?.categorySuggestion?.confidence), reason: text(payload?.categorySuggestion?.reason).slice(0, 240), source: 'ai' }, reasonSuggestions, missingFields: Array.isArray(payload?.missingFields) ? payload.missingFields.filter((field) => ['ocrText', 'correctedText', 'paidDate', 'vendor', 'amount', 'category', 'childLabel'].includes(field)) : [], needsReview: Boolean(payload?.needsReview) || !CATEGORY_OPTIONS.includes(payload?.categorySuggestion?.value) };
}
export async function suggestAiExpense(context, { accessToken, workerUrl = getAiWorkerUrl(), fetchImpl = fetch } = {}) {
  if (!workerUrl || !accessToken) throw new AiSuggestionError('AI_CONFIGURATION_ERROR');
  let response; try { response = await fetchImpl(`${workerUrl.replace(/\/$/, '')}/suggest-expense`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(toAiRequest(context)) }); } catch { throw new AiSuggestionError('AI_NETWORK_ERROR'); }
  let body = null; try { body = await response.json(); } catch { throw new AiSuggestionError('AI_INVALID_RESPONSE'); }
  if (!response.ok) throw new AiSuggestionError(body?.error?.code || `HTTP_${response.status}`);
  return normalizeAiPayload(body, toAiRequest(context));
}

// Kept as the single replacement point for a future, safely hosted AI provider.
export async function suggestExpense(context = {}) { return { status: 'completed', suggestions: suggestReasons(context) }; }