import { purchasePurposeKnowledgeByKey } from '../data/purchasePurposeKnowledge.js';
import { matchPurchasePurposeKnowledge } from './purchasePurposeKnowledge.js';

export const knowledgeCandidatesForProduct = (productName = '') =>
  matchPurchasePurposeKnowledge(productName);

const sourceKind = (value, fallback) =>
  ['knowledge', 'manual', 'manual_override'].includes(value) ? value : fallback;

export function hasManualKnowledgeFields(item = {}) {
  const purposeValue = String(item.purpose?.value || item.purpose || '').trim();
  const category = String(item.category || '').trim();
  const purposeSource = sourceKind(item.purposeSource, item.knowledgeKey ? 'knowledge' : 'manual');
  const categorySource = sourceKind(item.categorySource, item.knowledgeKey ? 'knowledge' : 'manual');

  return (purposeSource === 'manual' || purposeSource === 'manual_override') && purposeValue.length > 0
    || (categorySource === 'manual' || categorySource === 'manual_override')
      && category.length > 0 && category !== 'その他';
}

export function clearSelectedKnowledge(item = {}) {
  return {
    ...item,
    knowledgeKey: null,
    knowledgeSource: null,
    knowledgeVersion: null,
    knowledgeSelectionState: 'unselected',
    purposeSource: item.purpose?.value ? 'manual' : item.purposeSource || 'manual',
    categorySource: item.category ? 'manual' : item.categorySource || 'manual',
  };
}

export function applySelectedKnowledge(item = {}, knowledgeKey = '') {
  const knowledge = purchasePurposeKnowledgeByKey(knowledgeKey);
  if (!knowledge) return clearSelectedKnowledge(item);

  return {
    ...item,
    category: knowledge.category,
    categorySource: 'knowledge',
    purpose: {
      value: knowledge.sourceExcerpt,
      source: 'knowledge',
      confidence: 1,
    },
    purposeSource: 'knowledge',
    originalKnowledgePurpose: knowledge.sourceExcerpt,
    knowledgeKey: knowledge.key,
    knowledgeSelectionState: 'selected',
    knowledgeSource: knowledge.source,
    knowledgeVersion: knowledge.version,
    sourceExcerpt: knowledge.sourceExcerpt,
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
