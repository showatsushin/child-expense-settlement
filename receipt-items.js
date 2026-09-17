import { createReceiptItem, ITEM_CATEGORY_OPTIONS } from './src/models.js';
import { analyzeReceiptOcr, extractReceiptItemCandidates } from './src/receipt-item-ocr.js';
import { calculateTaxInclusiveAmount, hasUnappliedTaxExclusiveAmount, taxRateLabel } from './src/item-tax.js';
import { itemHistoryCandidates, knowledgeHistoryCandidates, normalizeConfirmedHistory, productHistoryCandidates, taxRateHistoryCandidates } from './src/confirmed-history.js';
import { PURCHASE_PURPOSE_KNOWLEDGE, purchasePurposeKnowledgeByKey } from './src/data/purchasePurposeKnowledge.js';
import { taxRateSuggestionsForProduct } from './src/services/taxRateKnowledge.js';
import {
  applySelectedKnowledge,
  hasManualKnowledgeFields,
  knowledgeCandidatesForProduct,
  selectedKnowledge,
} from './src/services/purchasePurposeSelection.js';

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const yen = (value) => '¥' + Number(value || 0).toLocaleString('ja-JP');

let items = [];
let cachedOcrCandidates = [];
let ocrQuality = null;
let host;
const taxExclusiveInputs = new Map();
const editingItemIds = new Set();
let taxSubmitWarningItems = [];
let renderHistory = null;

function totals() {
  const itemTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const claimTotal = items.filter((item) => item.submissionStatus === 'included')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const receiptTotal = Number($('#form')?.amount?.value || 0);
  return { itemTotal, claimTotal, receiptTotal, difference: receiptTotal - itemTotal };
}

function unappliedTaxExclusiveItems() {
  return items.filter((item) => hasUnappliedTaxExclusiveAmount(item, taxExclusiveInputs.get(item.id)));
}

function taxSubmitWarning() {
  if (!taxSubmitWarningItems.length) return '';
  const names = taxSubmitWarningItems.map((item, index) => esc(item.productName || ('商品 ' + (index + 1)))).join('、');
  return '<section class="tax-submit-warning" role="alert"><p>税抜入力のまま税込参考額を金額へ反映していない商品が '
    + taxSubmitWarningItems.length + ' 件あります。確認してから登録してください。</p><p class="help">' + names + '</p>'
    + '<div><button type="button" class="secondary" data-action="review-tax-submit">確認する</button> '
    + '<button type="button" class="secondary" data-action="cancel-tax-submit">登録を中止</button></div></section>';
}

function categoryOptions() {
  return ITEM_CATEGORY_OPTIONS.map((value) => '<option value="' + esc(value) + '"></option>').join('');
}

function confirmedHistory() {
  return window.receiptApp?.getConfirmedHistory?.() || {};
}

function knowledgeControl(item) {
  const history = renderHistory;
  const selected = selectedKnowledge(item);
  const historical = itemHistoryCandidates(history, item.productName)
    .map((entry) => purchasePurposeKnowledgeByKey(entry.knowledgeKey)).filter(Boolean);
  const historicalKeys = new Set(historical.map((entry) => entry.key));
  const option = (entry) => '<option value="' + esc(entry.key) + '"'
    + (item.knowledgeKey === entry.key ? ' selected' : '') + '>'
    + esc(entry.category) + '</option>';
  const options = [
    '<option value="">選択してください</option>',
    ...(historical.length ? ['<optgroup label="過去に確定">', ...historical.map(option), '</optgroup>'] : []),
    '<optgroup label="全Knowledge一覧">', ...PURCHASE_PURPOSE_KNOWLEDGE.filter((entry) => !historicalKeys.has(entry.key)).map(option), '</optgroup>',
    '<option value="manual">該当なし（手入力）</option>',
  ].join('');

  const source = selected
    ? '<details class="knowledge-source"><summary>根拠の原文を見る</summary><dl>'
      + '<dt>資料</dt><dd>' + esc(selected.sourceDocument) + '</dd>'
      + '<dt>項目</dt><dd>' + esc(selected.sourceSection) + '</dd>'
      + '<dt>source</dt><dd>' + esc(selected.source) + '</dd>'
      + '<dt>version</dt><dd>' + esc(selected.version) + '</dd>'
      + '</dl><pre>' + esc(selected.sourceExcerpt) + '</pre></details>'
    : '<p class="help">該当なしを選んだ場合も、種別と購入目的・必要性を自由に入力して登録できます。</p>';

  return '<section class="item-knowledge"><label>購入目的Knowledge'
    + '<select data-knowledge-key>' + options + '</select></label>'
    + source + '</section>';
}

