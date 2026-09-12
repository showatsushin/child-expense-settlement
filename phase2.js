import { createExpenseRecord, CATEGORY_OPTIONS, SETTLEMENT_OPTIONS } from './src/models.js';
import { createUserStorage } from './src/user-storage.js';
import { requireAuthenticatedUser, logout } from './src/auth-gate.js';
import { calculateOtherBurdenAmount, calculateOutstandingAmount, calculateSummary, nextEvidenceNumber, toNonNegativeNumber } from './src/calculations.js';
import { validateFile, renderPreview } from './src/file-preview.js';
import { readReceipt } from './src/services/receiptReaderProvider.js';
import { extractPdfText } from './src/services/documentRecognition.js';
import { extractSuggestions, extractMerchantCandidates } from './src/ocr-extract.js';
import { findPotentialDuplicates } from './src/duplicates.js';
import { buildWorkbookData, buildWordDocumentModel } from './src/output-models.js';
import { attachDraftEvidence, deleteReceiptAndExclusiveEvidence, discardUnattachedEvidence, saveUnorganizedEvidence } from './src/evidence-lifecycle.js';
import { normalizeKnowledgeHistory, rememberConfirmation, historySuggestions } from './src/user-knowledge-history.js';

const $ = (selector) => document.querySelector(selector);
const f = (value) => value?.value ?? value ?? '';
const yen = (value) => `¥${Number(value || 0).toLocaleString('ja-JP')}`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const currentUser = await requireAuthenticatedUser();
const storage = createUserStorage(currentUser.id);
const { saveFile, getFile, deleteFile } = storage;
let state = storage.loadMigratedState();
let records = state.records, evidences = state.evidences, children = state.children;
let history = normalizeKnowledgeHistory(storage.loadKnowledgeHistory());
let activeEvidenceId = null, activeFile = null, activeOcr = null, editingRecordId = null, previewUrl = null;
let sources = {}, merchantCandidates = [], readerHeaders = {};
window.receiptApp = { getRecords: () => records, getEvidences: () => evidences, getChildren: () => children, getKnowledgeHistory: () => history, getFile, storage };
const evidenceMap = () => new Map(evidences.map((evidence) => [evidence.id, evidence]));
const activeEvidence = () => evidenceMap().get(activeEvidenceId) || null;

