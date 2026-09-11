import { purchasePurposeKnowledgeByKey } from '../data/purchasePurposeKnowledge.js';
import { matchPurchasePurposeKnowledge } from './purchasePurposeKnowledge.js';

export const knowledgeCandidatesForProduct = (productName = '') =>
  matchPurchasePurposeKnowledge(productName);

export function applySelectedKnowledge(item = {}, knowledgeKey = '') {
  const knowledge = purchasePurposeKnowledgeByKey(knowledgeKey);
  if (!knowledge) {
    return {
      ...item,
      knowledgeKey: null,
      knowledgeSource: null,
      knowledgeVersion: null,
    };
  }

  return {
    ...item,
    category: knowledge.category,
    purpose: {
      value: knowledge.sourceExcerpt,
      source: 'knowledge',
      confidence: 1,
    },
    knowledgeKey: knowledge.key,
    knowledgeSource: knowledge.source,
    knowledgeVersion: knowledge.version,
    basis: [
      knowledge.sourceDocument,
      knowledge.sourceSection,
      knowledge.source,
      knowledge.version,
    ],
  };
}

export const selectedKnowledge = (item = {}) =>
  purchasePurposeKnowledgeByKey(item.knowledgeKey);
