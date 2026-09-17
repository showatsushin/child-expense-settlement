import { normalizeKnowledgeProductName } from './services/purchasePurposeKnowledge.js';

const text = (value, max = 240) => String(value || '').trim().slice(0, max);
const stamp = () => new Date().toISOString();
const validDate = (value) => Number.isNaN(new Date(value).getTime()) ? '' : new Date(value).toISOString();
const count = (value) => Math.max(1, Math.floor(Number(value) || 1));
const taxRates = new Set(['8', '10', 'exempt', 'out_of_scope']);
const normalizedHistories = new WeakSet();

// Reuse the STEP 4.5 product normalizer: NFKC, case/space normalization and
// non-identifying parenthesized qualifiers are removed before history lookup.
export const normalizeHistoryText = (value = '') => normalizeKnowledgeProductName(text(value));

export const sanitizeMerchantHistoryValue = (value = '') => text(value)
  .replace(/(?:TEL|電話(?:番号)?)[：:\s]*0?\d{1,4}[-ー− ]\d{1,4}[-ー− ]\d{3,4}/gi, '')
  .replace(/〒?\d{3}[-ー−]\d{4}/g, '')
  .replace(/(?:住所|レジ番号|取引番号)[：:]?[^\r\n]*/g, '')
  .replace(/\s{2,}/g, ' ').trim();

const emptyHistory = () => ({ version: 2, vendors: [], items: [], merchantCorrections: [], productCorrections: [], knowledgeSelectionHistory: [], categoryHistory: [], taxRateHistory: [] });

function normalizeVendor(entry = {}) {
  const value = text(entry.value || entry.confirmedValue);
  return value ? { value, count: count(entry.count || entry.useCount), lastConfirmedAt: validDate(entry.lastConfirmedAt || entry.updatedAt) } : null;
}

function normalizeItem(entry = {}) {
  const productName = text(entry.productName || entry.confirmedValue);
  if (!productName) return null;
  return { productName, category: text(entry.category || entry.confirmedCategory, 80), knowledgeKey: text(entry.knowledgeKey, 80) || null, knowledgeVersion: Number.isInteger(Number(entry.knowledgeVersion)) ? Number(entry.knowledgeVersion) : null, taxRate: taxRates.has(String(entry.taxRate || entry.confirmedTaxRate)) ? String(entry.taxRate || entry.confirmedTaxRate) : 'unknown', count: count(entry.count || entry.useCount), lastConfirmedAt: validDate(entry.lastConfirmedAt || entry.updatedAt) };
}

function normalizeEntry(entry = {}, kind) {
  const sourceValue = text(entry.sourceValue ?? entry.source ?? entry.raw ?? entry.productName ?? entry.value);
  const confirmedValue = text(entry.confirmedValue ?? entry.confirmed ?? entry.productName ?? entry.value);
  const normalizedKey = normalizeHistoryText(entry.normalizedKey || sourceValue || confirmedValue);
  if (!confirmedValue || !normalizedKey) return null;
  const base = { sourceValue, confirmedValue, normalizedKey, createdAt: validDate(entry.createdAt) || stamp(), updatedAt: validDate(entry.updatedAt || entry.lastConfirmedAt || entry.createdAt) || stamp(), useCount: count(entry.useCount || entry.count), source: 'user_confirmed_history' };
  if (kind === 'knowledge') { const knowledgeKey = text(entry.knowledgeKey, 80); return knowledgeKey ? { ...base, knowledgeKey, knowledgeVersion: Number.isInteger(Number(entry.knowledgeVersion)) ? Number(entry.knowledgeVersion) : null } : null; }
  if (kind === 'category') { const confirmedCategory = text(entry.confirmedCategory ?? entry.category, 80); return confirmedCategory ? { ...base, confirmedCategory } : null; }
  if (kind === 'tax') { const confirmedTaxRate = String(entry.confirmedTaxRate ?? entry.taxRate ?? 'unknown'); return taxRates.has(confirmedTaxRate) ? { ...base, confirmedTaxRate } : null; }
  return base;
}

