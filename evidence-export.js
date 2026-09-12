import { receiptClaimTotal, receiptTotal } from './src/calculations.js';
import { buildSubmissionBundles } from './src/submission-bundles.js';
import { makeReceiptItemsCsv, makeReceiptSummaryCsv, downloadReceiptCsv } from './src/export.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const yen = (value) => `¥${Number(value || 0).toLocaleString('ja-JP')}`;
const isPdf = (evidence) => evidence?.mimeType === 'application/pdf' || /\.pdf$/i.test(evidence?.fileName || '');
async function app() { while (!window.receiptApp) await new Promise((resolve) => setTimeout(resolve, 20)); return window.receiptApp; }
function openView() { let view = document.querySelector('#evidenceSubmissionView'); if (!view) { view = document.createElement('section'); view.id = 'evidenceSubmissionView'; view.className = 'print evidence-submission-view'; document.body.append(view); } return view; }

function settlementMarkup(record, evidence) {
  const items = Array.isArray(record.items) ? record.items : [];
  const itemRows = items.map((item) => `<tr><td>${esc(item.productName)}</td><td>${esc(item.category)}</td><td>${yen(item.amount)}</td><td>${esc(item.purpose?.value ?? item.purpose)}</td></tr>`).join('');
  return `<section class="submission-settlement"><h1>${esc(evidence.evidenceNumber)} 清算資料</h1><dl><div><dt>購入日</dt><dd>${esc(record.paidDate)}</dd></div><div><dt>購入店</dt><dd>${esc(record.vendor?.value ?? record.vendor)}</dd></div><div><dt>レシート総額</dt><dd>${yen(receiptTotal(record))}</dd></div><div><dt>提出対象額</dt><dd>${yen(receiptClaimTotal(record))}</dd></div></dl><table><thead><tr><th>商品名</th><th>種別</th><th>金額</th><th>購入目的・必要性</th></tr></thead><tbody>${itemRows || '<tr><td colspan="4">購入品明細はありません。</td></tr>'}</tbody></table></section>`;
}

async function appendOriginal(current, evidence, pair) {
  const original = document.createElement('article');
  original.className = 'submitted-evidence';
  original.innerHTML = `<h1>${esc(evidence.evidenceNumber)} 原本証拠</h1><p>${esc(evidence.fileName)}</p>`;
  const file = await current.getFile(evidence.id);
  if (!file) original.insertAdjacentHTML('beforeend', '<p class="difference-warning">原本ファイルがこの端末にありません。</p>');
  else {
    const url = URL.createObjectURL(file);
    if (isPdf(evidence)) original.insertAdjacentHTML('beforeend', `<p>PDF原本: <a href="${url}" target="_blank" rel="noopener">${esc(evidence.fileName)}を開く</a></p>`);
    else original.append(Object.assign(document.createElement('img'), { src: url, alt: `${evidence.evidenceNumber} ${evidence.fileName}` }));
  }
  pair.append(original);
}

async function renderSubmission(receiptId = '') {
  const current = await app();
  const records = current.getRecords().filter((record) => !receiptId || record.id === receiptId);
  const view = openView();
  view.innerHTML = `<div class="print-toolbar"><button type="button" class="primary" data-print>この内容を印刷 / PDF保存</button><button type="button" class="secondary" data-close>戻る</button></div><article class="print-sheet"><section id="submissionBundles"></section></article>`;
  const host = view.querySelector('#submissionBundles');
  for (const bundle of buildSubmissionBundles(records, current.getEvidences())) {
    const pair = document.createElement('section');
    pair.className = 'receipt-evidence-set';
    pair.dataset.evidenceNumber = bundle.evidence.evidenceNumber;
    pair.append(document.createRange().createContextualFragment(settlementMarkup(bundle.receipts[0], bundle.evidence)));
    await appendOriginal(current, bundle.evidence, pair);
    host.append(pair);
  }
  if (!host.children.length) host.innerHTML = '<p>出力できる原本証拠がありません。</p>';
  view.querySelector('[data-print]').onclick = () => window.print();
  view.querySelector('[data-close]').onclick = () => view.remove();
}

async function install() {
  const current = await app();
  const header = document.querySelector('.top > div:last-child');
  if (!header) return;
  const submission = document.createElement('button');
  submission.type = 'button';
  submission.textContent = '提出用資料＋原本';
  submission.className = 'primary';
  submission.onclick = () => renderSubmission();
  const csv = document.createElement('button');
  csv.type = 'button';
  csv.textContent = '購入品CSV';
  csv.onclick = () => {
    const evidenceById = new Map(current.getEvidences().map((evidence) => [evidence.id, evidence]));
    downloadReceiptCsv(makeReceiptItemsCsv(current.getRecords(), evidenceById), 'receipt-items.csv');
    downloadReceiptCsv(makeReceiptSummaryCsv(current.getRecords(), evidenceById), 'receipt-summary.csv');
  };
  header.append(csv, submission);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-submission-record]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  renderSubmission(button.dataset.submissionRecord);
}, true);

install();