function sourceExcerptSummary(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 88 ? text.slice(0, 88) + '…' : text;
}

function knowledgeRecommendations(item) {
  const current = selectedKnowledge(item);
  const history = knowledgeHistoryCandidates(renderHistory, item.productName);
  const recommendations = knowledgeCandidatesForProduct(item.productName);
  const seen = new Set();
  const candidates = [
    ...history.map((entry) => ({ ...purchasePurposeKnowledgeByKey(entry.knowledgeKey), origin: '過去の確定', useCount: entry.useCount })),
    ...recommendations.map((entry) => ({ ...entry, origin: '推奨' })),
  ].filter((entry) => entry?.key && !seen.has(entry.key) && seen.add(entry.key)).slice(0, 3);
  if (!candidates.length) {
    return '<section class="item-recommendations"><span>Knowledge</span><p>現在: <strong>'
      + esc(current?.category || '未選択') + '</strong></p><p>推奨: なし</p>'
      + '<button type="button" class="small-button" data-action="choose-knowledge">Knowledgeを選ぶ</button></section>';
  }
  const rows = candidates.map((entry) => '<div class="item-recommendation"><p>' + esc(entry.origin) + ': <strong>' + esc(entry.category) + '</strong></p>'
    + '<p class="help">' + esc(sourceExcerptSummary(entry.sourceExcerpt)) + '</p>'
    + '<button type="button" class="secondary" data-action="apply-knowledge" data-value="'
    + esc(encodeURIComponent(entry.key)) + '">この推奨を使う</button></div>').join('');
  return '<section class="item-recommendations"><span>Knowledge</span><p>現在: <strong>'
    + esc(current?.category || '未選択') + '</strong></p>' + rows
    + ' <button type="button" class="small-button" data-action="choose-knowledge">別のKnowledgeを選ぶ</button></section>';
}

function taxRateRecommendations(item) {
  const current = taxRateLabel(item.taxRate || 'unknown');
  const history = taxRateHistoryCandidates(renderHistory, item.productName)
    .map((entry) => ({ suggestedTaxRate: entry.confirmedTaxRate, basis: '過去の人間確定', origin: '過去の確定', useCount: entry.useCount }));
  const suggestions = taxRateSuggestionsForProduct(item.productName)
    .map((entry) => ({ ...entry, origin: '推奨' }));
  const seen = new Set(); const recommendations = [...history, ...suggestions]
    .filter((entry) => entry.suggestedTaxRate && !seen.has(entry.suggestedTaxRate) && seen.add(entry.suggestedTaxRate)).slice(0, 3);
  if (!recommendations.length) {
    return '<section class="item-recommendations"><span>税率</span><p>現在: <strong>' + esc(current)
      + '</strong></p><p>推奨: なし</p></section>';
  }
  const buttons = recommendations.map((entry) => '<div class="item-recommendation"><p>' + esc(entry.origin) + ': <strong>'
    + esc(taxRateLabel(entry.suggestedTaxRate)) + '</strong></p><button type="button" class="secondary" data-action="apply-tax-suggestion" data-value="'
    + esc(entry.suggestedTaxRate) + '">' + esc(taxRateLabel(entry.suggestedTaxRate)) + 'を使う</button></div>').join('');
  const basis = recommendations.map((entry) => esc(entry.basis)).filter((value, index, values) => values.indexOf(value) === index).join(' / ');
  return '<section class="item-recommendations"><span>税率</span><p>現在: <strong>' + esc(current) + '</strong></p>' + buttons
    + '<span class="help"> ' + basis + '。候補であり自動確定しません。</span></section>';
}

