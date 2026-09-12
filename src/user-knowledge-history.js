const now = () => new Date().toISOString();
const clean = (value) => String(value || '').normalize('NFKC').replace(/[\s　]/g, '').toLocaleLowerCase('ja-JP');
const text = (value, limit = 240) => String(value || '').trim().slice(0, limit);
const groups = ['merchantCorrections', 'productCorrections', 'categoryHistory', 'knowledgeSelectionHistory'];

export function normalizeKnowledgeHistory(value = {}) {
  const output = { merchantCorrections: [], productCorrections: [], categoryHistory: [], knowledgeSelectionHistory: [] };
  for (const group of groups) output[group] = Array.isArray(value?.[group]) ? value[group].filter((entry) => entry && typeof entry === 'object').map((entry) => ({ ...entry, raw: text(entry.raw), confirmed: text(entry.confirmed), createdAt: entry.createdAt || now(), updatedAt: entry.updatedAt || entry.createdAt || now(), source: entry.source || 'user_confirmed_history' })).filter((entry) => entry.raw && entry.confirmed) : [];
  return output;
}

export function rememberConfirmation(history, group, raw, confirmed) {
  const output = normalizeKnowledgeHistory(history); const normalizedRaw = text(raw); const normalizedConfirmed = text(confirmed);
  if (!groups.includes(group) || !normalizedRaw || !normalizedConfirmed) return output;
  const existing = output[group].find((entry) => clean(entry.raw) === clean(normalizedRaw) && entry.confirmed === normalizedConfirmed);
  if (existing) existing.updatedAt = now();
  else output[group].unshift({ raw: normalizedRaw, confirmed: normalizedConfirmed, createdAt: now(), updatedAt: now(), source: 'user_confirmed_history' });
  output[group] = output[group].slice(0, 100);
  return output;
}

export function historySuggestions(history, group, raw, limit = 3) {
  const key = clean(raw); if (!key) return [];
  return normalizeKnowledgeHistory(history)[group]
    .filter((entry) => { const candidate = clean(entry.raw); return candidate === key || candidate.includes(key) || key.includes(candidate); })
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, limit);
}
