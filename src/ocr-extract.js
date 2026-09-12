const value = (candidate, source, confidence, reason) => ({ value: candidate, source, confidence, reason });
const clean = (text) => String(text || '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();

export function extractDateCandidates(text) {
  const candidates = new Set(); const normalized = String(text || '');
  const addDate = (year, month, day) => { const date = new Date(Date.UTC(year, month - 1, day)); if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) candidates.add(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`); };
  for (const match of normalized.matchAll(/(20\d{2}|19\d{2})\s*(?:\/|\-|年|\.)\s*(\d{1,2})\s*(?:\/|\-|月|\.)\s*(\d{1,2})/g)) addDate(Number(match[1]), Number(match[2]), Number(match[3]));
  for (const match of normalized.matchAll(/R\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})/gi)) addDate(2018 + Number(match[1]), Number(match[2]), Number(match[3]));
  return [...candidates].slice(0, 3).map((item) => value(item, 'ocr', .82, '暦として成立するOCR日付'));
}

export function extractAmountCandidates(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean); const result = []; const seen = new Set();
  lines.forEach((line, index) => { const match = line.match(/(?:合計|総額|お支払額|領収金額|請求額|現計|TOTAL)[^\d]{0,12}([¥￥]?\s*[\d,]+(?:\.\d+)?)/i) || ((/合計|総額|TOTAL/i.test(lines[index - 1] || '') && !/(?:預り|預かり|釣|支払|カード|現金)/i.test(line)) && line.match(/([¥￥]?\s*[\d,]+(?:\.\d+)?)/)); if (match) { const amount = Number(match[1].replace(/[^\d.]/g, '')); const noise = /(税率|%|点数|番号|TEL|電話|お釣り|釣銭|預り|預かり)/i.test(line); if (amount > 0 && !noise && !seen.has(amount)) { seen.add(amount); const footer = index >= Math.max(0, lines.length - 8); result.push({ ...value(amount, 'ocr', footer ? .93 : .86, footer ? 'レシート下部の合計等の近傍にある金額' : '合計等の近傍にある金額'), score: (footer ? 3 : 2) + Math.min(amount / 100000, 1) }); } } });
  return result.sort((a, b) => b.score - a.score || b.value - a.value).slice(0, 3).map(({ score, ...candidate }) => candidate);
}

const phonePattern = /(?:\+81[-\s]?)?(?:0\d{1,4}[-\s]?)?\d{1,4}[-\s]?\d{3,4}|0120[-\s]?\d{3}[-\s]?\d{3}/;
const addressPattern = /(?:〒?\d{3}[-−]?\d{4}|都|道|府|県|市|区|町|村|丁目|番地|号|TEL|電話|FAX|https?:|www\.)/i;
const brandPattern = /(セブン[-‐‑–—―]?イレブン|ローソン|ファミリーマート|イオン|イトーヨーカドー|マツモトキヨシ)/i;

export function extractMerchantCandidates(text) {
  const lines = String(text || '').split(/\r?\n/).map(clean)
    .filter((line) => line.length >= 2 && line.length <= 80 && !phonePattern.test(line) && !addressPattern.test(line));
  const keyword = /(株式会社|有限会社|医院|クリニック|薬局|病院|店|商店|スーパー|学園|学校|保育園|幼稚園|診療所|センター)/;
  const raw = lines.filter((line) => keyword.test(line) || brandPattern.test(line) || /[ァ-ヶー]{3,}/.test(line)).slice(0, 6);
  const seen = new Set(); const candidates = [];
  const push = (display, brand = '', branch = '', confidence = .55, reason = '購入店らしいOCR行') => { const key = display.normalize('NFKC'); if (!display || seen.has(key)) return; seen.add(key); candidates.push({ brand, branch, displayName: display, value: display, source: 'ocr', confidence, reason }); };
  raw.forEach((line, index) => { const brand = line.match(brandPattern)?.[0] || ''; const next = raw[index + 1] || ''; const branch = brand && next && next !== brand && !brandPattern.test(next) ? next : ''; push(branch ? `${brand} ${branch}` : line, brand, branch, brand ? .8 : .6, brand ? 'チェーン名と原文の店舗・施設名' : '購入店らしいOCR行'); push(line, brand, '', brand ? .74 : .58, 'OCR原文の購入店候補'); });
  return candidates.slice(0, 3);
}

export function extractVendorCandidates(text) {
  return extractMerchantCandidates(text).map(({ brand, branch, displayName, ...candidate }) => candidate);
}

const CATEGORY_RULES = [['医療費', /(病院|医院|クリニック|薬局|診療|処方|医療|歯科)/, '医療機関・薬局に関する語句'], ['学校費', /(学校|教材|PTA|学用品|制服|授業料)/, '学校・教材に関する語句'], ['教育費', /(教育|授業|参考書|教材)/, '教育に関する語句'], ['保育費', /(保育園|幼稚園|こども園)/, '保育施設に関する語句'], ['習い事', /(塾|スクール|教室|レッスン|習い事)/, '学習塾・教室に関する語句'], ['交通費', /(電車|バス|タクシー|運賃|乗車)/, '交通に関する語句'], ['衣類', /(衣料|服|靴|アパレル|洋服)/, '衣類に関する語句'], ['食費', /(スーパー|食品|食料|レストラン|飲食)/, '食品・飲食に関する語句']];
export function suggestCategory(text) { const input = String(text || ''); return CATEGORY_RULES.filter(([, regex]) => regex.test(input)).map(([category,,reason]) => value(category, 'ocr_rule', category === '食費' ? .5 : .78, reason)); }
export function draftReason({ category, vendor, paidDate } = {}) { const date = paidDate ? `${paidDate}に` : ''; const target = vendor ? `${vendor}へ` : ''; const dictionary = { '医療費': `子どもの診察・治療に関連して${date}${target}支払った医療費。`, '学校費': `子どもの学校生活に必要な教材・学校関連費用として${date}${target}支払った支出。`, '教育費': `子どもの学習に必要な教育関連費用として${date}${target}支払った支出。`, '保育費': `子どもの保育に必要な費用として${date}${target}支払った支出。`, '習い事': `子どもの習い事・学習活動に必要な費用として${date}${target}支払った支出。`, '交通費': `子どもの移動に関連して${date}${target}支払った交通費。` }; return value(dictionary[category] || `子どもに関する支出として${date}${target}支払った費用。`, 'ocr_rule', .55, 'OCR抽出値と費目ルールによる事実説明の下書き'); }
export function extractSuggestions(text) { const dates = extractDateCandidates(text); const amounts = extractAmountCandidates(text); const vendors = extractVendorCandidates(text); const categories = suggestCategory(text); const category = categories[0]?.value || ''; return { dates, amounts, vendors, categories, reasons: [draftReason({ category, vendor: vendors[0]?.value, paidDate: dates[0]?.value })] }; }