function productHistoryRecommendations(item) {
  const current = String(item.productName || '');
  const candidates = productHistoryCandidates(renderHistory, current)
    .filter((entry) => entry.productName && entry.productName !== current).slice(0, 3);
  if (!candidates.length) return '';
  return '<section class="item-recommendations"><span>過去の確定商品名</span>'
    + candidates.map((entry) => '<div class="item-recommendation"><strong>' + esc(entry.productName) + '</strong> '
      + '<button type="button" class="secondary" data-action="apply-history-product" data-value="' + esc(encodeURIComponent(entry.productName)) + '">この履歴を使う</button></div>').join('')
    + '</section>';
}

function categoryHistoryList(item) {
  const id = 'confirmedCategoryHistory-' + esc(item.id);
  const categories = [
    ...itemHistoryCandidates(renderHistory, item.productName).map((entry) => entry.category),
    ...ITEM_CATEGORY_OPTIONS,
  ].filter(Boolean).filter((entry, index, entries) => entries.indexOf(entry) === index);
  return '<datalist id="' + id + '">'
    + categories.map((entry) => '<option value="' + esc(entry) + '"></option>').join('')
    + '</datalist>';
}

function categoryCandidateButtons(item) {
  const unique = (values) => values.map((value) => String(value || '').trim()).filter(Boolean)
    .filter((value, index, entries) => entries.indexOf(value) === index);
  const historical = unique(itemHistoryCandidates(renderHistory, item.productName).map((entry) => entry.category));
  const existing = ITEM_CATEGORY_OPTIONS.filter((value) => !historical.includes(value));
  const buttons = (categories, className = '') => categories.map((category) => '<button type="button" class="category-candidate-chip ' + className + '" data-action="apply-category" data-value="'
    + esc(encodeURIComponent(category)) + '">' + esc(category) + '</button>').join(' ');
  return '<details class="item-category-candidates"><summary>候補</summary><div class="item-category-candidate-list">'
    + (historical.length ? '<p class="hint category-history-candidates">過去に確定：' + buttons(historical, 'history') + '</p>' : '')
    + '<p class="hint">候補：' + buttons(existing) + '</p></div></details>';
}

function productHistoryButtons(item) {
  const candidates = productHistoryCandidates(renderHistory, item.productName).slice(0, 5);
  if (!candidates.length) return '';
  return '<p class="hint">過去に確定した商品名：'
    + candidates.map((entry) => '<button type="button" data-action="apply-history-product" data-value="'
      + esc(encodeURIComponent(entry.productName)) + '">' + esc(entry.productName) + '</button>').join(' ')
    + '</p>';
}

function taxOption(value, label, selected) {
  return '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + label + '</option>';
}

function taxControls(item) {
  const mode = item.amountInputMode || 'tax_included'; const rate = item.taxRate || 'unknown';
  const taxExclusiveAmount = taxExclusiveInputs.get(item.id) ?? '';
  const taxInclusiveAmount = mode === 'tax_excluded' ? calculateTaxInclusiveAmount(taxExclusiveAmount, rate) : null;
  const modes = [taxOption('tax_included','税込',mode === 'tax_included'),taxOption('tax_excluded','税抜',mode === 'tax_excluded')].join('');
  const rates = [taxOption('8','8%',rate === '8'),taxOption('10','10%',rate === '10'),taxOption('exempt','非課税',rate === 'exempt'),taxOption('out_of_scope','対象外',rate === 'out_of_scope'),taxOption('unknown','不明',rate === 'unknown')].join('');
  const reference = mode !== 'tax_excluded' ? '' : (!['8','10'].includes(rate)
    ? '<p class="help full">税率未確認・非課税・対象外では税込参考額を計算しません。</p>'
    : '<label>税抜金額<input data-tax-exclusive type="number" min="0" step="0.01" value="' + esc(taxExclusiveAmount) + '"></label><div class="full tax-reference">税込参考額: ' + (taxInclusiveAmount == null ? '—' : yen(taxInclusiveAmount)) + (taxInclusiveAmount == null ? '' : ' <button type="button" class="secondary" data-action="apply-tax-inclusive">税込額へ反映</button>') + '<span class="help"> 参考値（1円単位・四捨五入）。原本の記載金額を優先してください。</span></div>');
  return '<div class="receipt-item-grid item-tax-fields"><label>金額入力<select data-field="amountInputMode">' + modes + '</select></label><label>税率<select data-field="taxRate">' + rates + '</select></label>' + reference + '</div>';
}

