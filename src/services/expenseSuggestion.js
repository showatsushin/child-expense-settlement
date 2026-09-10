// Local-only provider boundary. Suggestions are factual drafts and never save automatically.
export const REASON_TEMPLATES = Object.freeze({
  '医療費': { concise: '子どもの診察・治療に伴い発生した医療費。', activity: '診察・治療', noun: '医療費' },
  '教育費': { concise: '子どもの学習・教育に必要な費用として支出。', activity: '学習・教育', noun: '教育費' },
  '学校費': { concise: '子どもの学校生活に必要な学校関連費として支出。', activity: '学校生活', noun: '学校関連費' },
  '保育費': { concise: '子どもの保育に必要な費用として支出。', activity: '保育', noun: '保育費' },
  '習い事': { concise: '子どもの教育・活動に必要な費用として支出。', activity: '教育・活動', noun: '習い事に関する費用' },
  '衣類': { concise: '子どもの衣類・身の回り品として必要な費用を支出。', activity: '衣類・身の回り品', noun: '費用' },
  '交通費': { concise: '子どもの移動に伴い必要となった交通費。', activity: '移動', noun: '交通費' },
  '食費': { concise: '子どもの食事に関連して発生した費用。', activity: '食事', noun: '費用' },
  '保険': { concise: '子どもに関する保険料として支出。', activity: '保険', noun: '保険料' },
  'その他': { concise: '子どもに関連して必要となった費用。', activity: '関連する事項', noun: '費用' },
});

const text = (value) => String(value || '').trim();
const safeTemplate = (category) => REASON_TEMPLATES[text(category)] || REASON_TEMPLATES['その他'];
const appendBasis = (basis, label, value) => value ? [...basis, `${label}: ${value}`] : basis;

export function suggestReasons(context = {}) {
  const category = text(context.category); const vendor = text(context.vendor); const paidDate = text(context.paidDate);
  const template = safeTemplate(category); const basis = appendBasis([], 'category', category || 'その他');
  const factBasis = appendBasis(appendBasis(basis, 'paidDate', paidDate), 'vendor', vendor);
  const datePrefix = paidDate ? `${paidDate}、` : '';
  const vendorPhrase = vendor ? `、${vendor}へ` : '';
  const detailedVendorPhrase = vendor ? `${vendor}を利用し、` : '';
  return [
    { value: template.concise, source: 'template', confidence: 1, basis, style: 'concise' },
    { value: `${datePrefix}子どもの${template.activity}に伴い${vendorPhrase}支払った${template.noun}。`, source: 'template', confidence: 1, basis: factBasis, style: 'standard' },
    { value: `${datePrefix}子どもの${template.activity}のため${detailedVendorPhrase}その際に発生した${template.noun}として支出。`, source: 'template', confidence: 1, basis: factBasis, style: 'detailed' },
  ];
}

// Kept as the single replacement point for a future, safely hosted AI provider.
export async function suggestExpense(context = {}) { return { status: 'completed', suggestions: suggestReasons(context) }; }