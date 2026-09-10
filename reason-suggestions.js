import { suggestAiExpense, suggestReasons } from './src/services/expenseSuggestion.js';
import { getAccessToken } from './src/auth-gate.js';

const waitForForm = () => new Promise((resolve) => { const timer = setInterval(() => { const form = document.querySelector('#form'); if (form) { clearInterval(timer); resolve(form); } }, 40); });
const styleLabel = { concise: '簡潔', standard: '標準', detailed: '詳細' };

function contextFromForm(form) {
  const selectedChild = form.childId?.selectedOptions?.[0]?.textContent || '';
  return { paidDate: form.paidDate?.value || '', vendor: form.vendor?.value || '', amount: form.amount?.value || '', category: form.category?.value || '', child: selectedChild, ocrRawText: document.querySelector('#raw')?.value || '', correctedText: document.querySelector('#corrected')?.value || '' };
}
function candidateElement(candidate, reason) {
  const item = document.createElement('article'); item.className = 'reason-candidate';
  const heading = document.createElement('h4'); heading.textContent = styleLabel[candidate.style] || '候補';
  const draft = document.createElement('p'); draft.textContent = candidate.value;
  const basis = document.createElement('small'); basis.textContent = `根拠: ${(candidate.basis || []).join(' / ')}`;
  const use = document.createElement('button'); use.type = 'button'; use.className = 'reason-use'; use.textContent = 'この文章を使用';
  use.addEventListener('click', () => { reason.value = candidate.value; reason.dataset.suggestionSource = candidate.source; reason.dataset.suggestionConfidence = String(candidate.confidence ?? ''); reason.dispatchEvent(new Event('input', { bubbles: true })); reason.focus(); });
  item.append(heading, draft, basis, use); return item;
}
function suggestionList(title, candidates, reason) { const list = document.createElement('div'); list.className = 'reason-suggestions'; const heading = document.createElement('strong'); heading.textContent = title; list.append(heading); candidates.forEach((candidate) => list.append(candidateElement(candidate, reason))); return list; }
function applyCategory(form, categorySuggestion) { const category = form.elements.category; category.value = categorySuggestion.value; category.dataset.suggestionSource = 'ai'; category.dataset.suggestionConfidence = String(categorySuggestion.confidence ?? ''); category.dispatchEvent(new Event('input', { bubbles: true })); }

function addReasonSuggestions(form) {
  const reason = form.elements.reason; if (!reason) return;
  const host = reason.closest('label'); const tools = document.createElement('div'); tools.className = 'reason-tools';
  const local = document.createElement('button'); local.type = 'button'; local.className = 'reason-trigger'; local.textContent = '理由を提案';
  const ai = document.createElement('button'); ai.type = 'button'; ai.className = 'reason-trigger ai-trigger'; ai.textContent = 'AIで提案';
  const disclosure = document.createElement('span'); disclosure.textContent = '候補は事実説明の下書きです。保存はされません。';
  const localHost = document.createElement('div'); localHost.className = 'reason-local hide'; const aiHost = document.createElement('div'); aiHost.className = 'reason-ai hide'; const aiStatus = document.createElement('p'); aiStatus.className = 'ai-status';
  local.addEventListener('click', () => { localHost.replaceChildren(suggestionList('ローカル候補（確認後に選択）', suggestReasons(contextFromForm(form)), reason)); localHost.classList.remove('hide'); });
  ai.addEventListener('click', async () => {
    ai.disabled = true; aiStatus.textContent = 'AIが支出内容を整理しています…'; aiHost.replaceChildren(aiStatus); aiHost.classList.remove('hide');
    try {
      const accessToken = await getAccessToken(); const result = await suggestAiExpense(contextFromForm(form), { accessToken }); const title = document.createElement('strong'); title.textContent = 'AI提案（確認後に選択）';
      const category = document.createElement('div'); category.className = 'ai-category'; const detail = document.createElement('span'); detail.textContent = `推奨費目: ${result.categorySuggestion.value}（確度 ${Math.round(result.categorySuggestion.confidence * 100)}%） — ${result.categorySuggestion.reason || '要確認'}`; const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = '費目へ反映'; apply.addEventListener('click', () => applyCategory(form, result.categorySuggestion)); category.append(detail, apply);
      const review = document.createElement('p'); review.className = 'ai-review'; review.textContent = result.needsReview || result.missingFields.length ? `要確認: ${[...result.missingFields, ...(result.needsReview ? ['AIが確認を推奨'] : [])].join(' / ') || '内容を確認してください。'}` : '要確認事項: ありません。';
      aiHost.replaceChildren(title, category, suggestionList('簡潔 / 標準 / 詳細', result.reasonSuggestions, reason), review);
    } catch { aiStatus.textContent = 'AI提案を取得できませんでした。ローカル候補は引き続き利用できます。'; }
    finally { ai.disabled = false; }
  });
  tools.append(local, ai, disclosure); host.append(tools, localHost, aiHost);
}
function injectStyles() { document.head.insertAdjacentHTML('beforeend', `<style id="reason-suggestions-style">.reason-tools{display:flex;align-items:center;gap:10px;margin-top:9px;flex-wrap:wrap}.reason-trigger{min-height:38px!important;border-color:#8bb2bd!important;color:#174d5d!important;background:#f2f8f9!important}.ai-trigger{background:#123f55!important;color:#fff!important;border-color:#123f55!important}.reason-tools span{font-size:12px;color:#60717a}.reason-suggestions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;padding:12px;border:1px solid #b7d1d8;border-radius:10px;background:#f5fafb}.reason-suggestions>strong{grid-column:1/-1;color:#17495b}.reason-candidate{display:flex;flex-direction:column;gap:8px;padding:13px;border:1px solid #d8e5e8;border-radius:9px;background:#fff}.reason-candidate h4{margin:0;color:#17495b;font-size:14px}.reason-candidate p{margin:0;line-height:1.7;font-size:14px}.reason-candidate small{color:#60717a;font-size:11px;line-height:1.55}.reason-use{align-self:flex-start;min-height:36px!important;margin-top:auto}.reason-ai{margin-top:12px;padding:12px;border:1px solid #91bfca;border-radius:10px;background:#f2f9fa}.reason-ai>strong{color:#17495b}.ai-status,.ai-review{margin:0;color:#355a67;font-size:13px;line-height:1.6}.ai-category{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0}.ai-category span{font-size:13px;line-height:1.6}.ai-category button{min-height:36px!important;white-space:nowrap}@media(max-width:900px){.reason-suggestions{grid-template-columns:1fr}}@media(max-width:640px){.reason-tools{align-items:stretch;flex-direction:column}.reason-trigger{width:100%;min-height:44px!important}.reason-suggestions{padding:10px}.reason-candidate{padding:14px}.ai-category{align-items:stretch;flex-direction:column}.ai-category button{width:100%;min-height:44px!important}}</style>`); }

const form = await waitForForm(); injectStyles(); addReasonSuggestions(form);