document.body.innerHTML = `<style>
:root{font-family:"Yu Gothic UI",system-ui,sans-serif;color:#18232d;background:#f2f5f6}body{margin:0}.top{padding:18px 3%;background:#fff;border-bottom:1px solid #ccd7dc;display:flex;justify-content:space-between;gap:12px;align-items:center}.top h1{font-size:21px;margin:0}.top p{margin:4px 0 0;color:#5a6870;font-size:13px}button{cursor:pointer;padding:8px 11px;border:1px solid #94a8b2;border-radius:7px;background:#fff;font:inherit}.primary{background:#17455d;border-color:#17455d;color:#fff}.warn{color:#9d302c}.page{max-width:1450px;margin:auto;padding:18px}.summary{display:grid;grid-template-columns:repeat(6,1fr);border:1px solid #cdd8dd;background:#fff}.summary div{padding:10px 13px;border-right:1px solid #dce4e7}.summary small{display:block;color:#60717a}.summary strong{font-size:18px}.capture,.grid,.table{margin-top:18px;background:#fff;border:1px solid #cdd8dd;padding:18px}.capture h2,.panel h2,.table h2{font-size:18px;margin:0 0 10px}.capture-actions{display:flex;gap:10px;flex-wrap:wrap}.capture-actions label{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 18px;border-radius:8px;background:#17455d;color:#fff;font-weight:700;cursor:pointer}.capture-actions input{position:absolute;width:1px;height:1px;opacity:0}.capture-message{margin:10px 0 0;color:#17603e;font-weight:700}.grid{display:grid;grid-template-columns:.8fr 1.2fr;padding:0}.panel{padding:18px}.panel:first-child{border-right:1px solid #cdd8dd}.drop{display:block;padding:18px;border:1px dashed #7b98a6;text-align:center;background:#f7fafb}.drop input{display:none}.preview{height:310px;background:#edf1f2;margin-top:10px;display:flex;align-items:center;justify-content:center}.preview img,.preview iframe{width:100%;height:100%;object-fit:contain;border:0}.meta,.hint{font-size:12px;color:#5a6870}.ocrbox{margin-top:12px;border-top:1px solid #d9e1e5;padding-top:10px}.progress{font-size:12px;color:#17455d}.fields{display:grid;grid-template-columns:repeat(2,1fr);gap:10px 14px}.fields label{font-weight:700;font-size:13px}.full{grid-column:1/-1}textarea,input,select{box-sizing:border-box;width:100%;padding:8px;border:1px solid #aebdc4;border-radius:5px;font:inherit}textarea{resize:vertical}.candidate-box{background:#edf5f7;border-left:4px solid #3d768d;padding:10px;margin-bottom:12px}.candidate{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #d1e0e5}.candidate:last-child{border:0}.message{min-height:20px;color:#17603e;font-weight:700}.status-actions{display:flex;gap:8px;flex-wrap:wrap}.tablehead{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}.tablewrap{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}th,td{padding:8px;border-bottom:1px solid #dbe3e6;text-align:left;font-size:13px}th{background:#f5f8f9}.right{text-align:right}.evidence-list{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.ecard{border:1px solid #d2dde1;padding:12px;border-radius:8px}.badge{font-size:12px;background:#e4f0f3;border-radius:10px;padding:2px 6px}.filter-buttons{display:flex;gap:6px;flex-wrap:wrap}.filter-buttons button.active{background:#17455d;color:#fff}.print{position:fixed;inset:0;background:#fff;overflow:auto;padding:28px;z-index:5}.hide{display:none}@media(max-width:900px){.grid{grid-template-columns:1fr}.panel:first-child{border-right:0;border-bottom:1px solid #cdd8dd}.summary{grid-template-columns:repeat(3,1fr)}.evidence-list{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.page{padding:12px}.summary{grid-template-columns:repeat(2,1fr)}.summary div:last-child{grid-column:span 2}.capture,.grid,.table{margin-top:12px}.capture-actions{position:sticky;bottom:8px;background:#fff;padding:8px}.capture-actions label,.capture-actions button{flex:1;min-height:50px}.fields{grid-template-columns:1fr}.full{grid-column:auto}.evidence-list{grid-template-columns:1fr}.tablewrap table,.tablewrap tbody,.tablewrap tr,.tablewrap td{display:block;width:100%;white-space:normal}.tablewrap thead{display:none}.tablewrap tr{margin:8px 0;border:1px solid #e3eaec;border-radius:10px;padding:5px 12px}.tablewrap td{display:flex;justify-content:space-between;gap:14px}.tablewrap td:last-child{justify-content:flex-start;flex-wrap:wrap}.tablewrap td:before{font-weight:700;color:#687a82}.tablewrap td:nth-child(1):before{content:'証拠'}.tablewrap td:nth-child(2):before{content:'日付'}.tablewrap td:nth-child(3):before{content:'店名'}.tablewrap td:nth-child(4):before{content:'金額'}.tablewrap td:nth-child(5):before{content:'状態'}.tablewrap td:nth-child(6):before{content:'操作'}}
</style>
<style>
.page{display:flex;flex-direction:column}.summary{order:1}.capture{order:2}.grid{order:3}.grid + .table{order:5}#unorganizedSection{order:4}.current-evidence{margin-bottom:14px;padding:14px;border:1px solid #9dbbc7;border-radius:10px;background:#eef7f9}.current-evidence.empty{border-style:dashed;background:#f7fafb;color:#5a6870}.current-evidence-head{display:flex;justify-content:space-between;gap:10px;align-items:start}.current-evidence h3{margin:2px 0 0;font-size:17px}.current-evidence p{margin:4px 0}.current-evidence-state{font-weight:700;color:#17455d}.current-evidence-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.current-evidence-actions button{min-height:42px}.reader-state{display:inline-block;padding:3px 8px;border-radius:99px;background:#dceef3;color:#17455d;font-size:12px;font-weight:700}.reader-state.review{background:#fff0cc;color:#805700}.reader-state.failed{background:#fde8e8;color:#9d302c}@media(max-width:640px){.current-evidence-actions button{width:100%;min-height:48px}.current-evidence-head{display:block}.current-evidence-head .reader-state{margin-top:8px}}
</style>
<header class="top"><div><h1>子ども関連支出 清算整理</h1><p>証拠を先に保存し、時間があるときに整理します。</p></div><div><span id="user" class="hint"></span> <button id="logout">ログアウト</button> <button id="xlsx">Excel出力</button> <button id="docx">Word出力</button> <button id="print" class="primary">印刷用表示</button></div></header>
<main class="page"><section id="summary" class="summary"></section>
<section class="capture"><h2>撮影・保存</h2><p>使い方を選んでください。「未整理に保存」は原本だけを残して終了し、「今すぐ読み取る」は同じ原本を保存してからReaderを実行します。</p><div class="capture-actions"><label>未整理に保存<input id="saveCamera" type="file" accept="image/*" capture="environment"></label><label>今すぐ読み取る<input id="readCamera" type="file" accept="image/*" capture="environment"></label><label>ファイルを未整理に保存<input id="quickFile" type="file" accept="image/*,.pdf"></label><label>ファイルを今すぐ読み取る<input id="readFile" type="file" accept="image/*,.pdf"></label><button id="showUnorganized" type="button">未整理BOXを見る</button></div><p id="captureMessage" class="capture-message"></p></section>
<section class="table" id="unorganizedSection"><div class="tablehead"><div><h2>未整理</h2><p class="hint">写真だけ保存した原本を、あとから1件ずつ整理できます。</p></div><div><div id="evidenceFilters" class="filter-buttons"></div><select id="evidenceOrder"><option value="new">新しい順</option><option value="old">古い順</option></select></div></div><div id="unorganizedList" class="evidence-list"></div></section>
<section class="grid"><section class="panel"><h2>原本と読み取り</h2><label class="drop">原本を選択 / ドロップ（JPG・JPEG・PNG・PDF、20MBまで）<input id="file" type="file" accept="image/*,.pdf"></label><p id="filemsg" class="meta"></p><div id="preview" class="preview">未整理から原本を開くか、上の撮影ボタンで保存してください。</div><p id="filemeta" class="meta">証拠番号：未選択</p><div class="ocrbox"><button id="ocr" type="button" disabled>文字を読み取る</button><span id="progress" class="progress"></span><h3>OCR結果（原文）</h3><textarea id="raw" rows="6" readonly></textarea><h3>修正用テキスト（任意）</h3><textarea id="corrected" rows="3" placeholder="OCR原文は保持されます。必要時だけ訂正用テキストを入力します。"></textarea></div></section>
<section class="panel"><h2 id="formtitle">後から整理</h2><div id="candidates" class="candidate-box hide"></div><form id="form"><div class="fields"><label>支払日<input name="paidDate" type="date"></label><label>レシート総額<input name="amount" type="number" min="0"></label><label class="full">購入店<input name="vendor" placeholder="候補から選んだ後も自由に編集できます"></label><label>対象児童<select name="childId" id="child"></select></label><label>会計費目<select name="category" id="category"></select></label><label>支払者<input name="payer" value="自分"></label><label>養育関連区分<select name="parenting"><option>要確認</option><option>対象</option><option>対象外</option></select></label><label>特別費区分<select name="special"><option>要確認</option><option>該当</option><option>非該当</option></select></label><label>自分負担率<input name="selfRate" type="number" value="50" min="0" max="100"></label><label>相手負担率<input name="otherRate" type="number" value="50" min="0" max="100"></label><label>既払い額<input name="already" type="number" value="0" min="0"></label><label>清算状態<select name="settlement" id="settlement"></select></label><label>相手負担想定額<output id="other">¥0</output></label><label>未清算額<output id="outstanding">¥0</output></label><label class="full">対象期間<input name="period"></label><label class="full">旧支出理由（既存台帳互換）<textarea name="reason" rows="2"></textarea></label><label class="full">備考<textarea name="notes" rows="2"></textarea></label></div><p id="duplicate" class="hint"></p><p id="msg" class="message"></p><div class="status-actions"><button id="saveProgress" type="button">途中保存</button><button class="primary" type="submit">登録して未整理から外す</button><button id="reset" type="button">閉じる</button></div></form></section></section>
<section class="table"><div class="tablehead"><h2>登録済み明細</h2><select id="filter"><option value="">すべての費目</option></select></div><div class="tablewrap"><table><thead><tr><th>証拠</th><th>日付</th><th>店名</th><th>金額</th><th>状態</th><th>操作</th></tr></thead><tbody id="rows"></tbody></table></div></section></main><section id="printview" class="print hide"><button id="closeprint">戻る</button> <button onclick="window.print()" class="primary">印刷 / PDF保存</button><div id="printcontent"></div></section>`;