function editRow(item, index) {
  const statuses = [
    ['included', '提出する'],
    ['excluded', '提出しない'],
    ['review', '要確認'],
  ].map(([value, label]) => '<option value="' + value + '"'
    + (item.submissionStatus === value ? ' selected' : '') + '>'
    + label + '</option>').join('');
  const restore = item.originalKnowledgePurpose
    ? '<button type="button" class="secondary restore-knowledge" data-action="restore-knowledge">Knowledge原文に戻す</button>'
    : '';

  return '<article class="receipt-item-card" data-id="' + esc(item.id) + '" data-item-id="' + esc(item.id) + '">'
    + '<div class="receipt-item-title"><strong>商品 ' + (index + 1)
    + (item.confidence != null && item.confidence < 0.65 ? '（要確認）' : '') + '</strong>'
    + '<button type="button" class="small-button danger" data-action="delete">削除</button></div>'
    + '<div class="receipt-item-grid item-basics">'
    + '<label>商品名<input data-field="productName" list="confirmedProductHistory" value="' + esc(item.productName) + '"></label>'
    + '<label>数量<input data-field="quantity" type="number" min="0" step="0.01" value="' + esc(item.quantity) + '"></label>'
    + '<label>単価<input data-field="unitPrice" type="number" min="0" step="0.01" value="' + esc(item.unitPrice) + '"></label>'
    + '<label>金額<input data-field="amount" type="number" min="0" step="0.01" value="' + esc(item.amount) + '"></label>'
    + '</div>'
    + taxControls(item)
    + productHistoryButtons(item)
    + knowledgeControl(item)
    + '<div class="receipt-item-grid item-edit-fields">'
    + '<label>種別<input data-field="category" list="confirmedCategoryHistory-' + esc(item.id) + '" placeholder="候補から選択または自由入力" value="' + esc(item.category) + '" required></label>'
    + categoryHistoryList(item)
    + categoryCandidateButtons(item)
    + '<label class="full purpose-field">購入目的・必要性'
    + '<textarea data-field="purpose" data-autogrow rows="8">' + esc(item.purpose?.value || '') + '</textarea>'
    + restore + '</label>'
    + '<label class="full">補足事実<textarea data-field="notes" rows="3">' + esc(item.notes || '') + '</textarea></label>'
    + '<label>提出状態<select data-field="submissionStatus">' + statuses + '</select></label>'
    + '</div>'
    + '<button type="button" class="secondary finish-item-edit" data-action="finish-edit">修正を完了</button>'
    + '<span class="item-basis">' + esc((item.basis || []).join(' / ')) + '</span>'
    + '</article>';
}

function submissionStatusLabel(value) {
  return ({ included: '提出する', excluded: '提出しない', review: '要確認' })[value] || '要確認';
}

function readOnlyRow(item, index) {
  const purpose = item.purpose?.value || '未入力';
  const category = item.category || '未分類';
  return '<article class="receipt-item-card receipt-item-readonly" data-id="' + esc(item.id) + '" data-item-id="' + esc(item.id) + '">'
    + '<div class="receipt-item-title"><strong>商品 ' + (index + 1)
    + (item.confidence != null && item.confidence < 0.65 ? '（要確認）' : '') + '</strong>'
    + '<div><button type="button" class="small-button secondary" data-action="edit">修正</button> '
    + '<button type="button" class="small-button danger" data-action="delete">削除</button></div></div>'
    + '<div class="receipt-item-grid item-readonly-fields">'
    + '<p><span>商品名</span><strong>' + esc(item.productName || '未入力') + '</strong></p>'
    + '<p><span>数量</span><strong>' + esc(item.quantity) + '</strong></p>'
    + '<p><span>金額</span><strong>' + yen(item.amount) + '</strong></p>'
    + '<p><span>税率</span><strong>' + esc(taxRateLabel(item.taxRate || 'unknown')) + '</strong></p>'
    + '<p><span>種別</span><strong>' + esc(category) + '</strong></p>'
    + '<p class="full"><span>購入目的・必要性</span><strong>' + esc(purpose) + '</strong></p>'
    + '<p><span>提出状態</span><strong>' + esc(submissionStatusLabel(item.submissionStatus)) + '</strong></p>'
    + '</div>' + productHistoryRecommendations(item) + knowledgeRecommendations(item) + taxRateRecommendations(item)
    + '<span class="item-basis">' + esc((item.basis || []).join(' / ')) + '</span></article>';
}