const groupConfig = {
  merchantCorrections: { kind: 'merchant', key: (entry) => `${entry.normalizedKey}\u0000${normalizeHistoryText(entry.confirmedValue)}` },
  productCorrections: { kind: 'product', key: (entry) => `${entry.normalizedKey}\u0000${normalizeHistoryText(entry.confirmedValue)}` },
  knowledgeSelectionHistory: { kind: 'knowledge', key: (entry) => `${entry.normalizedKey}\u0000${entry.knowledgeKey}` },
  categoryHistory: { kind: 'category', key: (entry) => `${entry.normalizedKey}\u0000${entry.confirmedCategory}` },
  taxRateHistory: { kind: 'tax', key: (entry) => `${entry.normalizedKey}\u0000${entry.confirmedTaxRate}` },
};

function newestFirst(left, right) {
  return (right.useCount || right.count || 1) - (left.useCount || left.count || 1)
    || String(right.updatedAt || right.lastConfirmedAt || '').localeCompare(String(left.updatedAt || left.lastConfirmedAt || ''))
    || String(left.confirmedValue || left.value || left.productName || '').localeCompare(String(right.confirmedValue || right.value || right.productName || ''), 'ja-JP');
}

function normalizeGroup(entries, config) {
  const byKey = new Map();
  for (const raw of Array.isArray(entries) ? entries : []) {
    const entry = normalizeEntry(raw, config.kind); if (!entry) continue;
    const key = config.key(entry); const existing = byKey.get(key);
    if (!existing) byKey.set(key, entry);
    else byKey.set(key, { ...existing, useCount: Math.max(existing.useCount, entry.useCount), createdAt: String(existing.createdAt).localeCompare(String(entry.createdAt)) <= 0 ? existing.createdAt : entry.createdAt, updatedAt: String(existing.updatedAt).localeCompare(String(entry.updatedAt)) >= 0 ? existing.updatedAt : entry.updatedAt });
  }
  return [...byKey.values()].sort(newestFirst).slice(0, 200);
}

function mergeLegacy(entries, next, key) {
  if (!next) return entries;
  const index = entries.findIndex((entry) => key(entry) === key(next));
  if (index < 0) return [...entries, next].sort(newestFirst).slice(0, 200);
  const existing = entries[index]; const merged = { ...existing, ...next, count: (existing.count || 1) + 1, lastConfirmedAt: next.lastConfirmedAt || stamp() };
  return entries.map((entry, entryIndex) => entryIndex === index ? merged : entry).sort(newestFirst).slice(0, 200);
}

function legacyVendors(source) { return (Array.isArray(source.vendors) ? source.vendors : []).map(normalizeVendor).filter(Boolean).reduce((entries, entry) => mergeLegacy(entries, entry, (item) => normalizeHistoryText(item.value)), []); }
function legacyItems(source) { return (Array.isArray(source.items) ? source.items : []).map(normalizeItem).filter(Boolean).reduce((entries, entry) => mergeLegacy(entries, entry, (item) => [normalizeHistoryText(item.productName), normalizeHistoryText(item.category), item.knowledgeKey || ''].join('\u0000')), []); }

