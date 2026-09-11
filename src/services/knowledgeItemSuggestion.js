import { suggestAiItem } from './itemSuggestion.js';
import { knowledgeBasis, knowledgeForAi } from './purchasePurposeKnowledge.js';

const knowledgeContext = (matches) => matches.map((entry) => ({
  key: entry.key, category: entry.category, purposeFacts: entry.purposeFacts,
  authorityFacts: entry.authorityFacts, separationFacts: entry.separationFacts,
  source: entry.source, matchedAlias: entry.matchedAlias,
}));

// Keep the canonical facts in the explicit context sent to the existing
// authenticated Worker.  The Worker prompt already prohibits inventing facts.
export async function suggestItemWithKnowledge(item, receipt, childLabel, options) {
  const matches = knowledgeForAi(item?.productName);
  const existingContext = [
    item?.notes || '',
    matches.length ? `Registered Knowledge (facts only): ${JSON.stringify(knowledgeContext(matches))}` : 'Registered Knowledge: no match',
  ].filter(Boolean).join('\n');
  const result = await suggestAiItem({ ...item, notes: existingContext }, receipt, childLabel, options);
  const selected = matches.find((entry) => entry.category === result.categorySuggestion.value) || matches[0] || null;
  const basis = selected ? knowledgeBasis(selected.key) : knowledgeBasis(null);
  return {
    ...result,
    knowledgeKey: selected?.key || null,
    basis,
    needsReview: true,
    categorySuggestion: { ...result.categorySuggestion, basis },
    purposeSuggestions: result.purposeSuggestions.map((proposal) => ({ ...proposal, basis, knowledgeKey: selected?.key || null, needsReview: true })),
  };
}
