const text = (value, max = 240) => String(value || '').trim().slice(0, max);

export const normalizeHistoryText = (value = '') => text(value)
  .normalize('NFKC')
  .toLocaleLowerCase('ja-JP')
  .replace(/[\s\-‐‑–—―ー・]/g, '');

const emptyHistory = () => ({ version: 1, vendors: [], items: [] });
const date = (value) => Number.isNaN(new Date(value).getTime()) ? '' : new Date(value).toISOString();
const count = (value) => Math.max(1, Math.floor(Number(value) || 1));

function normalizeVendor(entry = {}) {
  const value = text(entry.value);
  return value ? { value, count: count(entry.count), lastConfirmedAt: date(entry.lastConfirmedAt) } : null;
}

function normalizeItem(entry = {}) {
  const productName = text(entry.productName);
  if (!productName) return null;
  return {
    productName,
    category: text(entry.category, 80),
    knowledgeKey: text(entry.knowledgeKey, 80) || null,
    count: count(entry.count),
    lastConfirmedAt: date(entry.lastConfirmedAt),
  };
}

function newestFirst(left, right) {
  return String(right.lastConfirmedAt).localeCompare(String(left.lastConfirmedAt))
    || right.count - left.count
    || String(left.value || left.productName).localeCompare(String(right.value || right.productName), 'ja-JP');
}

function merge(entries, next, key, normalize) {
  const normalized = normalize(next);
  if (!normalized) return entries;
  const index = entries.findIndex((entry) => key(entry) === key(normalized));
  if (index < 0) return [...entries, normalized].sort(newestFirst).slice(0, 200);
  const existing = entries[index];
  const merged = { ...existing, ...normalized, count: existing.count + 1 };
  return entries.map((entry, entryIndex) => entryIndex === index ? merged : entry).sort(newestFirst).slice(0, 200);
}

export function normalizeConfirmedHistory(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const vendors = (Array.isArray(source.vendors) ? source.vendors : [])
    .map(normalizeVendor).filter(Boolean)
    .reduce((entries, entry) => merge(entries, entry, (item) => normalizeHistoryText(item.value), normalizeVendor), []);
  const items = (Array.isArray(source.items) ? source.items : [])
    .map(normalizeItem).filter(Boolean)
    .reduce((entries, entry) => merge(entries, entry, (item) => [
      normalizeHistoryText(item.productName), normalizeHistoryText(item.category), item.knowledgeKey || '',
    ].join('\u0000'), normalizeItem), []);
  return { ...emptyHistory(), vendors, items };
}

export function recordConfirmedHistory(history, { vendor, items, confirmedAt = new Date().toISOString() } = {}) {
  const base = normalizeConfirmedHistory(history);
  const timestamp = date(confirmedAt) || new Date().toISOString();
  const vendors = merge(base.vendors, { value: vendor, lastConfirmedAt: timestamp }, (entry) => normalizeHistoryText(entry.value), normalizeVendor);
  const savedItems = (Array.isArray(items) ? items : []).reduce((entries, item) => merge(entries, {
    productName: item?.productName,
    category: item?.category,
    knowledgeKey: item?.knowledgeKey,
    lastConfirmedAt: timestamp,
  }, (entry) => [normalizeHistoryText(entry.productName), normalizeHistoryText(entry.category), entry.knowledgeKey || ''].join('\u0000'), normalizeItem), base.items);
  return { ...base, vendors, items: savedItems };
}

function matchScore(value, query) {
  const candidate = normalizeHistoryText(value); const expected = normalizeHistoryText(query);
  if (!candidate || !expected) return expected ? 0 : 1;
  if (candidate === expected) return 3;
  if (candidate.includes(expected) || expected.includes(candidate)) return 2;
  return 0;
}

function ranked(entries, value, field) {
  return entries.map((entry) => ({ entry, score: matchScore(entry[field], value) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || newestFirst(left.entry, right.entry))
    .map(({ entry }) => entry);
}

export const vendorHistoryCandidates = (history, vendor = '') =>
  ranked(normalizeConfirmedHistory(history).vendors, vendor, 'value');

export function vendorHistoryCandidatesForQueries(history, queries = []) {
  const seen = new Set();
  return (Array.isArray(queries) ? queries : [queries])
    .flatMap((query) => vendorHistoryCandidates(history, query))
    .filter((entry) => {
      const key = normalizeHistoryText(entry.value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export const productHistoryCandidates = (history, productName = '') =>
  ranked(normalizeConfirmedHistory(history).items, productName, 'productName')
    .filter((entry, index, entries) => entries.findIndex((candidate) => normalizeHistoryText(candidate.productName) === normalizeHistoryText(entry.productName)) === index);

export const itemHistoryCandidates = (history, productName = '') =>
  ranked(normalizeConfirmedHistory(history).items, productName, 'productName');
