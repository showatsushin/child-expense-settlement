import { TAX_RATE_KNOWLEDGE } from '../data/taxRateKnowledge.js';
import { normalizeKnowledgeProductName } from './purchasePurposeKnowledge.js';

// This is deliberately a local, deterministic matcher.  It returns guidance
// only; callers must require an explicit human action before changing a rate.
export function taxRateSuggestionsForProduct(productName = '') {
  const product = normalizeKnowledgeProductName(productName);
  if (!product) return [];

  return TAX_RATE_KNOWLEDGE
    .map((entry) => {
      const matchedAlias = [...entry.matchingAliases]
        .sort((left, right) => normalizeKnowledgeProductName(right).length - normalizeKnowledgeProductName(left).length)
        .find((alias) => product.includes(normalizeKnowledgeProductName(alias))) || null;
      return { ...entry, matchedAlias };
    })
    .filter((entry) => entry.matchedAlias)
    .sort((left, right) => normalizeKnowledgeProductName(right.matchedAlias).length - normalizeKnowledgeProductName(left.matchedAlias).length)
    .slice(0, 3);
}

export const suggestedTaxRateForProduct = (productName = '') =>
  taxRateSuggestionsForProduct(productName)[0]?.suggestedTaxRate || 'unknown';