function installWorkspaceMarkup() {
  const evidencePanel = $('#preview')?.closest('.panel');
  if (!evidencePanel || $('#currentEvidence')) return;
  evidencePanel.id = 'currentEvidenceWorkspace';
  evidencePanel.querySelector('h2').textContent = '現在作業中の原本';
  const card = document.createElement('section');
  card.id = 'currentEvidence';
  card.className = 'current-evidence empty';
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<div id="currentEvidenceInfo"></div><div id="currentEvidenceActions" class="current-evidence-actions"></div>';
  evidencePanel.querySelector('.drop').before(card);
  const readButton = $('#ocr');
  readButton.textContent = '今すぐ読み取る';
  const deferButton = document.createElement('button');
  deferButton.id = 'deferCurrent'; deferButton.type = 'button'; deferButton.textContent = 'あとで整理';
  const continueButton = document.createElement('button');
  continueButton.id = 'continueCurrent'; continueButton.type = 'button'; continueButton.textContent = '続けて撮影';
  $('#currentEvidenceActions').append(readButton, deferButton, continueButton);
}

installWorkspaceMarkup();

let screenMode = 'capture';
let pendingCaptureFile = null;
let pendingCapturePreviewUrl = null;

function installTwoModeLayout() {
  const capture = $('.capture');
  const actions = capture.querySelector('.capture-actions');
  for (const element of Array.from(actions.children)) element.hidden = true;
  const chooser = document.createElement('div');
  chooser.id = 'captureChooser'; chooser.className = 'capture-mode-actions';
  chooser.innerHTML = '<label class="primary-choice">カメラで撮影<input id="captureCamera" type="file" accept="image/*" capture="environment"></label><label class="primary-choice">写真・PDFを選ぶ<input id="captureFile" type="file" accept="image/*,.pdf"></label>';
  actions.append(chooser);
  const stage = document.createElement('section');
  stage.id = 'captureStage'; stage.className = 'capture-stage';
  stage.innerHTML = '<section id="captureSelected" hidden><h3>選択した原本</h3><div id="capturePreview" class="preview"></div><p id="captureSelectionMeta" class="meta"></p><div class="capture-mode-actions"><button id="savePending" type="button" class="primary">未整理に保存</button><button id="readPending" type="button">今すぐ読み取る</button></div></section><section id="captureSaved" hidden><p><b>未整理に保存しました</b></p><p id="captureSavedMeta" class="meta"></p><div class="capture-mode-actions"><button id="captureAgain" type="button" class="primary">続けて撮影</button><button id="openUnorganized" type="button">未整理BOXを見る</button><button id="organizeSaved" type="button">今すぐ整理</button></div></section>';
  capture.append(stage);
  const workspace = $('.grid'); workspace.id = 'organizeWorkspace';
  const back = document.createElement('button');
  back.id = 'backToCapture'; back.type = 'button'; back.className = 'back-to-capture'; back.textContent = '撮影・保存へ戻る';
  workspace.before(back);
  const organizeForm = $('#form').closest('.panel');
  organizeForm.id = 'organizeFormWorkspace';
  const readerPending = document.createElement('p');
  readerPending.id = 'readerPending'; readerPending.className = 'reader-pending';
  readerPending.textContent = '原本を確認し、「文字を読み取る」を押すと基本情報と商品明細を表示します。';
  organizeForm.before(readerPending);
  document.head.insertAdjacentHTML('beforeend', '<style id="two-mode-style">.capture-mode-actions{display:flex;gap:10px;flex-wrap:wrap}.primary-choice{display:flex;align-items:center;justify-content:center;min-height:58px;padding:0 22px;border-radius:10px;background:#17455d;color:#fff;font-weight:700;cursor:pointer}.primary-choice input{position:absolute;width:1px;height:1px;opacity:0}.capture-stage{margin-top:16px}.capture-stage h3{margin:0 0 8px}.back-to-capture{margin-top:18px}.capture-mode #organizeWorkspace{display:block;max-width:900px;margin-left:auto;margin-right:auto}.capture-mode #organizeFormWorkspace,.capture-mode #currentEvidenceWorkspace>h2,.capture-mode #currentEvidenceWorkspace>.drop,.capture-mode #currentEvidenceWorkspace>#filemsg,.capture-mode #currentEvidenceWorkspace>.ocrbox,.capture-mode #backToCapture{display:none}.capture-mode #unorganizedSection{display:block}.organize-mode .capture,.organize-mode #unorganizedSection,.organize-mode .summary,.organize-mode .grid + .table{display:none}.organize-mode #organizeWorkspace{display:block;max-width:900px;margin-left:auto;margin-right:auto}.organize-mode #organizeWorkspace .panel{border:0}.organize-mode #organizeWorkspace .panel:first-child{border-bottom:1px solid #cdd8dd}.organize-mode.reader-pending #organizeFormWorkspace{display:none}.organize-mode.reader-pending #readerPending{display:block}.organize-mode:not(.reader-pending) #readerPending{display:none}.organize-mode.reader-pending .ocrbox h3,.organize-mode.reader-pending .ocrbox textarea{display:none}@media(max-width:640px){.primary-choice{width:100%;min-height:58px}.capture-mode-actions button{width:100%;min-height:48px}}</style>');
  document.head.insertAdjacentHTML('beforeend', '<style>.organize-mode #deferCurrent,.organize-mode #continueCurrent{display:none}.capture-mode #xlsx,.capture-mode #docx,.capture-mode #print{display:none}</style>');
}

