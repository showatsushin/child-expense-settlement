// Candidate-only guidance.  These entries never set ReceiptItem.taxRate on
// their own and are intentionally separate from purchase-purpose Knowledge.
export const TAX_RATE_KNOWLEDGE = Object.freeze([
  Object.freeze({
    key: 'beverage',
    matchingAliases: ['ミネラルウォーター', 'ペットボトル水', 'いろはす', '飲料水', 'お茶', 'ジュース', '水'],
    suggestedTaxRate: '8',
    basis: '飲食料品候補',
  }),
  Object.freeze({
    key: 'food',
    matchingAliases: ['たまごサンド', 'ポテトスナック', 'じゃがりこ', 'お菓子', 'クッキー', '食料品', 'たまご', '玉子', '卵', 'サンド', 'スナック', '食品'],
    suggestedTaxRate: '8',
    basis: '飲食料品候補',
  }),
  Object.freeze({
    key: 'hygiene_goods',
    matchingAliases: ['ボックスティッシュ', 'ウェットティッシュ', 'ティシュー', 'ティッシュ', 'ネピア', '鼻紙', 'マスク', 'ハンドソープ'],
    suggestedTaxRate: '10',
    basis: '非飲食料品候補',
  }),
]);