function row(item, index) {
  return editingItemIds.has(item.id) ? editRow(item, index) : readOnlyRow(item, index);
}

function autoGrow(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(textarea.scrollHeight, 184) + 'px';
}

function itemCard(id) {
  if (!host) return null;
  return [...host.querySelectorAll('[data-item-id]')]
    .find((card) => card.dataset.itemId === id) || null;
}

function renderTotals() {
  if (!host) return;
  const summary = totals();
  const summaryHost = host.querySelector('.receipt-item-summary');
  if (!summaryHost) return;
  summaryHost.innerHTML = '<span>レシート総額 ' + yen(summary.receiptTotal) + '</span>'
    + '<span>商品明細合計 ' + yen(summary.itemTotal) + '</span>'
    + '<span class="' + (summary.difference ? 'difference-warning' : '') + '">整合差額 '
    + (summary.difference ? '差額 ' + yen(summary.difference) : '一致') + '</span>'
    + '<span>提出対象額 ' + yen(summary.claimTotal) + '</span>';
}

function renderTaxSubmitWarning() {
  const warning = host?.querySelector('[data-tax-submit-warning]');
  if (warning) warning.innerHTML = taxSubmitWarning();
}

function renderItem(id) {
  const item = items.find((candidate) => candidate.id === id);
  const card = itemCard(id);
  if (!item || !card) return;
  const template = document.createElement('template');
  template.innerHTML = row(item, items.indexOf(item));
  const replacement = template.content.firstElementChild;
  card.replaceWith(replacement);
  replacement.querySelectorAll('textarea[data-autogrow]').forEach(autoGrow);
}

function ocrQualityMarkup() {
  if (!ocrQuality) return '';
  return '<p class="ocr-item-quality ' + esc(ocrQuality.status || '') + '">'
    + (ocrQuality.candidateCount
      ? '購入品候補 ' + ocrQuality.candidateCount + '件を読み取りました。'
      : '商品行を自動追加できませんでした。原本を確認して、もう一度読み取ってください。')
    + (ocrQuality.lowConfidenceCount ? ' 要確認 ' + ocrQuality.lowConfidenceCount + '件' : '')
    + '</p>';
}

function renderOcrQuality() {
  const quality = host?.querySelector('[data-ocr-item-quality]');
  if (quality) quality.innerHTML = ocrQualityMarkup();
}

function render() {
  if (!host) return;
  const history = normalizeConfirmedHistory(confirmedHistory());
  renderHistory = history;
  const summary = totals();
  const quality = ocrQuality
    ? '<p class="ocr-item-quality ' + esc(ocrQuality.status || '') + '">'
      + (ocrQuality.candidateCount
        ? '購入品候補 ' + ocrQuality.candidateCount + '件を読み取りました。'
        : '商品明細を十分に認識できませんでした。原本を確認して、もう一度読み取ってください。')
      + (ocrQuality.lowConfidenceCount ? ' 要確認 ' + ocrQuality.lowConfidenceCount + '件' : '')
      + '</p>'
    : '';

  host.innerHTML = '<h3>商品整理</h3><div data-ocr-item-quality>' + quality + '</div>'
    + '<p class="help">Knowledgeは種別・購入目的の初期値と根拠です。最終的な内容は利用者が自由に編集・確定します。</p>'
    + '<datalist id="receiptItemCategories">' + categoryOptions() + '</datalist>'
    + '<datalist id="confirmedProductHistory">' + productHistoryCandidates(history).map((entry) => '<option value="' + esc(entry.productName) + '"></option>').join('') + '</datalist>'
    + '<div data-tax-submit-warning>' + taxSubmitWarning() + '</div>'
    + '<div class="receipt-item-summary">'
    + '<span>レシート総額 ' + yen(summary.receiptTotal) + '</span>'
    + '<span>商品明細合計 ' + yen(summary.itemTotal) + '</span>'
    + '<span class="' + (summary.difference ? 'difference-warning' : '') + '">整合状態 '
    + (summary.difference ? '差額 ' + yen(summary.difference) : '一致') + '</span>'
    + '<span>提出対象額 ' + yen(summary.claimTotal) + '</span>'
    + '</div><div class="receipt-item-toolbar">'
    + '<button type="button" class="secondary" data-action="add">+ 商品を追加</button>'
    + '<button type="button" class="secondary" data-action="ocr">OCR候補から追加</button>'
    + '</div><div class="receipt-item-list">'
    + (items.length ? items.map(row).join('') : '<p class="help">商品を追加して確認してください。</p>')
    + '</div>';

  host.querySelectorAll('textarea[data-autogrow]').forEach(autoGrow);
}

