import { PURCHASE_PURPOSE_KNOWLEDGE, purchasePurposeKnowledgeByKey } from '../data/purchasePurposeKnowledge.js';

// Product labels commonly add a size or another non-identifying qualifier,
// for example "いろはす（555ml）". This is only a candidate matcher.
const normalized = (value) => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase("ja-JP")
  .replace(/[（(][^）)]*[）)]/g, "")
  .replace(/[\s　\-‐‑–—・]/g, "");

// An alias is evidence for a candidate only.  It never confirms a purpose or
// changes an item without the person selecting a proposal.
export function matchPurchasePurposeKnowledge(productName = '') {
  const product = normalized(productName);
  if (!product) return [];
  return PURCHASE_PURPOSE_KNOWLEDGE
    .map((entry) => ({
      entry,
      alias: [...entry.aliases].sort((left, right) => normalized(right).length - normalized(left).length)
        .find((alias) => product.includes(normalized(alias))) || null,
    }))
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
