const value = (candidate, source, confidence, reason) => ({ value: candidate, source, confidence, reason });
const clean = (text) => String(text || '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();

export function extractDateCandidates(text) {
  const candidates = new Set(); const normalized = String(text || '');
  for (const match of normalized.matchAll(/(20\d{2}|19\d{2})\s*[\/-年.]\s*(\d{1,2})\s*[\/-月.]\s*(\d{1,2})/g)) candidates.add(`${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`);
  for (const match of normalized.matchAll(/R\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})/gi)) candidates.add(`${2018 + Number(match[1])}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`);
  return [...candidates].map((item) => value(item, 'ocr', .82, 'OCR原文内の日付表記'));
}

export function extractAmountCandidates(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean); const result = []; const seen = new Set();
  lines.forEach((line, index) => { const match = line.match(/(?:合計|総額|お支払額|領収金額|請求額|現計|TOTAL)[^\d]{0,12}([¥￥]?\s*[\d,]+(?:\.\d+)?)/i) || ((/合計|総額|TOTAL/i.test(lines[index - 1] || '')) && line.match(/([¥￥]?\s*[\d,]+(?:\.\d+)?)/)); if (match) { const amount = Number(match[1].replace(/[^\d.]/g, '')); if (amount && !seen.has(amount)) { seen.add(amount); result.push(value(amount, 'ocr', .9, '合計等の近傍にある金額')); } } });
  return result;
}

export function extractVendorCandidates(text) {
  const lines = String(text || '').split(/\r?\n/).map(clean).filter((line) => line.length >= 2 && line.length <= 80); const result = []; const keyword = /(株式会社|有限会社|医院|クリニック|薬局|病院|店|商店|スーパー|学園|学校|保育園|幼稚園|診療所)/;
  const preferred = lines.filter((line) => keyword.test(line)).slice(0, 3); (preferred.length ? preferred : lines.slice(0, 3)).forEach((line) => result.push(value(line, 'ocr', preferred.includes(line) ? .72 : .42, preferred.includes(line) ? '事業者・施設名らしいOCR行' : '原文先頭行'))); return result;
}

const CATEGORY_RULES = [['医療費', /(病院|医院|クリニック|薬局|診療|処方|医療|歯科)/, '医療機関・薬局に関する語句'], ['学校費', /(学校|教材|PTA|学用品|制服|授業料)/, '学校・教材に関する語句'], ['教育費', /(教育|授業|参考書|教材)/, '教育に関する語句'], ['保育費', /(保育園|幼稚園|こども園)/, '保育施設に関する語句'], ['習い事', /(塾|スクール|教室|レッスン|習い事)/, '学習塾・教室に関する語句'], ['交通費', /(電車|バス|タクシー|運賃|乗車)/, '交通に関する語句'], ['衣類', /(衣料|服|靴|アパレル|洋服)/, '衣類に関する語句'], ['食費', /(スーパー|食品|食料|レストラン|飲食)/, '食品・飲食に関する語句']];
export function suggestCategory(text) { const input = String(text || ''); return CATEGORY_RULES.filter(([, regex]) => regex.test(input)).map(([category,,reason]) => value(category, 'ocr_rule', category === '食費' ? .5 : .78, reason)); }
export function draftReason({ category, vendor, paidDate } = {}) { const date = paidDate ? `${paidDate}に` : ''; const target = vendor ? `${vendor}へ` : ''; const dictionary = { '医療費': `子どもの診察・治療に関連して${date}${target}支払った医療費。`, '学校費': `子どもの学校生活に必要な教材・学校関連費用として${date}${target}支払った支出。`, '教育費': `子どもの学習に必要な教育関連費用として${date}${target}支払った支出。`, '保育費': `子どもの保育に必要な費用として${date}${target}支払った支出。`, '習い事': `子どもの習い事・学習活動に必要な費用として${date}${target}支払った支出。`, '交通費': `子どもの移動に関連して${date}${target}支払った交通費。` }; return value(dictionary[category] || `子どもに関する支出として${date}${target}支払った費用。`, 'ocr_rule', .55, 'OCR抽出値と費目ルールによる事実説明の下書き'); }
export function extractSuggestions(text) { const dates = extractDateCandidates(text); const amounts = extractAmountCandidates(text); const vendors = extractVendorCandidates(text); const categories = suggestCategory(text); const category = categories[0]?.value || ''; return { dates, amounts, vendors, categories, reasons: [draftReason({ category, vendor: vendors[0]?.value, paidDate: dates[0]?.value })] }; }