function readerHasResult() { return activeEvidence()?.ocr?.status === 'completed'; }
function renderMode() {
  document.body.classList.toggle('capture-mode', screenMode === 'capture');
  document.body.classList.toggle('organize-mode', screenMode === 'organize');
  document.body.classList.toggle('reader-pending', screenMode === 'organize' && !readerHasResult());
  $('#captureChooser').hidden = screenMode !== 'capture' || Boolean(pendingCaptureFile) || Boolean(activeEvidence());
  $('#captureSelected').hidden = screenMode !== 'capture' || !pendingCaptureFile;
  $('#captureSaved').hidden = screenMode !== 'capture' || Boolean(pendingCaptureFile) || !activeEvidence();
  $('#currentEvidenceWorkspace').hidden = screenMode === 'capture' && !activeEvidence();
  const readButton = $('#ocr');
  if (readButton) {
    readButton.hidden = screenMode !== 'organize' || readerHasResult();
    readButton.textContent = activeEvidence()?.ocr?.status === 'failed' ? 'もう一度読み取る' : '文字を読み取る';
  }
}

function clearPendingCapture() {
  pendingCaptureFile = null;
  if (pendingCapturePreviewUrl) URL.revokeObjectURL(pendingCapturePreviewUrl);
  pendingCapturePreviewUrl = null;
  $('#capturePreview').replaceChildren();
  $('#captureSelectionMeta').textContent = '';
  renderMode();
}

function selectForCapture(file) {
  if (!file) return;
  const error = validateFile(file);
  if (error) { $('#captureMessage').textContent = error; return; }
  clearPendingCapture();
  pendingCaptureFile = file;
  pendingCapturePreviewUrl = renderPreview($('#capturePreview'), file, file.name);
  $('#captureSelectionMeta').textContent = `${nextEvidenceNumber(evidences)}（保存時に確定） ／ ${file.name} ／ 保存前`;
  $('#captureMessage').textContent = '原本を確認して、保存方法を選んでください。';
  renderMode();
}

async function savePendingCapture({ readNow = false } = {}) {
  if (!pendingCaptureFile) return;
  const file = pendingCaptureFile;
  await capture(file);
  clearPendingCapture();
  const evidence = activeEvidence();
  if (!evidence) return;
  $('#captureSavedMeta').textContent = `${evidence.evidenceNumber} ／ ${evidence.fileName} ／ 未整理に保存済み`;
  screenMode = readNow ? 'organize' : 'capture';
  renderMode();
  if (!readNow) return;
  $('#organizeWorkspace').scrollIntoView({ block: 'start', behavior: 'smooth' });
  const controller = await receiptItemsController();
  if (!controller) { $('#progress').textContent = '商品明細の表示を準備できませんでした。再読み込みしてください。'; return; }
  await readActiveEvidence();
}

