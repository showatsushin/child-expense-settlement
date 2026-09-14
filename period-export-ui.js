import { buildWorkbookData } from './src/output-models.js';
import { applySubmissionNumbering, formatSubmissionEvidenceNumber } from './src/submission-evidence-number.js';
import { filterRecordsByPeriod, validatePeriod } from './src/period-expense-list.js';
import { buildAppendOnlySubmissionNumberingPreview, periodFileSuffix, selectedEvidencesForRecords, unnumberedEvidencesForRecords } from './src/period-exports.js';

async function app() { while (!window.receiptApp) await new Promise((resolve) => setTimeout(resolve, 20)); return window.receiptApp; }
const element = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
const rangeInput = () => ({ startDate:element('#periodExpenseStart')?.value || '', endDate:element('#periodExpenseEnd')?.value || '' });

function selectedPeriod(current) {
  const range = rangeInput(); const validation = validatePeriod(range);
  if (!validation.valid) return { validation, ...range, selectedRecords:[], excludedUnknownDateRecords:[] };
  return { validation, ...range, ...filterRecordsByPeriod(current.getRecords(), range) };
}

function createWorkbook(records, evidences, children, fileName) {
  if (!globalThis.XLSX) throw new Error('Excel出力ライブラリを読み込めませんでした。');
  const data = buildWorkbookData(records, evidences, children); const book = XLSX.utils.book_new();
  [['清算一覧',data.settlement],['購入品明細',data.receiptItems],['種別集計',data.category],['証拠一覧',data.evidence],['集計',data.summary]].forEach(([name, rows]) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name));
  XLSX.writeFile(book, fileName);
}

async function install() {
  const current = await app(); const section = element('#periodExpenseSection');
  if (!section || element('#periodScopedActions')) return;
  const controls = document.createElement('div');
  controls.id = 'periodScopedActions'; controls.style.cssText = 'padding:0 14px 14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center';
  controls.innerHTML = '<strong id="periodExportCounts"></strong><button type="button" id="periodExcelOutput">この期間のExcel</button><button type="button" id="periodSubmissionOutput" class="primary">この期間の提出用資料＋原本</button><button type="button" id="periodNumberingReview" hidden>未採番の提出用証拠番号を確認</button><p id="periodExportMessage" class="hint" style="width:100%;margin:0"></p><div id="periodNumberingPreview" hidden style="width:100%;border:1px solid #d2dde1;padding:10px"></div>';
  section.querySelector('#periodExpenseTotals').after(controls);
  const counts = element('#periodExportCounts'); const message = element('#periodExportMessage'); const review = element('#periodNumberingReview'); const previewHost = element('#periodNumberingPreview'); let preview = [];

  function refresh() {
    const period = selectedPeriod(current);
    if (!period.validation.valid) { counts.textContent = ''; review.hidden = true; message.textContent = period.validation.message; return period; }
    const unnumbered = unnumberedEvidencesForRecords(period.selectedRecords, current.getEvidences());
    counts.textContent = `対象：${period.selectedRecords.length}件　未採番：${unnumbered.length}件${period.excludedUnknownDateRecords.length ? `　購入日不明で除外：${period.excludedUnknownDateRecords.length}件` : ''}`;
    review.hidden = unnumbered.length === 0; message.textContent = unnumbered.length ? '提出用資料＋原本の出力前に、未採番の証拠番号を確認してください。' : '';
    return { ...period, unnumbered };
  }
  function showPreview() {
    const period = refresh(); if (!period.validation.valid) return;
    preview = buildAppendOnlySubmissionNumberingPreview(period.selectedRecords, current.getEvidences());
    if (!preview.length) { previewHost.hidden = true; return; }
    previewHost.innerHTML = `<strong>未採番の提出用証拠番号（既存番号は変更しません）</strong><ol>${preview.map((entry) => `<li>${escapeHtml(entry.evidenceNumber)} (${escapeHtml(entry.purchaseDate)}) → ${escapeHtml(formatSubmissionEvidenceNumber(entry.next))}</li>`).join('')}</ol><button type="button" id="confirmPeriodNumbering" class="primary">この内容で確定</button> <button type="button" id="cancelPeriodNumbering">キャンセル</button>`;
    previewHost.hidden = false;
  }
  async function exportSubmission() {
    const period = refresh(); if (!period.validation.valid) return;
    if (period.unnumbered.length) { showPreview(); message.textContent = `この期間に未採番の証拠が${period.unnumbered.length}件あります。提出用資料を作成する前に採番してください。`; return; }
    try { await current.renderSubmissionExport(period.selectedRecords, { requireOriginals:true, periodLabel:`${period.startDate} 〜 ${period.endDate}` }); }
    catch (error) { message.textContent = `提出用資料を出力できません: ${error.message}`; }
  }
  section.addEventListener('input', (event) => { if (event.target.matches('#periodExpenseStart,#periodExpenseEnd')) { previewHost.hidden = true; preview = []; refresh(); } });
  window.addEventListener('click', (event) => { if (!event.target.closest('#periodExpenseOutput')) return; const period = refresh(); if (!period.validation.valid) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  element('#periodExcelOutput').addEventListener('click', () => { const period = refresh(); if (!period.validation.valid) return; try { createWorkbook(period.selectedRecords, selectedEvidencesForRecords(period.selectedRecords, current.getEvidences()), current.getChildren(), `child-expense-${periodFileSuffix(period)}.xlsx`); } catch (error) { message.textContent = error.message; } });
  element('#periodSubmissionOutput').addEventListener('click', exportSubmission); review.addEventListener('click', showPreview);
  previewHost.addEventListener('click', (event) => {
    if (event.target.closest('#cancelPeriodNumbering')) { previewHost.hidden = true; preview = []; return; }
    if (!event.target.closest('#confirmPeriodNumbering') || !preview.length) return;
    try { applySubmissionNumbering(current.getEvidences(), preview); current.setSubmissionEvidenceNumbers(preview.map((entry) => ({ evidenceId:entry.evidenceId, submissionEvidenceNumber:entry.next }))); previewHost.hidden = true; preview = []; refresh(); message.textContent = '未採番の提出用証拠番号を保存しました。既存の番号は変更していません。'; } catch (error) { message.textContent = `採番を保存できません: ${error.message}`; }
  });
  refresh();
}

install();
