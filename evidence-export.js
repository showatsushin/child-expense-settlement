import { buildEvidenceManifest } from './src/evidence-manifest.js';
import { calculateReceiptSummary, receiptClaimTotal, receiptTotal } from './src/calculations.js';
import { buildSubmissionBundles } from './src/submission-bundles.js';
import { makeReceiptItemsCsv, makeReceiptSummaryCsv, downloadReceiptCsv } from './src/export.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const yen = (value) => `\u00a5${Number(value || 0).toLocaleString('ja-JP')}`;
const isPdf = (evidence) => evidence?.mimeType === 'application/pdf' || /\.pdf$/i.test(evidence?.fileName || '');
async function app() { while (!window.receiptApp) await new Promise((resolve) => setTimeout(resolve, 20)); return window.receiptApp; }
function openView() { let view = document.querySelector('#evidenceSubmissionView'); if (!view) { view = document.createElement('section'); view.id = 'evidenceSubmissionView'; view.className = 'print evidence-submission-view'; document.body.append(view); } return view; }
async function renderSubmission() {
  const current = await app(); const records = current.getRecords(); const evidences = current.getEvidences(); const summary = calculateReceiptSummary(records); const view = openView();
  view.innerHTML = `<div class="print-toolbar"><button type="button" class="primary" data-print>\u3053\u306e\u5185\u5bb9\u3092\u5370\u5237 / PDF\u4fdd\u5b58</button><button type="button" class="secondary" data-close>\u623b\u308b</button></div><article class="print-sheet"><h1>\u6e05\u7b97\u8cc7\u6599\uff0b\u539f\u672c\u8a3c\u62e0</h1><section><h2>1. \u6e05\u7b97\u6982\u8981</h2><p>\u30ec\u30b7\u30fc\u30c8\u4ef6\u6570: ${summary.receiptCount}\u4ef6\u3000\u30ec\u30b7\u30fc\u30c8\u7dcf\u984d: ${yen(summary.receiptTotalAmount)}\u3000\u63d0\u51fa\u5bfe\u8c61\u7dcf\u984d: ${yen(summary.claimTotalAmount)}</p><ul>${summary.categorySubtotals.map((item) => `<li>${esc(item.category)}: ${yen(item.amount)}</li>`).join('') || '<li>\u63d0\u51fa\u5bfe\u8c61\u306e\u8cfc\u5165\u54c1\u306f\u3042\u308a\u307e\u305b\u3093\u3002</li>'}</ul></section><section><h2>2. \u30ec\u30b7\u30fc\u30c8\u4e00\u89a7</h2><table><thead><tr><th>\u8a3c\u62e0\u756a\u53f7</th><th>\u8cfc\u5165\u65e5</th><th>\u8cfc\u5165\u5e97</th><th>\u30ec\u30b7\u30fc\u30c8\u7dcf\u984d</th><th>\u63d0\u51fa\u5bfe\u8c61\u984d</th></tr></thead><tbody>${records.map((record) => `<tr><td>${esc((record.evidenceIds || []).map((id) => evidences.find((evidence) => evidence.id === id)?.evidenceNumber || '').join(' / '))}</td><td>${esc(record.paidDate)}</td><td>${esc(record.vendor?.value ?? record.vendor)}</td><td>${yen(receiptTotal(record))}</td><td>${yen(receiptClaimTotal(record))}</td></tr>`).join('')}</tbody></table></section><section><h2>3. \u8cfc\u5165\u54c1\u660e\u7d30</h2><table><thead><tr><th>\u8a3c\u62e0\u756a\u53f7</th><th>\u5546\u54c1\u540d</th><th>\u7a2e\u5225</th><th>\u91d1\u984d</th><th>\u8cfc\u5165\u76ee\u7684\u30fb\u5fc5\u8981\u6027</th><th>\u63d0\u51fa\u72b6\u614b</th></tr></thead><tbody>${records.flatMap((record) => (record.items || []).map((item) => `<tr><td>${esc((record.evidenceIds || []).map((id) => evidences.find((evidence) => evidence.id === id)?.evidenceNumber || '').join(' / '))}</td><td>${esc(item.productName)}</td><td>${esc(item.category)}</td><td>${yen(item.amount)}</td><td>${esc(item.purpose?.value ?? item.purpose)}</td><td>${esc(item.submissionStatus)}</td></tr>`)).join('')}</tbody></table></section><section id="submissionEvidence"><h2>4. \u8a3c\u62e0\u539f\u672c</h2><p>\u753b\u50cf\u539f\u672c\u306f\u4ee5\u4e0b\u306b\u8868\u793a\u3057\u307e\u3059\u3002PDF\u539f\u672c\u306f\u5370\u5237\u3078\u306e\u5b8c\u5168\u57cb\u8fbc\u3092\u884c\u308f\u305a\u3001\u5404\u8a3c\u62e0\u756a\u53f7\u304b\u3089\u5225\u6dfb\u306e\u539f\u672c\u3092\u958b\u3044\u3066\u78ba\u8a8d\u3057\u307e\u3059\u3002</p></section></article>`;
  const evidenceHost = view.querySelector('#submissionEvidence');
  for (const entry of buildEvidenceManifest(records,evidences)) { const section = document.createElement('article'); section.className='submitted-evidence'; const receiptRows = entry.receipts.map((receipt) => `<li>${esc(receipt.purchaseDate)} / ${esc(receipt.vendor)} / ${yen(receipt.receiptTotalAmount)} / \u63d0\u51fa\u5bfe\u8c61 ${yen(receipt.claimTotalAmount)}</li>`).join(''); section.innerHTML = `<h3>${esc(entry.evidence.evidenceNumber)} \u2014 ${esc(entry.evidence.fileName)}</h3><ul>${receiptRows || '<li>\u7d10\u4ed8\u304f\u30ec\u30b7\u30fc\u30c8\u304c\u3042\u308a\u307e\u305b\u3093\u3002</li>'}</ul>`; const file = await current.getFile(entry.evidence.id); if (!file) section.insertAdjacentHTML('beforeend','<p class="difference-warning">\u539f\u672c\u30d5\u30a1\u30a4\u30eb\u304c\u3053\u306e\u7aef\u672b\u306b\u3042\u308a\u307e\u305b\u3093\u3002</p>'); else { const url = URL.createObjectURL(file); if (isPdf(entry.evidence)) section.insertAdjacentHTML('beforeend',`<p>PDF\u539f\u672c\uff08\u5225\u6dfb\uff09: <a href="${url}" target="_blank" rel="noopener">${esc(entry.evidence.fileName)}\u3092\u958b\u304f</a></p>`); else { const image = Object.assign(document.createElement('img'), { src:url, alt:`${entry.evidence.evidenceNumber} ${entry.evidence.fileName}` }); section.append(image); } } evidenceHost.append(section); }
  view.querySelector('[data-print]').onclick = () => window.print(); view.querySelector('[data-close]').onclick = () => view.remove();
}
async function install() { const current = await app(); const header = document.querySelector('.top > div:last-child'); if (!header) return; const submission = document.createElement('button'); submission.type='button'; submission.textContent='\u63d0\u51fa\u7528\u8cc7\u6599\uff0b\u539f\u672c'; submission.className='primary'; submission.onclick=renderSubmission; const csv = document.createElement('button'); csv.type='button'; csv.textContent='\u8cfc\u5165\u54c1CSV'; csv.onclick=() => { const evidenceById = new Map(current.getEvidences().map((evidence) => [evidence.id,evidence])); downloadReceiptCsv(makeReceiptItemsCsv(current.getRecords(),evidenceById),'receipt-items.csv'); downloadReceiptCsv(makeReceiptSummaryCsv(current.getRecords(),evidenceById),'receipt-summary.csv'); }; header.append(csv,submission); }
function receiptNumber(record, evidence) {
  return evidence.evidenceNumber || (record.evidenceIds || []).join(' / ') || '証拠番号未設定';
}