export function normalizeConfirmedHistory(value = {}) {
  if (value && typeof value === 'object' && normalizedHistories.has(value)) return value;
  const source = value && typeof value === 'object' ? value : {}; const vendors = legacyVendors(source); const items = legacyItems(source);
  const merchantFromLegacy = vendors.map((entry) => ({ sourceValue: entry.value, confirmedValue: entry.value, normalizedKey: entry.value, createdAt: entry.lastConfirmedAt, updatedAt: entry.lastConfirmedAt, useCount: entry.count }));
  const productFromLegacy = items.map((entry) => ({ sourceValue: entry.productName, confirmedValue: entry.productName, normalizedKey: entry.productName, createdAt: entry.lastConfirmedAt, updatedAt: entry.lastConfirmedAt, useCount: entry.count }));
  const knowledgeFromLegacy = items.filter((entry) => entry.knowledgeKey).map((entry) => ({ sourceValue: entry.productName, confirmedValue: entry.productName, normalizedKey: entry.productName, knowledgeKey: entry.knowledgeKey, knowledgeVersion: entry.knowledgeVersion, createdAt: entry.lastConfirmedAt, updatedAt: entry.lastConfirmedAt, useCount: entry.count }));
  const categoryFromLegacy = items.filter((entry) => entry.category).map((entry) => ({ sourceValue: entry.productName, confirmedValue: entry.productName, normalizedKey: entry.productName, confirmedCategory: entry.category, createdAt: entry.lastConfirmedAt, updatedAt: entry.lastConfirmedAt, useCount: entry.count }));
  const taxFromLegacy = items.filter((entry) => taxRates.has(entry.taxRate)).map((entry) => ({ sourceValue: entry.productName, confirmedValue: entry.productName, normalizedKey: entry.productName, confirmedTaxRate: entry.taxRate, createdAt: entry.lastConfirmedAt, updatedAt: entry.lastConfirmedAt, useCount: entry.count }));
  const normalized = { ...emptyHistory(), vendors, items, merchantCorrections: normalizeGroup([...(source.merchantCorrections || []), ...merchantFromLegacy], groupConfig.merchantCorrections), productCorrections: normalizeGroup([...(source.productCorrections || []), ...productFromLegacy], groupConfig.productCorrections), knowledgeSelectionHistory: normalizeGroup([...(source.knowledgeSelectionHistory || []), ...knowledgeFromLegacy], groupConfig.knowledgeSelectionHistory), categoryHistory: normalizeGroup([...(source.categoryHistory || []), ...categoryFromLegacy], groupConfig.categoryHistory), taxRateHistory: normalizeGroup([...(source.taxRateHistory || []), ...taxFromLegacy], groupConfig.taxRateHistory) };
  normalizedHistories.add(normalized);
  return normalized;
}

function remember(entries, next, config, timestamp) {
  const entry = normalizeEntry({ ...next, createdAt: timestamp, updatedAt: timestamp, useCount: 1 }, config.kind); if (!entry) return entries;
  const index = entries.findIndex((candidate) => config.key(candidate) === config.key(entry));
  if (index < 0) return [entry, ...entries].sort(newestFirst).slice(0, 200);
  const existing = entries[index]; const merged = { ...existing, ...entry, createdAt: existing.createdAt, updatedAt: timestamp, useCount: existing.useCount + 1 };
  return entries.map((candidate, candidateIndex) => candidateIndex === index ? merged : candidate).sort(newestFirst).slice(0, 200);
}

export function recordConfirmedHistory(history, { vendor, sourceMerchant, items, confirmedAt = stamp() } = {}) {
  const base = normalizeConfirmedHistory(history); const timestamp = validDate(confirmedAt) || stamp(); const confirmedVendor = sanitizeMerchantHistoryValue(vendor?.value ?? vendor); const rawVendor = sanitizeMerchantHistoryValue(sourceMerchant ?? vendor?.sourceValue ?? confirmedVendor);
  let legacyItems = base.items;
  let output = { ...base, vendors: mergeLegacy(base.vendors, normalizeVendor({ value: confirmedVendor, lastConfirmedAt: timestamp }), (entry) => normalizeHistoryText(entry.value)), merchantCorrections: remember(base.merchantCorrections, { sourceValue: rawVendor, confirmedValue: confirmedVendor, normalizedKey: rawVendor }, groupConfig.merchantCorrections, timestamp) };
  for (const item of Array.isArray(items) ? items : []) {
    const productName = text(item?.productName); if (!productName) continue;
    const sourceProductName = text(item?.sourceProductName ?? productName); const category = text(item?.category, 80); const knowledgeKey = text(item?.knowledgeKey, 80) || null; const taxRate = String(item?.taxRate || 'unknown');
    legacyItems = mergeLegacy(legacyItems, normalizeItem({ productName, category, knowledgeKey, knowledgeVersion:item?.knowledgeVersion, taxRate, lastConfirmedAt:timestamp }), (entry) => [normalizeHistoryText(entry.productName), normalizeHistoryText(entry.category), entry.knowledgeKey || ''].join('\u0000'));
    output.productCorrections = remember(output.productCorrections, { sourceValue: sourceProductName, confirmedValue: productName, normalizedKey: sourceProductName }, groupConfig.productCorrections, timestamp);
    if (knowledgeKey) output.knowledgeSelectionHistory = remember(output.knowledgeSelectionHistory, { sourceValue: sourceProductName, confirmedValue: productName, normalizedKey: sourceProductName, knowledgeKey, knowledgeVersion:item?.knowledgeVersion }, groupConfig.knowledgeSelectionHistory, timestamp);
    if (category) output.categoryHistory = remember(output.categoryHistory, { sourceValue: sourceProductName, confirmedValue: productName, normalizedKey: sourceProductName, confirmedCategory: category }, groupConfig.categoryHistory, timestamp);
    if (taxRates.has(taxRate)) output.taxRateHistory = remember(output.taxRateHistory, { sourceValue: sourceProductName, confirmedValue: productName, normalizedKey: sourceProductName, confirmedTaxRate: taxRate }, groupConfig.taxRateHistory, timestamp);
  }
  return { ...output, items: legacyItems };
}