function update(id, field, value, { renderCard = false, renderSummary = false } = {}) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return;
  if (['quantity', 'unitPrice', 'amount'].includes(field)) {
    value = Number.isFinite(Number(value)) ? Number(value) : 0;
  }
  if (field === 'purpose') {
    item.purpose = { value, source: 'manual', confidence: null };
    item.purposeSource = item.knowledgeKey ? 'manual_override' : 'manual';
  } else if (field === 'category') {
    item.category = String(value || '').trim();
    item.categorySource = item.knowledgeKey ? 'manual_override' : 'manual';
  } else {
    if (field === 'productName' && !item.sourceProductName) item.sourceProductName = item.productName;
    item[field] = value;
  }
  item.source = 'manual';
  item.confidence = null;
  taxSubmitWarningItems = [];
  renderTaxSubmitWarning();
  if (renderCard) renderItem(id);
  if (renderSummary) renderTotals();
}

function selectKnowledge(id, key) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return;
  const current = items[index];
  if (key && key !== 'manual' && hasManualKnowledgeFields(current)) {
    const confirmed = window.confirm('\u73fe\u5728\u306e\u8cfc\u5165\u76ee\u7684\u3092\u3001\u65b0\u3057\u304f\u9078\u629e\u3057\u305fKnowledge\u539f\u6587\u3067\u7f6e\u304d\u63db\u3048\u307e\u3059\u304b\uff1f');
    if (!confirmed) return;
  }
  items[index] = applySelectedKnowledge(current, key);
  renderItem(id);
}

function restoreKnowledgePurpose(id) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item?.originalKnowledgePurpose) return;
  const confirmed = window.confirm('\u73fe\u5728\u306e\u8cfc\u5165\u76ee\u7684\u30fb\u5fc5\u8981\u6027\u3092Knowledge\u306e\u5143\u539f\u6587\u3067\u7f6e\u304d\u63db\u3048\u307e\u3059\u304b\uff1f');
  if (!confirmed) return;
  item.purpose = { value: item.originalKnowledgePurpose, source: 'knowledge', confidence: 1 };
  item.purposeSource = 'knowledge';
  item.source = 'manual';
  item.confidence = null;
  renderItem(id);
}

function candidateKey(item) {
  return String((item.basis || [])[0] || item.productName + ':' + item.amount);
}

function cacheCandidates(text) {
  const result = analyzeReceiptOcr(text || '');
  cachedOcrCandidates = extractReceiptItemCandidates(text || '', result);
  ocrQuality = result.quality;
  return result;
}

function appendCachedCandidates() {
  const known = new Set(items.map(candidateKey));
  const additions = cachedOcrCandidates.filter((item) => !known.has(candidateKey(item)));
  items.push(...additions.map((item, index) => createReceiptItem({
    ...item,
    lineOrder: items.length + index + 1,
  })));
  if (additions.length) render();
  else renderOcrQuality();
  return additions.length;
}

export function shouldAutofillOcrCandidates(existingItems, candidates) {
  return Array.isArray(existingItems) && existingItems.length === 0
    && Array.isArray(candidates) && candidates.length > 0;
}

function applyOcrCandidates(text) {
  const result = cacheCandidates(text);
  const candidates = result.items;
  if (shouldAutofillOcrCandidates(items, candidates)) {
    items = candidates.map((item, index) => createReceiptItem({ ...item, lineOrder: index + 1 }));
    render();
    return { candidateCount: candidates.length, added: candidates.length, retained: false, headers: result.headers, quality: result.quality };
  }
  renderOcrQuality();
  return { candidateCount: candidates.length, added: 0, retained: items.length > 0, headers: result.headers, quality: result.quality };
}

