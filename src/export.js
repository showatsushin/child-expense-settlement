import { calculateSummary } from './calculations.js';

const field = (value) => value?.value ?? value ?? '';
const yen = (value) => Number(value || 0).toLocaleString('ja-JP');
const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
export function makeCsv(records, evidenceById, childById) {
  const headers = ['証拠番号', '支払日', '支払先', '対象児童', '費目', '金額', '養育関連区分', '特別費区分', '支出理由', '自分負担率', '相手負担率', '相手負担額', '既払い額', '未清算額', '状態', '備考'];
  const rows = records.map((record) => [
    (record.evidenceIds || []).map((id) => evidenceById.get(id)?.evidenceNumber || '').join(' / '), record.paidDate, field(record.vendor), childById.get(field(record.childId))?.name || '', field(record.category), record.amount?.value ?? record.amount, field(record.parentingExpenseStatus), field(record.specialExpenseStatus), field(record.reason), record.selfBurdenRate, record.otherBurdenRate, record.otherBurdenAmount, record.alreadyPaidAmount, record.outstandingAmount, field(record.settlementStatus), record.notes,
  ]);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}
export function downloadCsv(records, evidenceById, childById) { const blob = new Blob([makeCsv(records, evidenceById, childById)], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement('a'), { href: url, download: `子ども関連支出_清算一覧_${new Date().toISOString().slice(0, 10)}.csv` }); a.click(); URL.revokeObjectURL(url); }
export function makePrintHtml(records, evidenceById, childById, periodLabel) {
  const summary = calculateSummary(records); const rows = records.map((r) => `<tr><td>${(r.evidenceIds || []).map((id) => evidenceById.get(id)?.evidenceNumber || '').join('<br>')}</td><td>${r.paidDate}</td><td>${childById.get(field(r.childId))?.name || ''}</td><td>${field(r.category)}</td><td>${field(r.vendor)}</td><td class="amount">¥${yen(r.amount?.value ?? r.amount)}</td><td class="amount">¥${yen(r.otherBurdenAmount)}</td><td class="amount">¥${yen(r.alreadyPaidAmount)}</td><td class="amount">¥${yen(r.outstandingAmount)}</td><td>${field(r.reason)}</td><td>${field(r.settlementStatus)}</td></tr>`).join('');
  return `<article class="print-sheet"><h1>子ども関連支出 清算一覧</h1><p>対象期間：${periodLabel}</p><section class="print-summary"><span>支出総額　¥${yen(summary.amount)}</span><span>相手負担想定額　¥${yen(summary.other)}</span><span>既払い額　¥${yen(summary.paid)}</span><span>未清算額　¥${yen(summary.outstanding)}</span></section><table><thead><tr><th>証拠番号</th><th>支払日</th><th>対象児童</th><th>費目</th><th>支払先</th><th>金額</th><th>相手負担</th><th>既払い</th><th>未清算</th><th>支出理由</th><th>状態</th></tr></thead><tbody>${rows || '<tr><td colspan="11">該当する明細がありません。</td></tr>'}</tbody></table></article>`;
}