function startOrganizing() {
  if (!activeEvidence()) return;
  screenMode = 'organize';
  renderMode();
  $('#organizeWorkspace').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

installTwoModeLayout();

function persist() { storage.saveMigratedState({ records, evidences, children }); storage.saveKnowledgeHistory(history); }
function readerState(evidence) {
  if (!evidence) return { label: '原本未選択', className: '' };
  if (evidence.status === 'processing') return { label: '読み取り中', className: '' };
  if (evidence.ocr?.status === 'completed') return { label: '読み取り済み・要確認', className: 'review' };
  if (evidence.ocr?.status === 'failed') return { label: '読み取り失敗（再実行できます）', className: 'failed' };
  return { label: '未読取', className: '' };
}
function renderCurrentEvidence() {
  const host = $('#currentEvidence'), info = $('#currentEvidenceInfo'), actions = $('#currentEvidenceActions');
  if (!host || !info || !actions) return;
  const evidence = activeEvidence();
  if (!evidence) {
    host.className = 'current-evidence empty';
    info.innerHTML = '<b>現在作業中の原本はありません</b><p>原本を選択すると、未整理へ保存したままここに表示されます。</p>';
    actions.hidden = true;
    return;
  }
  const reader = readerState(evidence);
  rememberCurrentEvidence(evidence.id);
  host.className = 'current-evidence';
  info.innerHTML = `<div class="current-evidence-head"><div><p class="hint">現在作業中</p><h3>${esc(evidence.evidenceNumber)}</h3><p><b>未整理に保存済み</b> ／ ${esc(evidence.fileName)}</p></div><span class="reader-state ${reader.className}">${reader.label}</span></div>`;
  actions.hidden = false;
  $('#ocr').disabled = evidence.status === 'processing';
  $('#deferCurrent').disabled = evidence.status === 'processing';
}
function rememberCurrentEvidence(evidenceId) { storage.saveCurrentEvidenceId(evidenceId || null); }
function restoreWorkspaceItems(items) {
  const apply = () => { if (!window.receiptItemsController) return false; window.receiptItemsController.setItems(items || []); return true; };
  if (apply()) return;
  let attempts = 0;
  const timer = setInterval(() => { if (apply() || ++attempts >= 40) clearInterval(timer); }, 25);
}
async function receiptItemsController() {
  if (window.receiptItemsController) return window.receiptItemsController;
  return new Promise((resolve) => {
    let attempts = 0;
    const timer = setInterval(() => {
      if (window.receiptItemsController || ++attempts >= 40) {
        clearInterval(timer);
        resolve(window.receiptItemsController || null);
      }
    }, 25);
  });
}
function setup() { $('#user').textContent = currentUser.email || ''; $('#child').innerHTML = '<option value="">選択してください</option>' + children.map((child) => `<option value="${esc(child.id)}">${esc(child.name)}</option>`).join(''); $('#category').innerHTML = '<option value="">選択してください</option>' + CATEGORY_OPTIONS.map((value) => `<option>${esc(value)}</option>`).join(''); $('#settlement').innerHTML = SETTLEMENT_OPTIONS.map((value) => `<option>${esc(value)}</option>`).join(''); $('#filter').innerHTML = '<option value="">すべての費目</option>' + CATEGORY_OPTIONS.map((value) => `<option>${esc(value)}</option>`).join(''); window.receiptItemsController?.setHistory(history); }
function calc() { const form = $('#form'), amount = toNonNegativeNumber(form.amount.value), otherRate = Math.max(0, Math.min(100, Number(form.otherRate.value) || 0)), other = calculateOtherBurdenAmount(amount, otherRate), out = calculateOutstandingAmount(other, form.already.value); $('#other').value = yen(other); $('#outstanding').value = yen(out); return { amount, other, out }; }
function filteredRecords() { return records.filter((record) => !$('#filter').value || f(record.category) === $('#filter').value).sort((left, right) => String(right.paidDate).localeCompare(String(left.paidDate))); }
function evidenceLabel(status) { return ({ unorganized: '未整理', processing: '読み取り中', review: '要確認', organized: '整理途中', attached: '整理完了', draft: '下書き' })[status] || '未整理'; }
function renderSummary() { const summary = calculateSummary(filteredRecords()); const counts = evidences.reduce((total, evidence) => ({ ...total, [evidence.status]: (total[evidence.status] || 0) + 1 }), {}); $('#summary').innerHTML = [['未整理', `${(counts.unorganized || 0) + (counts.draft || 0)}件`], ['読み取り済み', `${counts.review || 0}件`], ['整理途中', `${counts.organized || 0}件`], ['整理完了', `${counts.attached || 0}件`], ['支出総額', yen(summary.amount)], ['未清算額', yen(summary.outstanding)]].map(([label, number]) => `<div><small>${label}</small><strong>${number}</strong></div>`).join(''); }
function filterEvidence() { return $('#evidenceFilters').dataset.filter || 'unorganized'; }
function renderFilters() { const current = filterEvidence(); const filters = [['all', 'すべて'], ['unorganized', '未整理'], ['review', '要確認'], ['organized', '整理途中'], ['attached', '整理済み']]; $('#evidenceFilters').innerHTML = filters.map(([value, label]) => `<button type="button" data-filter="${value}" class="${value === current ? 'active' : ''}">${label}</button>`).join(''); }
function sortedEvidence() { const direction = $('#evidenceOrder').value === 'old' ? 1 : -1; const current = filterEvidence(); return evidences.filter((evidence) => current === 'all' || (current === 'unorganized' ? evidence.status !== 'attached' : evidence.status === current)).sort((left, right) => direction * String(left.createdAt).localeCompare(String(right.createdAt))); }
function renderUnorganized() { renderFilters(); const items = sortedEvidence(); $('#unorganizedList').innerHTML = items.length ? items.map((evidence) => `<article class="ecard"><b>${esc(evidence.evidenceNumber)}</b> <span class="badge">${evidenceLabel(evidence.status)}</span><p>${esc(evidence.fileName)}</p><p class="hint">追加: ${new Date(evidence.createdAt).toLocaleString('ja-JP')}<br>OCR: ${esc(evidence.ocr?.status || 'not_started')}</p><button data-organize="${esc(evidence.id)}">${evidence.status === 'attached' ? '原本を開く' : 'この証拠を整理する'}</button>${evidence.status !== 'attached' ? ` <button class="warn" data-discard="${esc(evidence.id)}">削除</button>` : ''}</article>`).join('') : '<p class="hint">該当する原本はありません。</p>'; }
function renderRecords() { const emap = evidenceMap(); $('#rows').innerHTML = filteredRecords().map((record) => `<tr><td>${(record.evidenceIds || []).map((id) => esc(emap.get(id)?.evidenceNumber || '—')).join(' / ')}</td><td>${esc(record.paidDate)}</td><td>${esc(f(record.vendor))}</td><td class="right">${yen(f(record.amount))}</td><td>${esc(f(record.settlementStatus))}</td><td><button data-edit="${esc(record.id)}">編集</button><button class="warn" data-delete="${esc(record.id)}">削除</button></td></tr>`).join('') || '<tr><td colspan="6">登録済み明細はありません。</td></tr>'; }
function render() { renderSummary(); renderUnorganized(); renderRecords(); renderCurrentEvidence(); renderMode(); }
function clearPreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; $('#preview').textContent = '未整理から原本を開くか、上の撮影ボタンで保存してください。'; }
function resetForm() { activeEvidenceId = null; activeFile = null; activeOcr = null; editingRecordId = null; sources = {}; merchantCandidates = []; readerHeaders = {}; $('#form').reset(); $('#form').selfRate.value = 50; $('#form').otherRate.value = 50; $('#form').already.value = 0; $('#form').payer.value = '自分'; $('#formtitle').textContent = '後から整理'; $('#raw').value = ''; $('#corrected').value = ''; $('#filemeta').textContent = '証拠番号：未選択'; $('#filemsg').textContent = ''; $('#msg').textContent = ''; $('#candidates').classList.add('hide'); $('#ocr').disabled = true; window.receiptItemsController?.reset(); clearPreview(); calc(); }
async function capture(file, { readNow = false } = {}) { if (!file) return; const error = validateFile(file); if (error) { $('#captureMessage').textContent = error; return; } $('#captureMessage').textContent = '原本を未整理へ保存中…'; try { const evidence = await saveUnorganizedEvidence({ file, evidences, saveFile }); evidences.push(evidence); persist(); activeEvidenceId = evidence.id; activeFile = file; activeOcr = evidence.ocr; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = renderPreview($('#preview'), file, evidence.fileName); $('#filemeta').textContent = `証拠番号：${evidence.evidenceNumber} ／ ${evidence.fileName}`; $('#filemsg').textContent = readNow ? '未整理へ保存しました。これから文字を読み取ります。' : '未整理へ保存しました。画像を確認して、あとから整理できます。'; $('#ocr').disabled = false; render(); $('#captureMessage').innerHTML = readNow ? `未整理に保存しました（${esc(evidence.evidenceNumber)}）。文字を読み取っています…` : `未整理に保存しました（${esc(evidence.evidenceNumber)}）。 <button id="continueCapture" type="button">続けて撮影</button> <button id="readSaved" type="button">今すぐ読み取る</button> <button id="openSaved" type="button" data-id="${esc(evidence.id)}">未整理BOXを見る</button>`; if (readNow) await readActiveEvidence(); } catch (error) { $('#captureMessage').textContent = `原本の保存に失敗しました: ${error.message}`; } }
async function openEvidence(id) { const evidence = evidenceMap().get(id); if (!evidence) return; const file = await getFile(id); if (!file) { $('#captureMessage').textContent = '保存済みの原本ファイルが見つかりません。'; return; } resetForm(); activeEvidenceId = evidence.id; activeFile = file; activeOcr = evidence.ocr; const organizer = evidence.organization || {}; sources = organizer.sources || {}; merchantCandidates = organizer.merchantCandidates || []; readerHeaders = organizer.readerHeaders || {}; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = renderPreview($('#preview'), file, evidence.fileName); $('#filemeta').textContent = `証拠番号：${evidence.evidenceNumber} ／ ${evidence.fileName}`; $('#filemsg').textContent = evidence.status === 'attached' ? '登録済みの原本です。' : 'この原本を整理できます。途中保存しても内容は残ります。'; $('#ocr').disabled = false; $('#raw').value = evidence.ocr?.rawText || ''; $('#corrected').value = evidence.ocr?.correctedText || ''; const headers = organizer.headers || {}; const form = $('#form'); for (const key of ['paidDate', 'amount', 'vendor', 'childId', 'category', 'payer', 'parenting', 'special', 'selfRate', 'otherRate', 'already', 'settlement', 'period', 'reason', 'notes']) if (headers[key] != null && form.elements[key]) form.elements[key].value = headers[key]; window.receiptItemsController?.setItems(organizer.items || []); window.receiptItemsController?.setHistory(history); $('#formtitle').textContent = evidence.status === 'attached' ? '登録済み明細を編集' : 'この証拠を整理する'; calc(); renderCandidates(); checkDuplicate(); if (readerHasResult()) screenMode = 'organize'; renderMode(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function headersSnapshot() { const form = $('#form'); return Object.fromEntries(['paidDate', 'amount', 'vendor', 'childId', 'category', 'payer', 'parenting', 'special', 'selfRate', 'otherRate', 'already', 'settlement', 'period', 'reason', 'notes'].map((key) => [key, form.elements[key]?.value ?? ''])); }
function organizationSnapshot() { return { headers: headersSnapshot(), items: window.receiptItemsController?.getItems() || [], sources, merchantCandidates, readerHeaders, updatedAt: new Date().toISOString() }; }
function saveProgress() { const evidence = activeEvidence(); if (!evidence || evidence.status === 'attached') { $('#msg').textContent = '未整理または要確認の原本を開いてください。'; return; } evidence.organization = organizationSnapshot(); evidence.updatedAt = new Date().toISOString(); evidence.status = evidence.ocr?.status === 'completed' ? 'review' : 'organized'; persist(); render(); $('#msg').textContent = '途中保存しました。ブラウザを閉じても、この原本から続けられます。'; }
function renderCandidates() { const text = $('#corrected').value || $('#raw').value; const suggestions = extractSuggestions(text); const pastMerchants = historySuggestions(history, 'merchantCorrections', merchantCandidates[0]?.value || $('#form').vendor.value).map((entry) => ({ value: entry.confirmed, source: 'user_confirmed_history', confidence: 1, reason: '過去の確定履歴' })); const merchants = [...pastMerchants, ...merchantCandidates.map((entry) => ({ value: entry.displayName || entry.value, source: 'ocr', confidence: entry.confidence, reason: entry.reason }))].filter((entry, index, array) => entry.value && array.findIndex((candidate) => candidate.value === entry.value) === index).slice(0, 3); const dates = [...(readerHeaders.purchaseDate ? [{ value: readerHeaders.purchaseDate, source: 'ocr', reason: 'Reader候補' }] : []), ...suggestions.dates]; const amounts = [...(readerHeaders.receiptTotalAmount != null ? [{ value: readerHeaders.receiptTotalAmount, source: 'ocr', reason: 'Reader候補' }] : []), ...suggestions.amounts]; const groups = [['paidDate', '支払日', dates], ['amount', 'レシート総額', amounts], ['vendor', '購入店候補', merchants]]; const html = groups.flatMap(([key, label, values]) => (values || []).filter((entry, index, array) => array.findIndex((candidate) => candidate.value === entry.value) === index).slice(0, 3).map((entry) => `<div class="candidate"><span><b>${label}</b> ${esc(key === 'amount' ? yen(entry.value) : entry.value)}<br><small>${esc(entry.reason || '')}${entry.source === 'user_confirmed_history' ? '（過去の確定履歴）' : ''}</small></span><button type="button" data-candidate="${key}" data-value="${encodeURIComponent(entry.value)}" data-source="${entry.source}">反映</button></div>`)).join(''); $('#candidates').innerHTML = html ? `<strong>候補（自動確定しません）</strong>${html}` : ''; $('#candidates').classList.toggle('hide', !html); }
function applyCandidate(key, value, source) { const field = $('#form').elements[key]; if (!field) return; field.value = value; sources[key] = { source, confidence: source === 'user_confirmed_history' ? 1 : null }; calc(); checkDuplicate(); }
function checkDuplicate() { const form = $('#form'), amount = calc().amount; $('#duplicate').textContent = findPotentialDuplicates({ id: editingRecordId, paidDate: form.paidDate.value, amount, vendor: form.vendor.value }, records).length ? '既存明細と重複している可能性があります。自動処理はされません。' : ''; }
async function readActiveEvidence() { const evidence = activeEvidence(); if (!evidence || !activeFile) { $('#filemsg').textContent = '未整理から原本を開いてください。'; return; } $('#ocr').disabled = true; $('#progress').textContent = '読み取り中…'; evidence.status = 'processing'; persist(); render(); try { if (activeFile.type === 'application/pdf' || /\.pdf$/i.test(activeFile.name)) { activeOcr = await extractPdfText(activeFile); window.receiptItemsController?.applyOcrCandidates(activeOcr.correctedText || activeOcr.rawText); } else { const reader = await readReceipt({ file: activeFile, onProgress: (progress) => { $('#progress').textContent = `読み取り中… ${progress}%`; } }); activeOcr = { status: 'completed', rawText: reader.rawText, correctedText: '', processedAt: new Date().toISOString(), engine: reader.provider === 'openai' ? 'OpenAI Vision Receipt Reader' : 'Tesseract.js', confidence: reader.metadata?.confidence ?? null, preprocessing: reader.metadata?.preprocessing || null, itemExtraction: reader.quality, readerProvider: reader.provider }; merchantCandidates = extractMerchantCandidates(reader.rawText); readerHeaders = { vendor: reader.vendor || '', purchaseDate: reader.purchaseDate || '', receiptTotalAmount: reader.receiptTotalAmount ?? null }; const itemResult = window.receiptItemsController?.applyReceiptReaderCandidates(reader); if (itemResult?.headers?.vendor) merchantCandidates = [{ value: itemResult.headers.vendor, displayName: itemResult.headers.vendor, confidence: .7, reason: 'Reader候補' }, ...merchantCandidates]; }
    $('#raw').value = activeOcr.rawText || ''; $('#corrected').value = activeOcr.correctedText || ''; evidence.ocr = { ...activeOcr, correctedText: $('#corrected').value }; evidence.status = 'review'; evidence.organization = organizationSnapshot(); evidence.updatedAt = new Date().toISOString(); persist(); renderCandidates(); $('#progress').textContent = '読み取り候補を表示しました。内容を確認・修正して保存してください。';
  } catch (error) { evidence.status = 'unorganized'; evidence.ocr = { status: 'failed', rawText: '', correctedText: '', processedAt: new Date().toISOString() }; persist(); $('#progress').textContent = `読み取りに失敗しました: ${error.message}`; } finally { $('#ocr').disabled = false; render(); } }
function rememberConfirmedValues(record) { const vendor = f(record.vendor); const rawMerchants = merchantCandidates.map((entry) => entry.displayName || entry.value).filter(Boolean); for (const raw of rawMerchants) history = rememberConfirmation(history, 'merchantCorrections', raw, vendor); for (const item of record.items || []) { const raw = item.sourceLines?.[0] || item.productName; if (item.productName) history = rememberConfirmation(history, 'productCorrections', raw, item.productName); if (item.category) history = rememberConfirmation(history, 'categoryHistory', item.productName, item.category); if (item.knowledgeKey) history = rememberConfirmation(history, 'knowledgeSelectionHistory', item.productName, item.knowledgeKey); } }
async function register(ev) { ev.preventDefault(); const evidence = activeEvidence(); const form = $('#form'), amounts = calc(); if (!evidence) { $('#msg').textContent = '未整理の原本を開いてから登録してください。'; return; } if (!form.paidDate.value || amounts.amount <= 0) { $('#msg').textContent = '最終登録には支払日と0より大きいレシート総額が必要です。途中保存はいつでもできます。'; return; } const record = createExpenseRecord({ id: editingRecordId || undefined, evidenceIds: attachDraftEvidence({ evidenceIds: editingRecordId ? records.find((item) => item.id === editingRecordId)?.evidenceIds || [] : [], evidenceId: evidence.id, evidences, ocr: { ...activeOcr, correctedText: $('#corrected').value } }), paidDate: form.paidDate.value, amount: { value: amounts.amount, source: sources.amount?.source || 'manual' }, vendor: { value: form.vendor.value, source: sources.vendor?.source || 'manual' }, childId: form.childId.value, category: form.category.value, parentingExpenseStatus: form.parenting.value, specialExpenseStatus: form.special.value, payer: form.payer.value, targetPeriod: form.period.value, reason: form.reason.value, selfBurdenRate: form.selfRate.value, otherBurdenRate: form.otherRate.value, otherBurdenAmount: amounts.other, alreadyPaidAmount: form.already.value, outstandingAmount: amounts.out, settlementStatus: form.settlement.value, notes: form.notes.value, receiptTotalAmount: amounts.amount, items: window.receiptItemsController?.getItems() || [], createdAt: records.find((item) => item.id === editingRecordId)?.createdAt }); const index = records.findIndex((item) => item.id === record.id); if (index >= 0) records[index] = record; else records.push(record); rememberConfirmedValues(record); persist(); render(); $('#captureMessage').textContent = `${evidence.evidenceNumber} を登録しました。未整理から外れました。`; resetForm(); }
async function editRecord(id) { const record = records.find((item) => item.id === id); if (!record) return; const evidence = evidenceMap().get(record.evidenceIds?.[0]); if (!evidence) return; await openEvidence(evidence.id); editingRecordId = record.id; const form = $('#form'); const values = { paidDate: record.paidDate, amount: f(record.amount), vendor: f(record.vendor), childId: f(record.childId), category: f(record.category), payer: f(record.payer), parenting: f(record.parentingExpenseStatus), special: f(record.specialExpenseStatus), selfRate: record.selfBurdenRate, otherRate: record.otherBurdenRate, already: record.alreadyPaidAmount, settlement: f(record.settlementStatus), period: record.targetPeriod, reason: f(record.reason), notes: record.notes }; for (const [key, value] of Object.entries(values)) if (form.elements[key]) form.elements[key].value = value; window.receiptItemsController?.setItems(record.items || []); $('#formtitle').textContent = '登録済み明細を編集'; calc(); }
async function deleteEvidence(id) { if (!confirm('この未整理原本と途中データを削除します。よろしいですか？')) return; evidences = await discardUnattachedEvidence({ evidenceId: id, evidences, records, deleteFile }); persist(); render(); if (activeEvidenceId === id) resetForm(); }
async function deleteRecord(id) { if (!confirm('この経費を削除します。')) return; const result = await deleteReceiptAndExclusiveEvidence({ receiptId: id, records, evidences, deleteFile }); records = result.records; evidences = result.evidences; persist(); render(); }
function xlsx() { if (!globalThis.XLSX) return; const data = buildWorkbookData(filteredRecords(), evidences, children), book = XLSX.utils.book_new(); [['清算一覧', data.settlement], ['購入品明細', data.receiptItems], ['種別集計', data.category], ['証拠一覧', data.evidence], ['集計', data.summary]].forEach(([name, rows]) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name)); XLSX.writeFile(book, '子ども関連支出_清算一覧.xlsx'); }
async function docx() { if (!globalThis.docx) return; const model = buildWordDocumentModel(filteredRecords(), evidences, children, '全期間'); const D = globalThis.docx; const document = new D.Document({ sections: [{ children: [new D.Paragraph({ text: model.title, heading: D.HeadingLevel.TITLE }), new D.Paragraph(`対象期間：${model.periodLabel}`), new D.Paragraph(model.disclaimer)] }] }); const blob = await D.Packer.toBlob(document), anchor = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: '子ども関連支出_清算説明書.docx' }); anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000); }
function print() { const summary = calculateSummary(filteredRecords()); $('#printcontent').innerHTML = `<h1>子ども関連支出 清算一覧</h1><p>支出総額 ${yen(summary.amount)}　未清算額 ${yen(summary.outstanding)}</p><table><thead><tr><th>証拠番号</th><th>日付</th><th>支払先</th><th>金額</th></tr></thead><tbody>${filteredRecords().map((record) => `<tr><td>${esc((record.evidenceIds || []).map((id) => evidenceMap().get(id)?.evidenceNumber || '').join(' / '))}</td><td>${esc(record.paidDate)}</td><td>${esc(f(record.vendor))}</td><td>${yen(f(record.amount))}</td></tr>`).join('')}</tbody></table>`; $('#printview').classList.remove('hide'); }

