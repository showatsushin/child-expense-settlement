import { CATEGORY_OPTIONS, PARENTING_OPTIONS, SPECIAL_OPTIONS, SETTLEMENT_OPTIONS, createEvidenceDocument, createExpenseRecord } from './src/models.js';
import { calculateOtherBurdenAmount, calculateOutstandingAmount, calculateSummary, complementRate, nextEvidenceNumber, normalizeRate, toNonNegativeNumber } from './src/calculations.js';
import { storage, saveFile, getFile, deleteFile } from './src/storage.js';
import { renderPreview, validateFile } from './src/file-preview.js';
import { downloadCsv, makePrintHtml } from './src/export.js';

const $ = (selector) => document.querySelector(selector);
const form = $('#expenseForm');
let records = storage.loadRecords();
let evidences = storage.loadEvidences();
let children = storage.loadChildren();
let selectedFile = null, previewUrl = null, editingId = null;
let selections = { parenting: '要確認', special: '要確認' };
let sortDescending = true;

const field = (value) => value?.value ?? value ?? '';
const money = (value) => `¥${toNonNegativeNumber(value).toLocaleString('ja-JP')}`;
const evidenceMap = () => new Map(evidences.map((item) => [item.id, item]));
const childMap = () => new Map(children.map((item) => [item.id, item]));

function options(select, values, placeholder = '') {
  select.replaceChildren(); if (placeholder) select.add(new Option(placeholder, ''));
  values.forEach((value) => select.add(new Option(typeof value === 'string' ? value : value.name, typeof value === 'string' ? value : value.id)));
}
function populateControls() {
  options($('#childSelect'), children, '選択してください'); options($('#categorySelect'), CATEGORY_OPTIONS, '選択してください'); options($('#settlementStatus'), SETTLEMENT_OPTIONS);
  options($('#filterChild'), children, '対象児童：すべて'); options($('#filterCategory'), CATEGORY_OPTIONS, '費目：すべて');
  options($('#filterParenting'), PARENTING_OPTIONS, '養育関連：すべて'); options($('#filterSettlement'), SETTLEMENT_OPTIONS, '状態：すべて');
}
function renderChildMaster() { $('#childName1').value = children[0]?.name || ''; $('#childName2').value = children[1]?.name || ''; }
function setSegment(name, value) { selections[name] = value; $(`#${name}Segment`).querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.value === value)); }
function setFileMeta(file, number = '登録時に採番') { $('#fileName').textContent = file?.name || '未選択'; $('#fileType').textContent = file?.type || '—'; $('#evidenceNumber').textContent = number; }
function setPreview(file) { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = renderPreview($('#preview'), file, file?.name); }

