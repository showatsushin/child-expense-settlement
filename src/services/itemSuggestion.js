import { ITEM_CATEGORY_OPTIONS } from '../models.js';
import { AiSuggestionError, getAiWorkerUrl } from './expenseSuggestion.js';

const text = (value) => String(value || '').trim();
const limit = (value, length) => text(value).slice(0, length);
const confidence = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1 ? Number(value) : 0;
const styles = ['concise', 'standard', 'detailed'];
const templates = { '\u4ed8\u304d\u6dfb\u3044\u5bdd\u5177\u30ec\u30f3\u30bf\u30eb\u4ee3':'\u4ed8\u304d\u6dfb\u3044\u6642\u306e\u5bdd\u5177\u78ba\u4fdd\u306e\u305f\u3081\u306b\u5229\u7528\u3057\u305f\u8cbb\u7528\u3002','\u98f2\u6599\u6c34':'\u672c\u4eba\u306e\u98f2\u6599\u6c34\u3068\u3057\u3066\u4f7f\u7528\u3059\u308b\u305f\u3081\u8cfc\u5165\u3002','\u30ea\u30cf\u30d3\u30ea\u30fb\u6a5f\u80fd\u8a13\u7df4\u7528\u54c1':'\u672c\u4eba\u306e\u30ea\u30cf\u30d3\u30ea\u30fb\u6a5f\u80fd\u8a13\u7df4\u3067\u4f7f\u7528\u3059\u308b\u305f\u3081\u8cfc\u5165\u3002','\u98df\u6599\u54c1':'\u672c\u4eba\u306e\u98df\u4e8b\u306b\u4f7f\u7528\u3059\u308b\u305f\u3081\u8cfc\u5165\u3002','\u670d\u85ac\u88dc\u52a9\u7528\u54c1':'\u670d\u85ac\u6642\u306e\u88dc\u52a9\u306b\u4f7f\u7528\u3059\u308b\u305f\u3081\u8cfc\u5165\u3002','\u5165\u6d74\u88dc\u52a9\u7528\u54c1':'\u5165\u6d74\u6642\u306e\u4ecb\u52a9\u30fb\u5b89\u5168\u78ba\u4fdd\u306b\u4f7f\u7528\u3059\u308b\u305f\u3081\u8cfc\u5165\u3002','\u7642\u990a\u30fb\u4ecb\u52a9\u7528\u54c1':'\u7642\u990a\u53c8\u306f\u65e5\u5e38\u306e\u4ecb\u52a9\u306b\u4f7f\u7528\u3059\u308b\u305f\u3081\u8cfc\u5165\u3002','\u885b\u751f\u7528\u54c1':'\u672c\u4eba\u306e\u885b\u751f\u7ba1\u7406\u306b\u4f7f\u7528\u3059\u308b\u305f\u3081\u8cfc\u5165\u3002','\u53ce\u7d0d\u7528\u54c1':'\u672c\u4eba\u306e\u7528\u54c1\u3092\u6574\u7406\u30fb\u4fdd\u7ba1\u3059\u308b\u305f\u3081\u8cfc\u5165\u3002','\u305d\u306e\u4ed6':'\u8cfc\u5165\u54c1\u306e\u7528\u9014\u3092\u78ba\u8a8d\u3057\u3066\u8a18\u8f09\u3059\u308b\u305f\u3081\u306e\u4e0b\u66f8\u304d\u3002' };

export function suggestItemPurposes(item = {}) { const category = text(item.category) || '\u305d\u306e\u4ed6'; const product = text(item.productName); const basis = [...(product ? ['productName: ' + product] : []), 'category: ' + category]; const concise = templates[category] || templates['\u305d\u306e\u4ed6']; return [{ style:'concise',value:concise,source:'template',confidence:1,basis },{ style:'standard',value:product ? product + '\u3092\u3001' + concise : concise,source:'template',confidence:1,basis },{ style:'detailed',value:product ? product + '\u306b\u3064\u3044\u3066\u3001' + concise + '\u5185\u5bb9\u306f\u539f\u672c\u8a3c\u62e0\u3068\u5165\u529b\u5185\u5bb9\u3092\u78ba\u8a8d\u3057\u3066\u6574\u7406\u3059\u308b\u3002' : concise,source:'template',confidence:1,basis }]; }