function handleAction(button) {
  const action = button.dataset.action;
  if (action === 'add') {
    const item = createReceiptItem({ lineOrder: items.length + 1, submissionStatus: 'review' });
    items.push(item);
    editingItemIds.add(item.id);
    render();
    return;
  }
  if (action === 'ocr') {
    cacheCandidates($('#corrected')?.value || $('#raw')?.value || '');
    appendCachedCandidates();
    return;
  }
  const card = button.closest('[data-id]');
  if (action === 'review-tax-submit') {
    const reviewIds = taxSubmitWarningItems.map((item) => item.id);
    reviewIds.forEach((id) => editingItemIds.add(id));
    taxSubmitWarningItems = [];
    renderTaxSubmitWarning();
    reviewIds.forEach(renderItem);
    return;
  }
  if (action === 'cancel-tax-submit') {
    taxSubmitWarningItems = [];
    renderTaxSubmitWarning();
    return;
  }
  if (!card) return;
  if (action === 'edit') {
    editingItemIds.add(card.dataset.id);
    renderItem(card.dataset.id);
  } else if (action === 'choose-knowledge') {
    editingItemIds.add(card.dataset.id);
    renderItem(card.dataset.id);
  } else if (action === 'apply-knowledge') {
    selectKnowledge(card.dataset.id, decodeURIComponent(button.dataset.value || ''));
  } else if (action === 'apply-tax-suggestion') {
    const item = items.find((candidate) => candidate.id === card.dataset.id);
    const nextRate = button.dataset.value || 'unknown';
    if (item?.taxRate && item.taxRate !== 'unknown' && item.taxRate !== nextRate && !window.confirm('現在の税率を履歴・候補の税率で置き換えますか？')) return;
    update(card.dataset.id, 'taxRate', nextRate, { renderCard: true });
  } else if (action === 'finish-edit') {
    editingItemIds.delete(card.dataset.id);
    renderItem(card.dataset.id);
  } else if (action === 'apply-tax-inclusive') {
    const item = items.find((candidate) => candidate.id === card.dataset.id);
    const amount = calculateTaxInclusiveAmount(taxExclusiveInputs.get(card.dataset.id), item?.taxRate);
    if (amount != null) update(card.dataset.id, 'amount', amount, { renderCard: true, renderSummary: true });
  } else if (action === 'apply-category') {
    const item = items.find((candidate) => candidate.id === card.dataset.id);
    const nextCategory = decodeURIComponent(button.dataset.value || '');
    if (item?.category && item.category !== nextCategory && !window.confirm('現在の種別を履歴・候補の種別で置き換えますか？')) return;
    update(card.dataset.id, 'category', nextCategory, { renderCard: true });
  } else if (action === 'apply-history-product') {
    const item = items.find((candidate) => candidate.id === card.dataset.id);
    const nextProductName = decodeURIComponent(button.dataset.value || '');
    if (item?.productName && item.productName !== nextProductName && !window.confirm('現在の商品名を過去の確定商品名で置き換えますか？')) return;
    update(card.dataset.id, 'productName', nextProductName, { renderCard: true });
  } else if (action === 'delete') {
    items = items.filter((item) => item.id !== card.dataset.id);
    editingItemIds.delete(card.dataset.id);
    taxExclusiveInputs.delete(card.dataset.id);
    render();
  } else if (action === 'restore-knowledge') {
    restoreKnowledgePurpose(card.dataset.id);
  }
}

