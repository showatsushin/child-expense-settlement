import { PURCHASE_PURPOSE_KNOWLEDGE, purchasePurposeKnowledgeByKey } from '../data/purchasePurposeKnowledge.js';

const normalized = (value) => String(value || '').toLocaleLowerCase('ja-JP').replace(/[\s　]/g, '');

// An alias is evidence for a candidate only.  It never confirms a purpose or
// changes an item without the person selecting a proposal.
export function matchPurchasePurposeKnowledge(productName = '') {
  const product = normalized(productName);
  if (!product) return [];
  return PURCHASE_PURPOSE_KNOWLEDGE
    .map((entry) => ({ entry, alias: entry.aliases.find((alias) => product.includes(normalized(alias))) || null }))
    .filter(({ alias }) => alias)
    .map(({ entry, alias }) => ({ ...entry, matchedAlias: alias }));
}

export function knowledgeForAi(productName = '') {
  return matchPurchasePurposeKnowledge(productName).map((entry) => ({
    key: entry.key, category: entry.category, purposeFacts: entry.purposeFacts,
    authorityFacts: entry.authorityFacts, separationFacts: entry.separationFacts,
    source: entry.source, matchedAlias: entry.matchedAlias,
  }));
}

export function knowledgeBasis(key) {
  const entry = purchasePurposeKnowledgeByKey(key);
  return entry ? [`登録済みKnowledge「${entry.category}」`, `source: ${entry.source}`] : ['該当Knowledgeなし'];
}
