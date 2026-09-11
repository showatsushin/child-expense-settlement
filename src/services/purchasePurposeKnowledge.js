import { PURCHASE_PURPOSE_KNOWLEDGE, purchasePurposeKnowledgeByKey } from '../data/purchasePurposeKnowledge.js';

// Product names often contain a non-identifying quantity or parenthesized qualifier.
// This matcher only offers candidates; it never changes a ReceiptItem.
export const normalizeKnowledgeProductName = (value = '') => String(value)
  .normalize('NFKC')
  .toLocaleLowerCase('ja-JP')
  .replace(/[（(][^）)]*[）)]/g, '')
  .replace(/[\s　\-‐‑–—―・･_]/g, '');

export function matchPurchasePurposeKnowledge(productName = '') {
  const product = normalizeKnowledgeProductName(productName);
  if (!product) return [];

  return PURCHASE_PURPOSE_KNOWLEDGE
    .map((entry) => {
      const aliases = entry.matchingAliases || entry.aliases || [];
      const matchedAlias = [...aliases]
        .sort((left, right) => normalizeKnowledgeProductName(right).length - normalizeKnowledgeProductName(left).length)
        .find((alias) => product.includes(normalizeKnowledgeProductName(alias))) || null;
      return { ...entry, matchedAlias };
    })
    .filter((entry) => entry.matchedAlias)
    .sort((left, right) => normalizeKnowledgeProductName(right.matchedAlias).length - normalizeKnowledgeProductName(left.matchedAlias).length);
}

export const knowledgeForAi = (productName = '') => matchPurchasePurposeKnowledge(productName).map((entry) => ({
  key: entry.key,
  category: entry.category,
  purposeFacts: entry.purposeFacts,
  authorityFacts: entry.authorityFacts,
  separationFacts: entry.separationFacts,
  source: entry.source,
  matchedAlias: entry.matchedAlias,
}));

export const knowledgeBasis = (key) => {
  const entry = purchasePurposeKnowledgeByKey(key);
  return entry ? [entry.sourceDocument, entry.sourceSection, entry.source] : [];
};
