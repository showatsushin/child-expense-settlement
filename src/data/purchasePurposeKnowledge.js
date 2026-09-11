// Canonical, user-confirmed purchase-purpose material.  This is deliberately
// separate from UI labels and from the product-name matching helper.
export const PURCHASE_PURPOSE_KNOWLEDGE_VERSION = 1;

export const PURCHASE_PURPOSE_KNOWLEDGE = Object.freeze([
  {
    key: 'drinking_water', category: '飲料水',
    aliases: ['飲料水', '水', 'ミネラルウォーター', 'いろはす', 'ペットボトル水'],
    purposeFacts: ['本人用飲料水として購入', '問題行為で飲料水がなくなるため補充'],
    authorityFacts: [], separationFacts: ['母親分は別購入・別管理'], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'rehabilitation_training', category: 'リハビリ・機能訓練用品',
    aliases: ['絵本', 'シール', 'シールブック', 'シール遊び', 'パズル', '折り紙', 'お絵かき', '玩具'],
    purposeFacts: ['脳症後のリハビリ', '機能回復', '手指運動', '巧緻性', '注意・集中', '眼と手の協働', '視覚認知への刺激'],
    authorityFacts: ['医師から使用するよう指示あり'], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'food', category: '食料品', aliases: ['クッキー', '食品', '食料品', 'お菓子'],
    purposeFacts: ['治療に伴う食欲増進等への対応', '空腹による症状悪化・問題行動への対応'],
    authorityFacts: ['医師・看護師長の許可あり', '持込可能食品'], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'medication_aid', category: '服薬補助用品', aliases: ['服薬ゼリー', '服薬用ゼリー', 'お薬ゼリー', '服薬補助ゼリー'],
    purposeFacts: ['服薬負担軽減', '確実な服薬', '苦みの軽減'], authorityFacts: [], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'bathing_aid', category: '入浴補助用品', aliases: ['バスボム', '入浴剤'],
    purposeFacts: ['入浴への抵抗感軽減', '入浴促進', '入浴時パニックへの対応', '他害・自傷への対応'], authorityFacts: [], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'recovery_entertainment', category: '療養・介助用品', aliases: ['DVD', 'DVDソフト', '映像ソフト'],
    purposeFacts: ['不安軽減', '情緒安定', '気分転換'], authorityFacts: ['看護師・カウンセラーからの勧め'], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'mask_hygiene', category: '衛生用品', aliases: ['マスク', '小児用マスク'],
    purposeFacts: ['院内着用義務への対応'], authorityFacts: [], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'bandage_hygiene', category: '衛生用品', aliases: ['絆創膏', 'ばんそうこう'],
    purposeFacts: ['自傷による傷の保護', '傷をかきむしる行為への対応'], authorityFacts: [], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'general_hygiene', category: '衛生用品', aliases: [],
    purposeFacts: ['入浴', '清潔保持'], authorityFacts: [], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'storage', category: '収納用品', aliases: ['収納', '収納用品', 'ケース', 'ボックス'],
    purposeFacts: ['環境変化への戸惑い軽減', '衣類・薬・オムツ・日用品等の整理保管', '自宅と同様の整理方法維持'], authorityFacts: [], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
  {
    key: 'companion_bedding', category: '付き添い寝具レンタル', aliases: ['付き添い寝具', '寝具レンタル'],
    purposeFacts: ['衛生管理', '汚損時の交換可能性'], authorityFacts: [], separationFacts: [], notes: [],
    source: 'user_confirmed_document', version: PURCHASE_PURPOSE_KNOWLEDGE_VERSION,
  },
]);

export const purchasePurposeKnowledgeByKey = (key) => PURCHASE_PURPOSE_KNOWLEDGE.find((entry) => entry.key === key) || null;
