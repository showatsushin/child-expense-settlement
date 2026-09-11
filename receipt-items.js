import { createReceiptItem, ITEM_CATEGORY_OPTIONS } from './src/models.js';
import { analyzeReceiptOcr, extractReceiptItemCandidates } from './src/receipt-item-ocr.js';
import { suggestAiItem, suggestItemPurposes } from './src/services/itemSuggestion.js';
import { getAccessToken } from './src/auth-gate.js';

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const yen = (value) => `\u00a5${Number(value || 0).toLocaleString('ja-JP')}`;
let items = [];
let cachedOcrCandidates = [];
let ocrQuality = null;
let host;

function totals() {
  const itemTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const claimTotal = items.filter((item) => item.submissionStatus === 'included').reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return { itemTotal, claimTotal, difference: Number($('#form')?.amount?.value || 0) - itemTotal };
}
function receipt() { const form = $('#form'); return { paidDate: form?.paidDate?.value || '', vendor: form?.vendor?.value || '' }; }
function childLabel() { return $('#child')?.selectedOptions?.[0]?.textContent || ''; }
function row(item, index) {
  const categories = ITEM_CATEGORY_OPTIONS.map((value) => `<option ${value === item.category ? 'selected' : ''}>${esc(value)}</option>`).join('');
  const statuses = [['included','\u63d0\u51fa\u5bfe\u8c61'],['excluded','\u5bfe\u8c61\u5916'],['review','\u8981\u78ba\u8a8d']].map(([value,label]) => `<option value="${value}" ${value === item.submissionStatus ? 'selected' : ''}>${label}</option>`).join('');
  return `<article class="receipt-item-card" data-id="${esc(item.id)}"><div class="receipt-item-title"><strong>\u5546\u54c1 ${index + 1}${item.confidence < .65 ? ' \u8981\u78ba\u8a8d' : ''}</strong><button type="button" class="small-button danger" data-action="delete">\u524a\u9664</button></div><div class="receipt-item-grid"><label>\u5546\u54c1\u540d<input data-field="productName" value="${esc(item.productName)}"></label><label>\u6570\u91cf<input data-field="quantity" type="number" min="0" step="0.01" value="${esc(item.quantity)}"></label><label>\u5358\u4fa1<input data-field="unitPrice" type="number" min="0" step="0.01" value="${esc(item.unitPrice)}"></label><label>\u91d1\u984d<input data-field="amount" type="number" min="0" step="0.01" value="${esc(item.amount)}"></label><label>\u7a2e\u5225<select data-field="category">${categories}</select></label><label>\u63d0\u51fa\u72b6\u614b<select data-field="submissionStatus">${statuses}</select></label><label class="full">\u8cfc\u5165\u76ee\u7684\u30fb\u5fc5\u8981\u6027<textarea data-field="purpose" rows="3">${esc(item.purpose?.value || '')}</textarea></label><label class="full">\u88dc\u8db3\u4e8b\u5b9f\uff08AI\u63d0\u6848\u306b\u4f7f\u7528\u3059\u308b\u5834\u5408\u306e\u307f\uff09<textarea data-field="notes" rows="2">${esc(item.notes || '')}</textarea></label></div><div class="receipt-item-actions"><button type="button" class="secondary" data-action="local">\u7406\u7531\u3092\u63d0\u6848</button><button type="button" class="primary" data-action="ai">AI\u3067\u63d0\u6848</button><span class="item-basis">${esc((item.basis || []).join(' / '))}</span></div><div class="item-proposals" aria-live="polite"></div></article>`;
}
function render() {
  if (!host) return; const summary = totals(); const quality = ocrQuality ? '<p class="ocr-item-quality '+ocrQuality.status+'">'+(ocrQuality.candidateCount ? '\u8cfc\u5165\u54c1 '+ocrQuality.candidateCount+'\u4ef6\u3092\u8aad\u307f\u53d6\u308a\u307e\u3057\u305f\u3002' : '\u5546\u54c1\u660e\u7d30\u3092\u5341\u5206\u306b\u8a8d\u8b58\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002')+(ocrQuality.lowConfidenceCount ? ' \u8981\u78ba\u8a8d '+ocrQuality.lowConfidenceCount+'\u4ef6' : '')+(ocrQuality.difference != null ? ' / \u5dee\u984d '+yen(ocrQuality.difference) : '')+'</p>' : '';
  host.innerHTML = `<h3>\u8cfc\u5165\u54c1\u660e\u7d30</h3>${quality}<p class="help">\u5546\u54c1\u3054\u3068\u306b\u7a2e\u5225\u3001\u76ee\u7684\u3001\u63d0\u51fa\u72b6\u614b\u3092\u78ba\u8a8d\u3057\u307e\u3059\u3002\u63d0\u51fa\u5bfe\u8c61\u306f\u5229\u7528\u8005\u304c\u9078\u3073\u307e\u3059\u3002</p><div class="receipt-item-summary"><span>\u5546\u54c1\u660e\u7d30\u5408\u8a08 ${yen(summary.itemTotal)}</span><span>\u63d0\u51fa\u5bfe\u8c61\u984d ${yen(summary.claimTotal)}</span><span class="${summary.difference ? 'difference-warning' : ''}">\u30ec\u30b7\u30fc\u30c8\u7dcf\u984d\u3068\u306e\u5dee\u984d ${yen(summary.difference)}${summary.difference ? ' \u8981\u78ba\u8a8d' : ''}</span></div><div class="receipt-item-toolbar"><button type="button" class="secondary" data-action="add">+ \u5546\u54c1\u3092\u8ffd\u52a0</button><button type="button" class="secondary" data-action="ocr">OCR\u5019\u88dc\u304b\u3089\u8ffd\u52a0</button></div><div class="receipt-item-list">${items.length ? items.map(row).join('') : '<p class="help">OCR\u5019\u88dc\u304c\u4e0d\u8db3\u306e\u5834\u5408\u306f\u3001\u300c\u5546\u54c1\u3092\u8ffd\u52a0\u300d\u304b\u3089\u624b\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002</p>'}</div>`;
}
function update(id, field, value) {
  const item = items.find((candidate) => candidate.id === id); if (!item) return;
  if (['quantity','unitPrice','amount'].includes(field)) value = Number.isFinite(Number(value)) ? Number(value) : 0;
  if (field === 'purpose') item.purpose = { value, source: 'manual', confidence: null }; else item[field] = value;
  item.source = 'manual'; item.confidence = null;
  render();
}
function candidateKey(item) { return String((item.basis || [])[0] || item.productName + ':' + item.amount); }
function cacheCandidates(text) { const result = analyzeReceiptOcr(text || ''); cachedOcrCandidates = extractReceiptItemCandidates(text || '', result); ocrQuality = result.quality; return result; }
function appendCachedCandidates() { const known = new Set(items.map(candidateKey)); const additions = cachedOcrCandidates.filter((item) => !known.has(candidateKey(item))); items.push(...additions.map((item, index) => createReceiptItem({ ...item, lineOrder: items.length + index + 1 }))); render(); return additions.length; }
export function shouldAutofillOcrCandidates(existingItems, candidates) {
  return Array.isArray(existingItems) && existingItems.length === 0 && Array.isArray(candidates) && candidates.length > 0;
}function applyOcrCandidates(text) { const result = cacheCandidates(text); const candidates = result.items; if (shouldAutofillOcrCandidates(items, candidates)) { items = candidates.map((item, index) => createReceiptItem({ ...item, lineOrder: index + 1 })); render(); return { candidateCount: candidates.length, added: candidates.length, retained: false, headers:result.headers, quality:result.quality }; } render(); return { candidateCount: candidates.length, added: 0, retained: items.length > 0, headers:result.headers, quality:result.quality }; }
function showProposals(container, proposals, id, categorySuggestion = null) {
  container._proposals = proposals; container._categorySuggestion = categorySuggestion;
  const category = categorySuggestion ? `<article class="item-category-proposal"><strong>AI\u7a2e\u5225\u5019\u88dc</strong><p>${esc(categorySuggestion.value)}</p><small>\u6839\u62e0: ${esc(categorySuggestion.reason || '')} \u30fb \u78ba\u5ea6 ${Math.round((categorySuggestion.confidence || 0) * 100)}%</small><button type="button" class="secondary" data-category-proposal="${esc(id)}">\u7a2e\u5225\u306b\u63a1\u7528</button></article>` : '';
  container.innerHTML = category + proposals.map((proposal, index) => `<article><strong>${esc(proposal.style)}</strong><p>${esc(proposal.value)}</p><small>\u6839\u62e0: ${esc((proposal.basis || []).join(' / '))}</small><button type="button" class="secondary" data-proposal="${index}" data-item="${esc(id)}">\u3053\u306e\u6587\u7ae0\u3092\u4f7f\u7528</button></article>`).join('');
}
async function handleAction(button) {
  const action = button.dataset.action;
  if (action === 'add') { items.push(createReceiptItem({ lineOrder: items.length + 1, submissionStatus: 'review' })); render(); return; }
  if (action === 'ocr') { cacheCandidates($('#corrected')?.value || $('#raw')?.value || ''); appendCachedCandidates(); return; }
  const card = button.closest('[data-id]'); if (!card) return; const item = items.find((candidate) => candidate.id === card.dataset.id); if (!item) return;
  if (action === 'delete') { items = items.filter((candidate) => candidate.id !== item.id); render(); return; }
  const proposalHost = card.querySelector('.item-proposals');
  if (action === 'local') { showProposals(proposalHost, suggestItemPurposes(item), item.id); return; }
  if (action === 'ai') { button.disabled = true; proposalHost.textContent = 'AI\u304c\u8cfc\u5165\u54c1\u3092\u6574\u7406\u3057\u3066\u3044\u307e\u3059\u2026'; try { const result = await suggestAiItem({ ...item, ocrTextRelevantExcerpt: $('#corrected')?.value || $('#raw')?.value || '' }, receipt(), childLabel(), { accessToken: await getAccessToken() }); showProposals(proposalHost, result.purposeSuggestions, item.id, result.categorySuggestion); } catch { proposalHost.textContent = 'AI\u63d0\u6848\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u30ed\u30fc\u30ab\u30eb\u5019\u88dc\u306f\u5f15\u304d\u7d9a\u304d\u5229\u7528\u3067\u304d\u307e\u3059\u3002'; } finally { button.disabled = false; } }
}
function install() {
  if (typeof document === 'undefined') return;
  const form = $('#form'); if (!form) return; host = document.createElement('section'); host.id = 'receiptItems'; host.className = 'receipt-items full'; form.querySelector('.fields').append(host);
  host.addEventListener('input', (event) => { const card = event.target.closest('[data-id]'); if (card && event.target.dataset.field) update(card.dataset.id, event.target.dataset.field, event.target.value); });
  host.addEventListener('change', (event) => { const card = event.target.closest('[data-id]'); if (card && event.target.dataset.field) update(card.dataset.id, event.target.dataset.field, event.target.value); });
  host.addEventListener('click', (event) => { const categoryProposal = event.target.closest('[data-category-proposal]'); if (categoryProposal) { const proposalHost = categoryProposal.closest('.item-proposals'); const item = items.find((candidate) => candidate.id === categoryProposal.dataset.categoryProposal); const category = proposalHost._categorySuggestion; if (item && category) { item.category = category.value; item.source = 'ai'; item.confidence = category.confidence; item.basis = category.basis || []; render(); } return; } const proposal = event.target.closest('[data-proposal]'); if (proposal) { const proposalHost = proposal.closest('.item-proposals'); const item = items.find((candidate) => candidate.id === proposal.dataset.item); const candidate = proposalHost._proposals?.[Number(proposal.dataset.proposal)]; if (item && candidate) { item.purpose = { value: candidate.value, source: candidate.source, confidence: candidate.confidence }; item.source = candidate.source; item.confidence = candidate.confidence; item.basis = candidate.basis || []; render(); } return; } const button = event.target.closest('[data-action]'); if (button) handleAction(button); });
  form.amount?.addEventListener('input', render); window.receiptItemsController = { getItems: () => items.map((item, index) => createReceiptItem({ ...item, lineOrder: index + 1 })), setItems: (value) => { items = (Array.isArray(value) ? value : []).map((item, index) => createReceiptItem({ ...item, lineOrder: index + 1 })); render(); }, applyOcrCandidates, reset: () => { items = []; cachedOcrCandidates = []; ocrQuality = null; render(); } }; render();
}
install();