function matchScore(value, query) { const candidate = normalizeHistoryText(value); const expected = normalizeHistoryText(query); if (!candidate || !expected) return 0; if (candidate === expected) return 3; return candidate.includes(expected) || expected.includes(candidate) ? 2 : 0; }
function ranked(entries, query) { return (Array.isArray(entries) ? entries : []).map((entry) => ({ entry, score:matchScore(entry.normalizedKey || entry.sourceValue || entry.confirmedValue, query) })).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score || newestFirst(left.entry, right.entry)).map(({ entry }) => entry).slice(0, 3); }

export const merchantHistoryCandidates = (history, vendor = '') => ranked(normalizeConfirmedHistory(history).merchantCorrections, vendor);
export const productHistoryCandidates = (history, productName = '') => ranked(normalizeConfirmedHistory(history).productCorrections, productName).map((entry) => ({ productName:entry.confirmedValue, count:entry.useCount, lastConfirmedAt:entry.updatedAt, ...entry }));
export const knowledgeHistoryCandidates = (history, productName = '') => ranked(normalizeConfirmedHistory(history).knowledgeSelectionHistory, productName);
export const categoryHistoryCandidates = (history, productName = '') => ranked(normalizeConfirmedHistory(history).categoryHistory, productName);
export const taxRateHistoryCandidates = (history, productName = '') => ranked(normalizeConfirmedHistory(history).taxRateHistory, productName);
export const vendorHistoryCandidates = (history, vendor = '') => {
  const seen = new Set();
  return merchantHistoryCandidates(history, vendor).map((entry) => ({ value:entry.confirmedValue, count:entry.useCount, lastConfirmedAt:entry.updatedAt, ...entry }))
    .filter((entry) => { const key=normalizeHistoryText(entry.value); if(!key||seen.has(key))return false; seen.add(key); return true; });
};
export function vendorHistoryCandidatesForQueries(history, queries = []) { const seen = new Set(); return (Array.isArray(queries) ? queries : [queries]).flatMap((query) => vendorHistoryCandidates(history, query)).filter((entry) => { const key=normalizeHistoryText(entry.value); if(!key||seen.has(key))return false;seen.add(key);return true; }).slice(0,3); }
export const itemHistoryCandidates = (history, productName = '') => {
  const base=normalizeConfirmedHistory(history); const products=productHistoryCandidates(base,productName);
  return products.map((entry) => { const knowledge=knowledgeHistoryCandidates(base,productName).find((candidate)=>candidate.normalizedKey===entry.normalizedKey); const category=categoryHistoryCandidates(base,productName).find((candidate)=>candidate.normalizedKey===entry.normalizedKey); const tax=taxRateHistoryCandidates(base,productName).find((candidate)=>candidate.normalizedKey===entry.normalizedKey); return { ...entry, knowledgeKey:knowledge?.knowledgeKey||null, knowledgeVersion:knowledge?.knowledgeVersion||null, category:category?.confirmedCategory||'', taxRate:tax?.confirmedTaxRate||'unknown' }; });
};