function calculateFields() {
  const amount = toNonNegativeNumber(form.amount.value); const other = normalizeRate(form.otherBurdenRate.value);
  const otherAmount = calculateOtherBurdenAmount(amount, other); const outstanding = calculateOutstandingAmount(otherAmount, form.alreadyPaidAmount.value);
  $('#otherBurdenAmount').value = money(otherAmount); $('#outstandingAmount').value = money(outstanding);
  const rateSum = normalizeRate(form.selfBurdenRate.value) + other;
  $('#rateMessage').textContent = rateSum === 100 ? '合計 100%' : `合計 ${rateSum}%（100%と一致しません）`;
  $('#rateMessage').style.color = rateSum === 100 ? '' : '#9e3131'; return { amount, otherAmount, outstanding };
}
function resetForm() {
  editingId = null; selectedFile = null; form.reset(); form.selfBurdenRate.value = 50; form.otherBurdenRate.value = 50; form.alreadyPaidAmount.value = 0; form.payer.value = '自分';
  setSegment('parenting', '要確認'); setSegment('special', '要確認'); $('#formTitle').textContent = '経費を登録'; $('#cancelEdit').hidden = true; form.querySelector('[type="submit"]').textContent = '登録する'; $('#formMessage').textContent = ''; $('#fileError').textContent = '';
  setFileMeta(null); setPreview(null); calculateFields();
}
function currentFilters() { return { child: $('#filterChild').value, category: $('#filterCategory').value, parenting: $('#filterParenting').value, settlement: $('#filterSettlement').value, preset: $('#periodPreset').value, from: $('#dateFrom').value, to: $('#dateTo').value }; }
function inPeriod(date, filters) {
  if (!date) return filters.preset === 'all'; let from = filters.from, to = filters.to;
  if (filters.preset === 'month') { const now = new Date(); from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`; to = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-31`; }
  return (!from || date >= from) && (!to || date <= to);
}
function filteredRecords() {
  const f = currentFilters(); return records.filter((r) => (!f.child || field(r.childId) === f.child) && (!f.category || field(r.category) === f.category) && (!f.parenting || field(r.parentingExpenseStatus) === f.parenting) && (!f.settlement || field(r.settlementStatus) === f.settlement) && inPeriod(r.paidDate, f)).sort((a,b) => sortDescending ? String(b.paidDate).localeCompare(String(a.paidDate)) : String(a.paidDate).localeCompare(String(b.paidDate)));
}
function renderSummary(items) { const summary = calculateSummary(items); const definitions = [['登録件数', `${summary.count}件`, ''], ['支出総額', money(summary.amount), ''], ['相手負担想定額', money(summary.other), ''], ['既払い額', money(summary.paid), ''], ['未清算額', money(summary.outstanding), ''], ['要確認件数', `${summary.review}件`, 'review']]; $('#summaryCards').innerHTML = definitions.map(([label, value, cls]) => `<div class="summary-card ${cls}"><span>${label}</span><strong>${value}</strong></div>`).join(''); }
function badge(value) { const cls = value === '要確認' || value === '未確認' || value === '争点' ? 'review' : value === '清算済' ? 'done' : ''; return `<span class="badge ${cls}">${escapeHtml(value || '—')}</span>`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char])); }
function renderRecords() {
  const items = filteredRecords(), em = evidenceMap(), cm = childMap(); renderSummary(items);
  $('#recordsBody').innerHTML = items.length ? items.map((r) => `<tr><td>${(r.evidenceIds || []).map((id) => escapeHtml(em.get(id)?.evidenceNumber || '—')).join('<br>')}</td><td>${escapeHtml(r.paidDate)}</td><td>${escapeHtml(cm.get(field(r.childId))?.name || '—')}</td><td>${escapeHtml(field(r.category) || '—')}</td><td>${escapeHtml(field(r.vendor) || '—')}</td><td class="amount">${money(r.amount?.value ?? r.amount)}</td><td class="amount">${money(r.otherBurdenAmount)}</td><td class="amount">${money(r.alreadyPaidAmount)}</td><td class="amount">${money(r.outstandingAmount)}</td><td>${badge(field(r.parentingExpenseStatus))}</td><td>${badge(field(r.settlementStatus))}</td><td><div class="row-actions"><button class="small-button" data-action="detail" data-id="${r.id}">詳細</button><button class="small-button" data-action="edit" data-id="${r.id}">編集</button><button class="small-button danger" data-action="delete" data-id="${r.id}">削除</button></div></td></tr>`).join('') : '<tr><td colspan="12" class="empty-preview">該当する登録済み経費はありません。</td></tr>';
}
function saveState() { storage.saveRecords(records); storage.saveEvidences(evidences); storage.saveChildren(children); }
function recordFromForm(evidenceIds) {
  const numbers = calculateFields(); const data = Object.fromEntries(new FormData(form));
  return createExpenseRecord({ id: editingId || undefined, evidenceIds, paidDate: data.paidDate, amount: numbers.amount, vendor: data.vendor.trim(), childId: data.childId, category: data.category, parentingExpenseStatus: selections.parenting, specialExpenseStatus: selections.special, payer: data.payer.trim(), targetPeriod: data.targetPeriod.trim(), reason: data.reason.trim(), selfBurdenRate: normalizeRate(data.selfBurdenRate), otherBurdenRate: normalizeRate(data.otherBurdenRate), otherBurdenAmount: numbers.otherAmount, alreadyPaidAmount: toNonNegativeNumber(data.alreadyPaidAmount), outstandingAmount: numbers.outstanding, settlementStatus: data.settlementStatus, notes: data.notes.trim(), createdAt: records.find((r) => r.id === editingId)?.createdAt });
}
async function handleSubmit(event) {
  event.preventDefault(); $('#formMessage').textContent = ''; const required = [form.paidDate.value, form.amount.value];
  if (required.some((value) => !value) || toNonNegativeNumber(form.amount.value) <= 0) { $('#formMessage').textContent = '支払日と0円より大きい金額を入力してください。'; $('#formMessage').style.color = '#9e3131'; return; }
  let evidenceIds = editingId ? (records.find((r) => r.id === editingId)?.evidenceIds || []) : [];
  if (selectedFile) {
    const error = validateFile(selectedFile); if (error) { $('#fileError').textContent = error; return; }
    const evidence = createEvidenceDocument({ evidenceNumber: nextEvidenceNumber(evidences), fileName: selectedFile.name, mimeType: selectedFile.type, size: selectedFile.size });
    try { await saveFile(evidence.id, selectedFile); evidences.push(evidence); evidenceIds = [...evidenceIds, evidence.id]; } catch { $('#formMessage').textContent = '原本ファイルをブラウザ内へ保存できませんでした。容量を確認してください。'; $('#formMessage').style.color = '#9e3131'; return; }
  }
  const record = recordFromForm(evidenceIds); const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) records[index] = { ...record, createdAt: records[index].createdAt }; else records.push(record); saveState(); renderRecords();
  $('#formMessage').style.color = '#1e6244'; $('#formMessage').textContent = index >= 0 ? '経費を更新しました。' : '経費を登録しました。'; setTimeout(resetForm, 700);
}
async function beginEdit(id) {
  const r = records.find((item) => item.id === id); if (!r) return; editingId = id; form.paidDate.value = r.paidDate; form.amount.value = r.amount?.value ?? r.amount; form.vendor.value = field(r.vendor); form.childId.value = field(r.childId); form.category.value = field(r.category); form.payer.value = field(r.payer); form.targetPeriod.value = r.targetPeriod; form.reason.value = field(r.reason); form.selfBurdenRate.value = r.selfBurdenRate; form.otherBurdenRate.value = r.otherBurdenRate; form.alreadyPaidAmount.value = r.alreadyPaidAmount; form.settlementStatus.value = field(r.settlementStatus); form.notes.value = r.notes;
  setSegment('parenting', field(r.parentingExpenseStatus)); setSegment('special', field(r.specialExpenseStatus)); selectedFile = null; const firstEvidence = evidenceMap().get(r.evidenceIds?.[0]); setFileMeta(firstEvidence, firstEvidence?.evidenceNumber || '登録時に採番');
  if (firstEvidence) { try { const file = await getFile(firstEvidence.id); setPreview(file); } catch { setPreview(null); } } else setPreview(null);
  $('#formTitle').textContent = '経費を編集'; $('#cancelEdit').hidden = false; form.querySelector('[type="submit"]').textContent = '更新する'; calculateFields(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showDetails(id) { const r = records.find((item) => item.id === id); if (!r) return; const em = evidenceMap(), cm = childMap(); const fields = [['証拠番号', (r.evidenceIds || []).map((e) => em.get(e)?.evidenceNumber || '—').join(' / ')], ['支払日', r.paidDate], ['金額', money(r.amount?.value ?? r.amount)], ['支払先', field(r.vendor)], ['対象児童', cm.get(field(r.childId))?.name || '—'], ['費目', field(r.category)], ['養育関連区分', field(r.parentingExpenseStatus)], ['特別費区分', field(r.specialExpenseStatus)], ['支払者', field(r.payer)], ['対象期間', r.targetPeriod], ['支出理由', field(r.reason)], ['負担率', `自分 ${r.selfBurdenRate}% / 相手 ${r.otherBurdenRate}%`], ['相手負担想定額', money(r.otherBurdenAmount)], ['既払い額', money(r.alreadyPaidAmount)], ['未清算額', money(r.outstandingAmount)], ['状態', field(r.settlementStatus)], ['備考', r.notes]]; $('#detailContent').innerHTML = `<h2>経費の詳細</h2><dl class="detail-list">${fields.map(([k,v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || '—')}</dd>`).join('')}</dl>`; $('#detailDialog').showModal(); }
async function removeRecord(id) { const r = records.find((item) => item.id === id); if (!r || !confirm('この経費を削除します。元に戻せません。よろしいですか？')) return; records = records.filter((item) => item.id !== id); const used = new Set(records.flatMap((item) => item.evidenceIds || [])); const orphanIds = (r.evidenceIds || []).filter((e) => !used.has(e)); evidences = evidences.filter((item) => !orphanIds.includes(item.id)); await Promise.all(orphanIds.map((e) => deleteFile(e).catch(() => {}))); saveState(); renderRecords(); if (editingId === id) resetForm(); }
function updatePreset() { const custom = $('#periodPreset').value === 'custom'; document.querySelectorAll('.custom-date').forEach((element) => element.hidden = !custom); if ($('#periodPreset').value === 'month') { const now = new Date(); $('#dateFrom').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`; $('#dateTo').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()}`; } renderRecords(); }
function periodLabel() { const f = currentFilters(); return f.preset === 'all' ? '全期間' : `${f.from || '開始日指定なし'} ～ ${f.to || '終了日指定なし'}`; }
function attachFile(file) { const error = validateFile(file); $('#fileError').textContent = error; if (error) return; selectedFile = file; setFileMeta(file, editingId ? '更新時に採番' : nextEvidenceNumber(evidences)); setPreview(file); }

populateControls(); document.querySelectorAll('.segment').forEach((container) => container.addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; setSegment(container.id.replace('Segment',''), button.dataset.value); }));
$('#saveChildren').addEventListener('click', () => { children = children.map((child, index) => ({ ...child, name: String($(`#childName${index + 1}`).value || `子${index + 1}`).trim() })); storage.saveChildren(children); const selected = form.childId.value; const filters = { child: $('#filterChild').value, category: $('#filterCategory').value, parenting: $('#filterParenting').value, settlement: $('#filterSettlement').value }; populateControls(); form.childId.value = selected; $('#filterChild').value = filters.child; $('#filterCategory').value = filters.category; $('#filterParenting').value = filters.parenting; $('#filterSettlement').value = filters.settlement; renderRecords(); });
form.addEventListener('input', (event) => { if (event.target.name === 'selfBurdenRate') form.otherBurdenRate.value = complementRate(event.target.value); if (event.target.name === 'otherBurdenRate') form.selfBurdenRate.value = complementRate(event.target.value); calculateFields(); }); form.addEventListener('submit', handleSubmit); $('#newRecord').addEventListener('click', resetForm); $('#cancelEdit').addEventListener('click', resetForm);
$('#evidenceFile').addEventListener('change', (event) => attachFile(event.target.files[0])); const drop = $('#dropZone'); ['dragenter','dragover'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('dragover'); })); ['dragleave','drop'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.remove('dragover'); })); drop.addEventListener('drop', (event) => attachFile(event.dataTransfer.files[0]));
$('#recordsBody').addEventListener('click', (event) => { const button = event.target.closest('[data-action]'); if (!button) return; if (button.dataset.action === 'detail') showDetails(button.dataset.id); if (button.dataset.action === 'edit') beginEdit(button.dataset.id); if (button.dataset.action === 'delete') removeRecord(button.dataset.id); }); document.querySelectorAll('.filters select, #dateFrom, #dateTo').forEach((el) => el.addEventListener('change', renderRecords)); $('#periodPreset').addEventListener('change', updatePreset); document.querySelector('.sort').addEventListener('click', () => { sortDescending = !sortDescending; renderRecords(); });
$('#exportCsv').addEventListener('click', () => downloadCsv(filteredRecords(), evidenceMap(), childMap())); $('#showPrint').addEventListener('click', () => { $('#printContent').innerHTML = makePrintHtml(filteredRecords(), evidenceMap(), childMap(), periodLabel()); $('#printView').hidden = false; }); $('#closePrint').addEventListener('click', () => { $('#printView').hidden = true; }); $('#executePrint').addEventListener('click', () => window.print());
renderChildMaster(); updatePreset(); resetForm(); renderRecords();