function settlementMarkup(record, evidence) {
  const items = Array.isArray(record.items) ? record.items : [];
  const itemRows = items.map((item) => `<tr><td>${esc(item.productName)}</td><td>${esc(item.category)}</td><td>${yen(item.amount)}</td><td>${esc(item.purpose?.value ?? item.purpose)}</td><td>${esc(item.submissionStatus)}</td></tr>`).join('');
  return `<section class="submission-settlement"><h3>${esc(receiptNumber(record, evidence))} 清算資料</h3><dl><div><dt>購入日</dt><dd>${esc(record.paidDate)}</dd></div><div><dt>購入店</dt><dd>${esc(record.vendor?.value ?? record.vendor)}</dd></div><div><dt>レシート総額</dt><dd>${yen(receiptTotal(record))}</dd></div><div><dt>提出対象額</dt><dd>${yen(receiptClaimTotal(record))}</dd></div></dl><table><thead><tr><th>商品名</th><th>種別</th><th>金額</th><th>購入目的・必要性</th><th>提出状態</th></tr></thead><tbody>${itemRows || '<tr><td colspan="5">購入品明細はありません。</td></tr>'}</tbody></table></section>`;
}

async function renderSubmissionInEvidenceOrder() {
  const current = await app();
  const records = current.getRecords();
  const summary = calculateReceiptSummary(records);
  const view = openView();
  view.innerHTML = `<div class="print-toolbar"><button type="button" class="primary" data-print>この内容を印刷 / PDF保存</button><button type="button" class="secondary" data-close>戻る</button></div><article class="print-sheet"><h1>清算資料＋原本証拠</h1><section><h2>清算概要</h2><p>レシート件数: ${summary.receiptCount}件　レシート総額: ${yen(summary.receiptTotalAmount)}　提出対象額: ${yen(summary.claimTotalAmount)}</p></section><section id="submissionBundles"></section></article>`;
  const host = view.querySelector('#submissionBundles');
  for (const bundle of buildSubmissionBundles(records, current.getEvidences())) {
    const pair = document.createElement('section');
    pair.className = 'receipt-evidence-set';
    pair.dataset.evidenceNumber = bundle.evidence.evidenceNumber;
    pair.innerHTML = bundle.receipts.length ? bundle.receipts.map((record) => settlementMarkup(record, bundle.evidence)).join('') : `<section class="submission-settlement"><h3>${esc(bundle.evidence.evidenceNumber)} 清算資料</h3><p>紐付くレシートはありません。</p></section>`;
    const original = document.createElement('article');
    original.className = 'submitted-evidence';
    original.innerHTML = `<h3>${esc(bundle.evidence.evidenceNumber)} 原本証拠</h3><p>${esc(bundle.evidence.fileName)}</p>`;
    const file = await current.getFile(bundle.evidence.id);
    if (!file) original.insertAdjacentHTML('beforeend', '<p class="difference-warning">原本ファイルがこの端末にありません。</p>');
    else {
      const url = URL.createObjectURL(file);
      if (isPdf(bundle.evidence)) original.insertAdjacentHTML('beforeend', `<p>PDF原本: <a href="${url}" target="_blank" rel="noopener">${esc(bundle.evidence.fileName)}を開く</a></p>`);
      else original.append(Object.assign(document.createElement('img'), { src: url, alt: `${bundle.evidence.evidenceNumber} ${bundle.evidence.fileName}` }));
    }
    pair.append(original);
    host.append(pair);
  }
  view.querySelector('[data-print]').onclick = () => window.print();
  view.querySelector('[data-close]').onclick = () => view.remove();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.textContent !== '提出用資料＋原本') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  renderSubmissionInEvidenceOrder();
}, true);

install();
