import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDateCandidates, extractAmountCandidates, suggestCategory, extractSuggestions } from '../src/ocr-extract.js';
import { findPotentialDuplicates } from '../src/duplicates.js';
import { migratePhase1Data, SCHEMA_VERSION } from '../src/migrations.js';
import { buildWorkbookData, buildWordDocumentModel } from '../src/output-models.js';

test('OCR候補から日本語・西暦・令和の日付を抽出する', () => { const dates = extractDateCandidates('2026年8月12日\nR8.8.13'); assert.deepEqual(dates.map((x) => x.value), ['2026-08-12', '2026-08-13']); });
test('OCR候補は合計近傍の金額を優先する', () => { const amounts = extractAmountCandidates('商品 99円\n合計 12,800円\n預り 20,000円'); assert.equal(amounts[0].value, 12800); });
test('費目ルールは医療語句を医療費候補にする', () => { const result = suggestCategory('さくらクリニック 診療費'); assert.deepEqual(result[0], { value: '医療費', source: 'ocr_rule', confidence: .78, reason: '医療機関・薬局に関する語句' }); });
test('OCR候補はsourceとconfidenceを持つ', () => { const result = extractSuggestions('○○医院\n2026/08/12\n合計 1,200円'); assert.equal(result.dates[0].source, 'ocr'); assert.equal(result.categories[0].source, 'ocr_rule'); });
test('Phase 1データをOCR封筒付きschema v2へmigrationする', () => { const state = migratePhase1Data({ records: [{ paidDate: '2026-01-01' }], evidences: [{ id:'e', evidenceNumber:'E-001', fileName:'a.jpg' }], children:[{id:'child-1',name:'子1'}] }); assert.equal(state.schemaVersion,SCHEMA_VERSION); assert.equal(state.evidences[0].ocr.status,'not_started'); });
test('重複候補は同日・同額・支払先類似で警告する', () => { const r = { id:'old',paidDate:'2026-08-12',amount:{value:12800},vendor:{value:'さくらクリニック'} }; assert.equal(findPotentialDuplicates({paidDate:'2026-08-12',amount:12800,vendor:'さくらクリニック本院'},[r]).length,1); });
test('Excelデータ生成は3シート用の配列を返す', () => { const data=buildWorkbookData([{id:'r',evidenceIds:['e'],amount:{value:100},childId:{value:'c'},category:{value:'医療費'}}],[{id:'e',evidenceNumber:'E-001',fileName:'a.jpg',ocr:{status:'completed'}}],[{id:'c',name:'子1'}]); assert.equal(data.settlement[0][0],'証拠番号'); assert.equal(data.evidence[1][0],'E-001'); assert.equal(data.summary[1][1],100); });
test('Word用document modelは注意書きと明細を含む', () => { const data=buildWordDocumentModel([{evidenceIds:[],amount:{value:100},childId:{value:''},category:{value:'医療費'},vendor:{value:'医院'},otherBurdenAmount:50,reason:{value:'理由'}}],[],[],'全期間'); assert.match(data.disclaimer,/法的判断/); assert.equal(data.rows.length,1); });
