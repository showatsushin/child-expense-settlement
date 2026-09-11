import { suggestAiItem } from './itemSuggestion.js';
import { knowledgeBasis, knowledgeForAi } from './purchasePurposeKnowledge.js';

const knowledgeContext = (matches) => matches.map((entry) => ({
  key: entry.key,
  category: entry.category,
  purposeFacts: entry.purposeFacts,
  authorityFacts: entry.authorityFacts,
  separationFacts: entry.separationFacts,
  source: entry.source,
  matchedAlias: entry.matchedAlias,
}));

// A match is a candidate only. The Worker keeps needsReview=true and the UI
// shows proposals until the person explicitly adopts one.
export async function suggestItemWithKnowledge(item, receipt, childLabel, options) {
  const matches = knowledgeForAi(item?.productName);
  const result = await suggestAiItem({ ...item, knowledgeCandidates: knowledgeContext(matches) }, receipt, childLabel, options);
  const selected = matches.find((entry) => entry.key === result.knowledgeKey) || matches[0] || null;
  const basis = selected ? knowledgeBasis(selected.key) : knowledgeBasis(null);
  return {
    ...result,
    knowledgeKey: selected?.key || null,
    basis,
    needsReview: true,
    categorySuggestion: { ...result.categorySuggestion, reason: selected ? basis[0] : result.categorySuggestion.reason, basis, knowledgeKey: selected?.key || null },
    purposeSuggestions: result.purposeSuggestions.map((proposal) => ({ ...proposal, basis, knowledgeKey: selected?.key || null, needsReview: true })),
  };
}