function applyReceiptReaderCandidates(reader) {
  const result = reader && typeof reader === 'object' ? reader : {};
  const provider = result.provider === 'openai' ? 'openai' : 'tesseract';
  const candidates = (Array.isArray(result.items) ? result.items : [])
    .filter((item) => item?.productName && Number.isFinite(Number(item.amount)) && Number(item.amount) >= 0)
    .map((item, index) => ({
      id: 'reader-' + provider + '-' + (index + 1),
      lineOrder: index + 1,
      productName: item.productName,
      quantity: item.quantity == null ? 1 : item.quantity,
      unitPrice: item.unitPrice == null ? item.amount : item.unitPrice,
      amount: item.amount,
      category: '',
      categorySource: 'manual',
      purpose: { value: '', source: 'ocr', confidence: 0 },
      purposeSource: 'manual',
      submissionStatus: 'review',
      source: 'ocr',
      confidence: item.confidence,
      basis: [provider + ' receipt reader'],
      sourceLines: item.sourceText ? [item.sourceText] : [],
      sourceLineNumbers: [],
      notes: '',
    }));

  cachedOcrCandidates = candidates;
  ocrQuality = result.quality || {
    status: 'low_confidence',
    candidateCount: candidates.length,
    lowConfidenceCount: candidates.filter((item) => item.confidence == null || item.confidence < 0.65).length,
  };
  if (shouldAutofillOcrCandidates(items, candidates)) {
    items = candidates.map((item, index) => createReceiptItem({ ...item, lineOrder: index + 1 }));
    render();
    return {
      candidateCount: candidates.length, added: candidates.length, retained: false,
      headers: { vendor: result.vendor || '', purchaseDate: result.purchaseDate || '', receiptTotalAmount: result.receiptTotalAmount ?? null },
      quality: ocrQuality,
    };
  }
  renderOcrQuality();
  return {
    candidateCount: candidates.length, added: 0, retained: items.length > 0,
    headers: { vendor: result.vendor || '', purchaseDate: result.purchaseDate || '', receiptTotalAmount: result.receiptTotalAmount ?? null },
    quality: ocrQuality,
  };
}

export function initializeReceiptItems() {
  if (typeof document === 'undefined') return null;
  if (window.receiptItemsController) return window.receiptItemsController;
  const form = $('#form');
  if (!form) return null;
  host = document.createElement('section');
  host.id = 'receiptItems';
  host.className = 'receipt-items full';
  form.querySelector('.fields').append(host);

  host.addEventListener('input', (event) => {
    const card = event.target.closest('[data-id]');
    if (!card) return;
    if (event.target.dataset.taxExclusive !== undefined) { taxExclusiveInputs.set(card.dataset.id, event.target.value); return; }
    if (!event.target.dataset.field) return;
    const field = event.target.dataset.field;
    const keepEditing = ['quantity', 'unitPrice', 'amount'].includes(field);
    update(card.dataset.id, field, event.target.value, {
      renderSummary: keepEditing || field === 'submissionStatus',
    });
    if (field === 'purpose') autoGrow(event.target);
  });
  host.addEventListener('change', (event) => {
    const card = event.target.closest('[data-id]');
    if (!card) return;
    if (event.target.dataset.taxExclusive !== undefined) {
      taxExclusiveInputs.set(card.dataset.id, event.target.value);
      renderItem(card.dataset.id);
    } else if (event.target.dataset.knowledgeKey !== undefined) {
      selectKnowledge(card.dataset.id, event.target.value);
    } else if (event.target.dataset.field && event.target.dataset.field !== 'purpose') {
      const field = event.target.dataset.field;
      update(card.dataset.id, field, event.target.value, {
        renderCard: true,
        renderSummary: ['quantity', 'unitPrice', 'amount', 'submissionStatus'].includes(field),
      });
    }
  });
  host.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) handleAction(button);
  });
  form.addEventListener('submit', (event) => {
    const pending = unappliedTaxExclusiveItems();
    if (!pending.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    taxSubmitWarningItems = pending;
    renderTaxSubmitWarning();
  }, true);
  form.amount?.addEventListener('input', renderTotals);

  window.receiptItemsController = {
    getItems: () => items.map((item, index) => createReceiptItem({ ...item, lineOrder: index + 1 })),
    setItems: (value) => {
      taxExclusiveInputs.clear();
      editingItemIds.clear();
      taxSubmitWarningItems = [];
      items = (Array.isArray(value) ? value : []).map((item, index) =>
        createReceiptItem({ ...item, lineOrder: index + 1 }));
      render();
    },
    applyOcrCandidates,
    applyReceiptReaderCandidates,
    reset: () => {
      items = [];
      cachedOcrCandidates = [];
      ocrQuality = null;
      taxExclusiveInputs.clear();
      editingItemIds.clear();
      taxSubmitWarningItems = [];
      render();
    },
  };
  render();
  return window.receiptItemsController;
}
