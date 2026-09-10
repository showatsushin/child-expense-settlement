import { suggestReasons } from './src/services/expenseSuggestion.js';

const waitForForm = () => new Promise((resolve) => {
  const timer = setInterval(() => { const form = document.querySelector('#form'); if (form) { clearInterval(timer); resolve(form); } }, 40);
});

function contextFromForm(form) {
  const selectedChild = form.childId?.selectedOptions?.[0]?.textContent || '';
  return { paidDate: form.paidDate?.value || '', vendor: form.vendor?.value || '', category: form.category?.value || '', child: selectedChild, ocrRawText: document.querySelector('#raw')?.value || '', correctedText: document.querySelector('#corrected')?.value || '', targetPeriod: form.period?.value || '', notes: form.notes?.value || '' };
}

function candidateElement(candidate, reason) {
  const item = document.createElement('article'); item.className = 'reason-candidate';
  const heading = document.createElement('h4'); heading.textContent = { concise: '簡潔', standard: '標準', detailed: '詳細' }[candidate.style] || '候補';
  const draft = document.createElement('p'); draft.textContent = candidate.value;
  const basis = document.createElement('small'); basis.textContent = `根拠: ${candidate.basis.join(' / ')}`;
  const use = document.createElement('button'); use.type = 'button'; use.className = 'reason-use'; use.textContent = 'この文章を使用';
  use.addEventListener('click', () => { reason.value = candidate.value; reason.dataset.suggestionSource = candidate.source; reason.dataset.suggestionConfidence = String(candidate.confidence ?? ''); reason.dispatchEvent(new Event('input', { bubbles: true })); reason.focus(); });
  item.append(heading, draft, basis, use); return item;
}

function addReasonSuggestions(form) {
  const reason = form.elements.reason; if (!reason) return;
  const host = reason.closest('label'); const tools = document.createElement('div'); tools.className = 'reason-tools';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'reason-trigger'; trigger.textContent = '理由を提案';
  const disclosure = document.createElement('span'); disclosure.textContent = '候補は事実説明の下書きです。保存はされません。';
  const list = document.createElement('div'); list.className = 'reason-suggestions hide'; list.setAttribute('aria-live', 'polite');
  trigger.addEventListener('click', () => { const candidates = suggestReasons(contextFromForm(form)); list.replaceChildren(); const title = document.createElement('strong'); title.textContent = '支出理由の候補（確認後に選択）'; list.append(title); candidates.forEach((candidate) => list.append(candidateElement(candidate, reason))); list.classList.remove('hide'); });
  tools.append(trigger, disclosure); host.append(tools, list);
}

function injectStyles() {
  document.head.insertAdjacentHTML('beforeend', `<style id="reason-suggestions-style">.reason-tools{display:flex;align-items:center;gap:10px;margin-top:9px}.reason-trigger{min-height:38px!important;border-color:#8bb2bd!important;color:#174d5d!important;background:#f2f8f9!important}.reason-tools span{font-size:12px;color:#60717a}.reason-suggestions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;padding:12px;border:1px solid #b7d1d8;border-radius:10px;background:#f5fafb}.reason-suggestions>strong{grid-column:1/-1;color:#17495b}.reason-candidate{display:flex;flex-direction:column;gap:8px;padding:13px;border:1px solid #d8e5e8;border-radius:9px;background:#fff}.reason-candidate h4{margin:0;color:#17495b;font-size:14px}.reason-candidate p{margin:0;line-height:1.7;font-size:14px}.reason-candidate small{color:#60717a;font-size:11px;line-height:1.55}.reason-use{align-self:flex-start;min-height:36px!important;margin-top:auto}@media(max-width:900px){.reason-suggestions{grid-template-columns:1fr}}@media(max-width:640px){.reason-tools{align-items:stretch;flex-direction:column}.reason-trigger{width:100%;min-height:44px!important}.reason-suggestions{padding:10px}.reason-candidate{padding:14px}}</style>`);
}

const form = await waitForForm(); injectStyles(); addReasonSuggestions(form);