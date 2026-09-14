import { calculateSummary } from './calculations.js';
import { formatSubmissionEvidenceNumber } from './submission-evidence-number.js';
import { amountInputModeLabel, taxRateLabel } from './item-tax.js';

const field = (value) => value?.value ?? value ?? '';
const yen = (value) => Number(value || 0).toLocaleString('ja-JP');
const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const internalEvidenceNumbers = (record, evidenceById) => (record.evidenceIds || []).map((id) => evidenceById.get(id)?.evidenceNumber || '').filter(Boolean).join(' / ');
const submissionEvidenceNumbers = (record, evidenceById) => (record.evidenceIds || []).map((id) => formatSubmissionEvidenceNumber(evidenceById.get(id)?.submissionEvidenceNumber)).filter(Boolean).join(' / ');

export function makeCsv(records, evidenceById, childById) {
  const headers = ['内部管理番号','提出用証拠番号','支払日','支払先','対象児童','費目','金額','養育関連区分','特別費区分','支出理由','自分負担率','相手負担率','相手負担額','既払い額','未清算額','状態','備考'];
  const rows = (records || []).map((record) => [internalEvidenceNumbers(record,evidenceById),submissionEvidenceNumbers(record,evidenceById),record.paidDate,field(record.vendor),childById.get(field(record.childId))?.name || '',field(record.category),record.amount?.value ?? record.amount,field(record.parentingExpenseStatus),field(record.specialExpenseStatus),field(record.reason),record.selfBurdenRate,record.otherBurdenRate,record.otherBurdenAmount,record.alreadyPaidAmount,record.outstandingAmount,field(record.settlementStatus),record.notes]);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}
export function downloadCsv(records, evidenceById, childById) { const blob = new Blob([makeCsv(records, evidenceById, childById)], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement('a'), { href: url, download: `子ども関連支出_清算一覧_${new Date().toISOString().slice(0, 10)}.csv` }); a.click(); URL.revokeObjectURL(url); }
export function makePrintHtml(records, evidenceById, childById, periodLabel) {
  const summary = calculateSummary(records || []); const rows = (records || []).map((record) => `<tr><td>${internalEvidenceNumbers(record,evidenceById)}</td><td>${submissionEvidenceNumbers(record,evidenceById)}</td><td>${record.paidDate}</td><td>${childById.get(field(record.childId))?.name || ''}</td><td>${field(record.category)}</td><td>${field(record.vendor)}</td><td class="amount">¥${yen(record.amount?.value ?? record.amount)}</td><td class="amount">¥${yen(record.otherBurdenAmount)}</td><td class="amount">¥${yen(record.alreadyPaidAmount)}</td><td class="amount">¥${yen(record.outstandingAmount)}</td><td>${field(record.reason)}</td><td>${field(record.settlementStatus)}</td></tr>`).join('');
  return `<article class="print-sheet"><h1>子ども関連支出 清算一覧</h1><p>対象期間：${periodLabel}</p><section class="print-summary"><span>支出総額　¥${yen(summary.amount)}</span><span>相手負担想定額　¥${yen(summary.other)}</span><span>既払い額　¥${yen(summary.paid)}</span><span>未清算額　¥${yen(summary.outstanding)}</span></section><table><thead><tr><th>内部管理番号</th><th>提出用証拠番号</th><th>支払日</th><th>対象児童</th><th>費目</th><th>支払先</th><th>金額</th><th>相手負担額</th><th>既払い</th><th>未清算</th><th>支出理由</th><th>状態</th></tr></thead><tbody>${rows || '<tr><td colspan="12">該当する明細がありません。</td></tr>'}</tbody></table></article>`;
}

export function makeReceiptSummaryCsv(records, evidenceById) {
  const headers = ['内部管理番号','提出用証拠番号','購入日','購入店','レシート総額','商品明細合計','提出対象額','差額'];
  const rows = (records || []).map((record) => [internalEvidenceNumbers(record,evidenceById),submissionEvidenceNumbers(record,evidenceById),record.paidDate,field(record.vendor),record.receiptTotalAmount ?? record.amount?.value ?? record.amount ?? 0,(record.items || []).reduce((sum,item) => sum + (Number(item.amount) || 0),0),(record.items || []).filter((item) => item.submissionStatus === 'included').reduce((sum,item) => sum + (Number(item.amount) || 0),0),(record.receiptTotalAmount ?? record.amount?.value ?? record.amount ?? 0) - (record.items || []).reduce((sum,item) => sum + (Number(item.amount) || 0),0)]);
  return '\uFEFF' + [headers,...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}
export function makeReceiptItemsCsv(records, evidenceById) {
  const headers = ['内部管理番号','提出用証拠番号','購入日','店名','商品名','数量','単価','金額','税率','金額入力区分','種別','購入目的・必要性','提出状態','根拠','備考'];
  const rows = (records || []).flatMap((record) => (record.items || []).map((item) => [internalEvidenceNumbers(record,evidenceById),submissionEvidenceNumbers(record,evidenceById),record.paidDate,field(record.vendor),item.productName,item.quantity,item.unitPrice,item.amount,taxRateLabel(item.taxRate),amountInputModeLabel(item.amountInputMode),item.category,field(item.purpose),item.submissionStatus,(item.basis || []).join(' / '),item.notes]));
  return '\uFEFF' + [headers,...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}
export function downloadReceiptCsv(content, filename) { const blob = new Blob([content], { type:'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = Object.assign(document.createElement('a'), { href:url, download:filename }); anchor.click(); URL.revokeObjectURL(url); }
