import { createReceiptItem, ITEM_CATEGORY_OPTIONS } from './src/models.js';
import { analyzeReceiptOcr, extractReceiptItemCandidates } from './src/receipt-item-ocr.js';
import {
  applySelectedKnowledge,
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
  const claimTotal = items
    .filter((item) => item.submissionStatus === 'included')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const receiptTotal = Number($('#form')?.amount?.value || 0);
  return { itemTotal, claimTotal, receiptTotal, difference: receiptTotal - itemTotal };
}

function categoryOptions() {
  return ITEM_CATEGORY_OPTIONS
    .map((value) => '<option value="' + esc(value) + '"></option>')
    .join('');
}

function knowledgeControl(item) {
  const selected = selectedKnowledge(item);
  const matches = knowledgeCandidatesForProduct(item.productName);
  const candidates = selected && !matches.some((entry) => entry.key === selected.key)
    ? [selected, ...matches]
    : matches;
  const options = [
    '<option value="">該当なし（手入力）</option>',
    ...candidates.map((entry) => '<option value="' + esc(entry.key) + '"'
      + (item.knowledgeKey === entry.key ? ' selected' : '') + '>'
      + esc(entry.category) + '</option>'),
  ].join('');

  const source = selected
    ? '<details class="knowledge-source"><summary>根拠の原文を見る</summary><dl>'
      + '<dt>資料</dt><dd>' + esc(selected.sourceDocument) + '</dd>'
      + '<dt>項目</dt><dd>' + esc(selected.sourceSection) + '</dd>'
      + '<dt>source</dt><dd>' + esc(selected.source) + '</dd>'
      + '<dt>version</dt><dd>' + esc(selected.version) + '</dd>'
      + '</dl><pre>' + esc(selected.sourceExcerpt) + '</pre></details>'
    : '<p class="help">候補を選ぶと、利用者提供資料の原文を購入目的欄へそのまま反映します。</p>';

  return '<section class="item-knowledge"><label>購入目的Knowledge'
    + '<select data-knowledge-key>' + options + '</select></label>'
    + source + '</section>';
}

function row(item, index) {
  const statuses = [
    ['included', '提出する'],
    ['excluded', '提出しない'],
    ['review', '要確認'],
  ].map(([value, label]) => '<option value="' + value + '"'
    + (value === item.submissionStatus ? ' selected' : '') + '>'
    + label + '</option>').join('');

  return '<article class="receipt-item-card" data-id="' + esc(item.id) + '">'
    + '<div class="receipt-item-title"><strong>商品 ' + (index + 1)
    + (item.confidence < 0.65 ? '（要確認）' : '') + '</strong>'
    + '<button type="button" class="small-button danger" data-action="delete">削除</button></div>'
    + '<div class="receipt-item-grid">'
    + '<label>商品名<input data-field="productName" value="' + esc(item.productName) + '"></label>'
    + '<label>数量<input data-field="quantity" type="number" min="0" step="0.01" value="' + esc(item.quantity) + '"></label>'
    + '<label>単価<input data-field="unitPrice" type="number" min="0" step="0.01" value="' + esc(item.unitPrice) + '"></label>'
    + '<label>金額<input data-field="amount" type="number" min="0" step="0.01" value="' + esc(item.amount) + '"></label>'
    + '<label>種別<input data-field="category" list="receiptItemCategories" value="' + esc(item.category) + '" required></label>'
    + '<label>提出状態<select data-field="submissionStatus">' + statuses + '</select></label>'
    + '<label class="full">購入目的・必要性<textarea data-field="purpose" rows="6">'
    + esc(item.purpose?.value || '') + '</textarea></label>'
    + '<label class="full">補足事実<textarea data-field="notes" rows="2">' + esc(item.notes || '') + '</textarea></label>'
    + '</div>'
    + knowledgeControl(item)
    + '<span class="item-basis">' + esc((item.basis || []).join(' / ')) + '</span>'
    + '</article>';
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
    + '<p class="help">商品ごとにKnowledge候補を人が選び、原文を購入目的・必要性へ反映します。'
    + '種別・提出状態・購入目的はすべて利用者が確認して確定します。</p>'
    + '<datalist id="receiptItemCategories">' + categoryOptions() + '</datalist>'
    + '<div class="receipt-item-summary">'
    + '<span>レシート総額 ' + yen(summary.receiptTotal) + '</span>'
    + '<span>商品明細合計 ' + yen(summary.itemTotal) + '</span>'
    + '<span class="' + (summary.difference ? 'difference-warning' : '') + '">整合状態 '
    + (summary.difference ? '差額 ' + yen(summary.difference) : '一致') + '</span>'
    + '<span>提出対象額 ' + yen(summary.claimTotal) + '</span>'
    + '</div>'
    + '<div class="receipt-item-toolbar">'
    + '<button type="button" class="secondary" data-action="add">+ 商品を追加</button>'
    + '<button type="button" class="secondary" data-action="ocr">OCR候補から追加</button>'
    + '</div><div class="receipt-item-list">'
    + (items.length ? items.map(row).join('') : '<p class="help">商品を追加して確認してください。</p>')
    + '</div>';
}

function update(id, field, value) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return;
  if (['quantity', 'unitPrice', 'amount'].includes(field)) {
    value = Number.isFinite(Number(value)) ? Number(value) : 0;
  }
  if (field === 'purpose') {
    item.purpose = { value, source: 'manual', confidence: null };
  } else if (field === 'category') {
    item.category = String(value || '').trim() || 'その他';
  } else {
    item[field] = value;
  }
  item.source = 'manual';
  item.confidence = null;
  render();
}

function selectKnowledge(id, key) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return;
  items[index] = applySelectedKnowledge(items[index], key);
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
    return {
      candidateCount: candidates.length, added: candidates.length, retained: false,
      headers: result.headers, quality: result.quality,
    };
  }
  render();
  return {
    candidateCount: candidates.length, added: 0, retained: items.length > 0,
    headers: result.headers, quality: result.quality,
  };
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
  if (action === 'delete' && card) {
    items = items.filter((item) => item.id !== card.dataset.id);
    render();
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
      purpose: { value: '', source: 'ocr', confidence: 0 },
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
      headers: {
        vendor: result.vendor || '',
        purchaseDate: result.purchaseDate || '',
        receiptTotalAmount: result.receiptTotalAmount ?? null,
      },
      quality: ocrQuality,
    };
  }
  render();
  return {
    candidateCount: candidates.length, added: 0, retained: items.length > 0,
    headers: {
      vendor: result.vendor || '',
      purchaseDate: result.purchaseDate || '',
      receiptTotalAmount: result.receiptTotalAmount ?? null,
    },
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
    if (card && event.target.dataset.field) update(card.dataset.id, event.target.dataset.field, event.target.value);
  });
  host.addEventListener('change', (event) => {
    const card = event.target.closest('[data-id]');
    if (!card) return;
    if (event.target.dataset.knowledgeKey !== undefined) {
      selectKnowledge(card.dataset.id, event.target.value);
    } else if (event.target.dataset.field) {
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
      items = (Array.isArray(value) ? value : [])
        .map((item, index) => createReceiptItem({ ...item, lineOrder: index + 1 }));
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