setup(); resetForm(); render();
$('#file').addEventListener('change', (event) => capture(event.target.files?.[0]));
$('#saveCamera').addEventListener('change', (event) => capture(event.target.files?.[0]));
$('#readCamera').addEventListener('change', (event) => capture(event.target.files?.[0], { readNow: true }));
$('#quickFile').addEventListener('change', (event) => capture(event.target.files?.[0]));
$('#readFile').addEventListener('change', (event) => capture(event.target.files?.[0], { readNow: true }));
$('#showUnorganized').addEventListener('click', () => $('#unorganizedSection').scrollIntoView({ behavior: 'smooth' }));
$('#captureMessage').addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.id === 'continueCapture') $('#saveCamera').click(); if (button.id === 'readSaved') readActiveEvidence(); if (button.id === 'openSaved') openEvidence(button.dataset.id); });
$('#evidenceFilters').addEventListener('click', (event) => { const button = event.target.closest('[data-filter]'); if (!button) return; $('#evidenceFilters').dataset.filter = button.dataset.filter; renderUnorganized(); });
$('#evidenceOrder').addEventListener('change', renderUnorganized);
$('#unorganizedList').addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.organize) openEvidence(button.dataset.organize); if (button.dataset.discard) deleteEvidence(button.dataset.discard); });
$('#ocr').addEventListener('click', readActiveEvidence);
$('#corrected').addEventListener('input', () => { if (activeOcr) { activeOcr.correctedText = $('#corrected').value; const evidence = activeEvidence(); if (evidence) { evidence.ocr = { ...activeOcr }; evidence.organization = organizationSnapshot(); evidence.updatedAt = new Date().toISOString(); persist(); } } renderCandidates(); });
$('#candidates').addEventListener('click', (event) => { const button = event.target.closest('[data-candidate]'); if (button) applyCandidate(button.dataset.candidate, decodeURIComponent(button.dataset.value), button.dataset.source); });
$('#form').addEventListener('input', (event) => { if (['paidDate', 'amount', 'vendor', 'category', 'reason'].includes(event.target.name)) sources[event.target.name] = { source: 'manual', confidence: null }; if (event.target.name === 'selfRate') $('#form').otherRate.value = 100 - (Number(event.target.value) || 0); if (event.target.name === 'otherRate') $('#form').selfRate.value = 100 - (Number(event.target.value) || 0); calc(); checkDuplicate(); });
$('#form').addEventListener('submit', register); $('#saveProgress').addEventListener('click', saveProgress); $('#reset').addEventListener('click', resetForm); $('#filter').addEventListener('change', renderRecords);
$('#rows').addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.dataset.edit) editRecord(button.dataset.edit); if (button.dataset.delete) deleteRecord(button.dataset.delete); });
$('#logout').addEventListener('click', () => logout()); $('#xlsx').addEventListener('click', xlsx); $('#docx').addEventListener('click', docx); $('#print').addEventListener('click', print); $('#closeprint').addEventListener('click', () => $('#printview').classList.add('hide'));

