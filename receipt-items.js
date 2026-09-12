import { createReceiptItem, ITEM_CATEGORY_OPTIONS } from './src/models.js';
import { analyzeReceiptOcr, extractReceiptItemCandidates } from './src/receipt-item-ocr.js';
import { itemHistoryCandidates, productHistoryCandidates } from './src/confirmed-history.js';
import { purchasePurposeKnowledgeByKey } from './src/data/purchasePurposeKnowledge.js';
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

function totals() {
  const itemTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const claimTotal = items.filter((item) => item.submissionStatus === 'included')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const receiptTotal = Number($('#form')?.amount?.value || 0);
  return { itemTotal, claimTotal, receiptTotal, difference: receiptTotal - itemTotal };
}

function categoryOptions() {
  return ITEM_CATEGORY_OPTIONS.map((value) => '<option value="' + esc(value) + '"></option>').join('');
}

function confirmedHistory() {
  return window.receiptApp?.getConfirmedHistory?.() || {};
}

function uniqueKnowledge(entries) {
  return entries.filter((entry, index) => entries.findIndex((candidate) => candidate.key === entry.key) === index);
}

function knowledgeControl(item) {
  const selected = selectedKnowledge(item);
  const historical = itemHistoryCandidates(confirmedHistory(), item.productName)
    .map((entry) => purchasePurposeKnowledgeByKey(entry.knowledgeKey)).filter(Boolean);
  const matches = knowledgeCandidatesForProduct(item.productName);
  const candidates = uniqueKnowledge([selected, ...historical, ...matches].filter(Boolean));
  const historicalKeys = new Set(historical.map((entry) => entry.key));
  const option = (entry) => '<option value="' + esc(entry.key) + '"'
    + (item.knowledgeKey === entry.key ? ' selected' : '') + '>'
    + esc(entry.category) + '</option>';
  const options = [
    '<option value="">該当なし（手入力）</option>',
    ...(historicalKeys.size ? ['<optgroup label="過去に確定">', ...candidates.filter((entry) => historicalKeys.has(entry.key)).map(option), '</optgroup>'] : []),
    ...(candidates.some((entry) => !historicalKeys.has(entry.key)) ? ['<optgroup label="Knowledge候補">', ...candidates.filter((entry) => !historicalKeys.has(entry.key)).map(option), '</optgroup>'] : []),
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

function categoryHistoryList(item) {
  const id = 'confirmedCategoryHistory-' + esc(item.id);
  const categories = [
    ...itemHistoryCandidates(confirmedHistory(), item.productName).map((entry) => entry.category),
    ...ITEM_CATEGORY_OPTIONS,
  ].filter(Boolean).filter((entry, index, entries) => entries.indexOf(entry) === index);
  return '<datalist id="' + id + '">'
    + categories.map((entry) => '<option value="' + esc(entry) + '"></option>').join('')
    + '</datalist>';
}

function productHistoryButtons(item) {
  const candidates = productHistoryCandidates(confirmedHistory(), item.productName).slice(0, 5);
  if (!candidates.length) return '';
  return '<p class="hint">過去に確定した商品名：'
    + candidates.map((entry) => '<button type="button" data-action="apply-history-product" data-value="'
      + esc(encodeURIComponent(entry.productName)) + '">' + esc(entry.productName) + '</button>').join(' ')
    + '</p>';
}

function row(item, index) {
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

  return '<article class="receipt-item-card" data-id="' + esc(item.id) + '">'
    + '<div class="receipt-item-title"><strong>商品 ' + (index + 1)
    + (item.confidence != null && item.confidence < 0.65 ? '（要確認）' : '') + '</strong>'
    + '<button type="button" class="small-button danger" data-action="delete">削除</button></div>'
    + '<div class="receipt-item-grid item-basics">'
    + '<label>商品名<input data-field="productName" list="confirmedProductHistory" value="' + esc(item.productName) + '"></label>'
    + '<label>数量<input data-field="quantity" type="number" min="0" step="0.01" value="' + esc(item.quantity) + '"></label>'
    + '<label>単価<input data-field="unitPrice" type="number" min="0" step="0.01" value="' + esc(item.unitPrice) + '"></label>'
    + '<label>金額<input data-field="amount" type="number" min="0" step="0.01" value="' + esc(item.amount) + '"></label>'
    + '</div>'
    + productHistoryButtons(item)
    + knowledgeControl(item)
    + '<div class="receipt-item-grid item-edit-fields">'
    + '<label>種別<input data-field="category" list="confirmedCategoryHistory-' + esc(item.id) + '" placeholder="候補から選択または自由入力" value="' + esc(item.category) + '" required></label>'
    + categoryHistoryList(item)
    + '<label class="full purpose-field">購入目的・必要性'
    + '<textarea data-field="purpose" data-autogrow rows="8">' + esc(item.purpose?.value || '') + '</textarea>'
    + restore + '</label>'
    + '<label class="full">補足事実<textarea data-field="notes" rows="3">' + esc(item.notes || '') + '</textarea></label>'
    + '<label>提出状態<select data-field="submissionStatus">' + statuses + '</select></label>'
    + '</div>'
    + '<span class="item-basis">' + esc((item.basis || []).join(' / ')) + '</span>'
    + '</article>';
}

function autoGrow(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(textarea.scrollHeight, 184) + 'px';
}

function render() {
  if (!host) return;
  const summary = totals();
  const quality = ocrQuality
    ? '<p class="ocr-item-quality ' + esc(ocrQuality.status || '') + '">'
      + (ocrQuality.candidateCount
        ? '購入品候補 ' + ocrQuality.candidateCount + '件を読み取りました。'
        : '商品明細を十分に認識できませんでした。原本を確認して、もう一度読み取ってください。')
      + (ocrQuality.lowConfidenceCount ? ' 要確認 ' + ocrQuality.lowConfidenceCount + '件' : '')
      + '</p>'
    : '';

  host.innerHTML = '<h3>商品整理</h3>' + quality
    + '<p class="help">Knowledgeは種別・購入目的の初期値と根拠です。最終的な内容は利用者が自由に編集・確定します。</p>'
    + '<datalist id="receiptItemCategories">' + categoryOptions() + '</datalist>'
    + '<datalist id="confirmedProductHistory">' + productHistoryCandidates(confirmedHistory()).map((entry) => '<option value="' + esc(entry.productName) + '"></option>').join('') + '</datalist>'
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

function update(id, field, value, renderAfter = true) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return;
  if (['quantity', 'unitPrice', 'amount'].includes(field)) {
    value = Number.isFinite(Number(value)) ? Number(value) : 0;
  }
  if (field === 'purpose') {
    item.purpose = { value, source: 'manual', confidence: null };
    item.purposeSource = item.knowledgeKey ? 'manual_override' : 'manual';
  } else if (field === 'category') {
    item.category = String(value || '').trim() || 'その他';
    item.categorySource = item.knowledgeKey ? 'manual_override' : 'manual';
  } else {
    item[field] = value;
  }
  item.source = 'manual';
  item.confidence = null;
  if (renderAfter) render();
}

function selectKnowledge(id, key) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return;
  const current = items[index];
  if (key && hasManualKnowledgeFields(current)) {
    const confirmed = window.confirm('\u73fe\u5728\u306e\u8cfc\u5165\u76ee\u7684\u3092\u3001\u65b0\u3057\u304f\u9078\u629e\u3057\u305fKnowledge\u539f\u6587\u3067\u7f6e\u304d\u63db\u3048\u307e\u3059\u304b\uff1f');
    if (!confirmed) { render(); return; }
  }
  items[index] = applySelectedKnowledge(current, key);
  render();
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
  render();
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
  render();
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
  render();
  return { candidateCount: candidates.length, added: 0, retained: items.length > 0, headers: result.headers, quality: result.quality };
}

function handleAction(button) {
  const action = button.dataset.action;
  if (action === 'add') {
    items.push(createReceiptItem({ lineOrder: items.length + 1, submissionStatus: 'review' }));
    render();
    return;
  }
  if (action === 'ocr') {
    cacheCandidates($('#corrected')?.value || $('#raw')?.value || '');
    appendCachedCandidates();
    return;
  }
  const card = button.closest('[data-id]');
  if (!card) return;
  if (action === 'apply-history-product') {
    update(card.dataset.id, 'productName', decodeURIComponent(button.dataset.value || ''));
  } else if (action === 'delete') {
    items = items.filter((item) => item.id !== card.dataset.id);
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
      category: 'その他',
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
  render();
  return {
    candidateCount: candidates.length, added: 0, retained: items.length > 0,
    headers: { vendor: result.vendor || '', purchaseDate: result.purchaseDate || '', receiptTotalAmount: result.receiptTotalAmount ?? null },
    quality: ocrQuality,
  };
}

function install() {
  if (typeof document === 'undefined') return;
  const form = $('#form');
  if (!form) return;
  host = document.createElement('section');
  host.id = 'receiptItems';
  host.className = 'receipt-items full';
  form.querySelector('.fields').append(host);

  host.addEventListener('input', (event) => {
    const card = event.target.closest('[data-id]');
    if (!card || !event.target.dataset.field) return;
    const field = event.target.dataset.field;
    const keepEditing = ['productName', 'category', 'purpose', 'notes'].includes(field);
    update(card.dataset.id, field, event.target.value, !keepEditing);
    if (field === 'purpose') autoGrow(event.target);
  });
  host.addEventListener('change', (event) => {
    const card = event.target.closest('[data-id]');
    if (!card) return;
    if (event.target.dataset.knowledgeKey !== undefined) {
      selectKnowledge(card.dataset.id, event.target.value);
    } else if (event.target.dataset.field && event.target.dataset.field !== 'purpose') {
      update(card.dataset.id, event.target.dataset.field, event.target.value);
    }
  });
  host.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) handleAction(button);
  });
  form.amount?.addEventListener('input', render);

  window.receiptItemsController = {
    getItems: () => items.map((item, index) => createReceiptItem({ ...item, lineOrder: index + 1 })),
    setItems: (value) => {
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
      render();
    },
  };
  render();
}

install();