function knowledgeCandidates(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((entry) => ({
    key: limit(entry?.key, 80),
    category: ITEM_CATEGORY_OPTIONS.includes(entry?.category) ? entry.category : '',
    purposeFacts: Array.isArray(entry?.purposeFacts) ? entry.purposeFacts.map((fact) => limit(fact, 240)).filter(Boolean).slice(0, 12) : [],
    authorityFacts: Array.isArray(entry?.authorityFacts) ? entry.authorityFacts.map((fact) => limit(fact, 240)).filter(Boolean).slice(0, 8) : [],
    separationFacts: Array.isArray(entry?.separationFacts) ? entry.separationFacts.map((fact) => limit(fact, 240)).filter(Boolean).slice(0, 8) : [],
    source: limit(entry?.source, 80),
    matchedAlias: limit(entry?.matchedAlias, 240),
  })).filter((entry) => entry.key && entry.category && entry.purposeFacts.length && entry.source === 'user_confirmed_document');
}

export function toAiItemContext(item = {}, receipt = {}, childLabel = '') {
  return {
    productName: limit(item.productName, 240),
    category: ITEM_CATEGORY_OPTIONS.includes(item.category) ? item.category : '',
    purchaseDate: limit(receipt.paidDate, 20),
    vendor: limit(receipt.vendor?.value ?? receipt.vendor, 240),
    ocrTextRelevantExcerpt: limit(item.ocrTextRelevantExcerpt || '', 6000),
    childLabel: limit(childLabel, 240),
    existingContext: limit(item.notes || '', 1000),
    knowledgeCandidates: knowledgeCandidates(item.knowledgeCandidates),
  };
}

export async function suggestAiItem(item, receipt, childLabel, { accessToken, workerUrl = getAiWorkerUrl(), fetchImpl = fetch } = {}) {
  const context = toAiItemContext(item, receipt, childLabel);
  if (!workerUrl || !accessToken) throw new AiSuggestionError('AI_CONFIGURATION_ERROR');
  let response;
  try {
    response = await fetchImpl(workerUrl.replace(/\/$/, '') + '/suggest-item', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'content-type': 'application/json' },
      body: JSON.stringify(context),
    });
  } catch {
    throw new AiSuggestionError('AI_NETWORK_ERROR');
  }
  let body;
  try { body = await response.json(); } catch { throw new AiSuggestionError('AI_INVALID_RESPONSE'); }
  if (!response.ok) throw new AiSuggestionError(body?.error?.code || 'AI_UNAVAILABLE');
  const categorySuggestion = body?.categorySuggestion;
  if (!ITEM_CATEGORY_OPTIONS.includes(categorySuggestion?.value)) throw new AiSuggestionError('AI_INVALID_RESPONSE');
  const proposals = Array.isArray(body?.purposeSuggestions) ? body.purposeSuggestions : [];
  const byStyle = new Map(proposals.map((proposal) => [proposal?.style, proposal]));
  const knowledgeKey = typeof body?.knowledgeKey === 'string' ? body.knowledgeKey : null;
  const basis = knowledgeKey
    ? ['\u767b\u9332\u6e08\u307fKnowledge', 'knowledgeKey: ' + knowledgeKey]
    : ['AI\u63d0\u6848', ...(context.productName ? ['productName: ' + context.productName] : []), ...(context.category ? ['category: ' + context.category] : []), ...(context.purchaseDate ? ['purchaseDate: ' + context.purchaseDate] : []), ...(context.vendor ? ['vendor: ' + context.vendor] : []), ...(context.childLabel ? ['childLabel: ' + context.childLabel] : []), ...(context.existingContext ? ['userContext: \u5165\u529b\u6e08\u307f\u88dc\u8db3\u4e8b\u5b9f'] : [])];
  const purposeSuggestions = styles.map((style) => {
    const proposal = byStyle.get(style);
    if (!proposal || typeof proposal.value !== 'string' || !proposal.value.trim() || proposal.value.length > 480) throw new AiSuggestionError('AI_INVALID_RESPONSE');
    return { style, value: proposal.value.trim(), confidence: confidence(proposal.confidence), source: 'ai', basis, knowledgeKey };
  });
  return {
    purposeSuggestions,
    categorySuggestion: { value: categorySuggestion.value, confidence: confidence(categorySuggestion.confidence), reason: text(categorySuggestion.reason).slice(0, 240), source: 'ai', basis, knowledgeKey },
    knowledgeKey,
    missingFields: Array.isArray(body?.missingFields) ? body.missingFields : [],
    needsReview: Boolean(body?.needsReview),
  };
}