function prepareNewCapture() {
  activeEvidenceId = null; activeFile = null; activeOcr = null; editingRecordId = null;
  sources = {}; merchantCandidates = []; readerHeaders = {};
  $('#form').reset(); $('#form').selfRate.value = 50; $('#form').otherRate.value = 50; $('#form').already.value = 0; $('#form').payer.value = '自分';
  $('#raw').value = ''; $('#corrected').value = ''; $('#progress').textContent = '';
  $('#candidates').classList.add('hide');
  window.receiptItemsController?.reset();
  clearPreview(); renderCurrentEvidence();
}

for (const input of [$('#file'), $('#saveCamera'), $('#readCamera'), $('#quickFile'), $('#readFile')]) {
  input.addEventListener('change', prepareNewCapture, true);
}
$('#deferCurrent').addEventListener('click', () => {
  const evidence = activeEvidence();
  if (!evidence) return;
  $('#filemsg').textContent = '未整理に保存済みです。あとでこの原本を開いて整理できます。';
  $('#captureMessage').textContent = `${evidence.evidenceNumber} を未整理に保存しました。`;
  renderCurrentEvidence();
});
$('#continueCurrent').addEventListener('click', () => $('#saveCamera').click());
$('#captureCamera').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (!file) return; prepareNewCapture(); selectForCapture(file); });
$('#captureFile').addEventListener('change', (event) => { const file = event.target.files?.[0]; if (!file) return; prepareNewCapture(); selectForCapture(file); });
$('#savePending').addEventListener('click', () => savePendingCapture());
$('#readPending').addEventListener('click', () => savePendingCapture({ readNow: true }));
$('#captureAgain').addEventListener('click', () => $('#captureCamera').click());
$('#organizeSaved').addEventListener('click', startOrganizing);
$('#openUnorganized').addEventListener('click', () => $('#unorganizedSection').scrollIntoView({ behavior: 'smooth' }));
$('#backToCapture').addEventListener('click', () => { screenMode = 'capture'; renderMode(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('#unorganizedList').addEventListener('click', (event) => {
  if (event.target.closest('[data-organize]')) { screenMode = 'organize'; renderMode(); }
}, true);
$('#ocr').addEventListener('click', async (event) => {
  if (window.receiptItemsController) return;
  event.stopImmediatePropagation();
  $('#progress').textContent = '商品明細の表示を準備中…';
  const controller = await receiptItemsController();
  if (!controller) { $('#progress').textContent = '商品明細の表示を準備できませんでした。再読み込みしてください。'; return; }
  readActiveEvidence();
}, true);

const previewObserver = new MutationObserver(() => {
  const evidence = activeEvidence();
  if (!evidence) return;
  renderCurrentEvidence();
  restoreWorkspaceItems(evidence.organization?.items || []);
  $('#currentEvidence').scrollIntoView({ block: 'start', behavior: 'smooth' });
});
previewObserver.observe($('#preview'), { childList: true });

const resumeEvidenceId = storage.loadCurrentEvidenceId();
if (resumeEvidenceId && evidenceMap().get(resumeEvidenceId)?.status !== 'attached') {
  openEvidence(resumeEvidenceId).catch(() => storage.saveCurrentEvidenceId(null));
}
