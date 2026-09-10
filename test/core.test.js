import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOtherBurdenAmount, calculateOutstandingAmount, complementRate, nextEvidenceNumber } from '../src/calculations.js';
import { makeCsv } from '../src/export.js';
import { createExpenseRecord, sanitizeExpenseRecords } from '../src/models.js';

test('相手負担額は金額と負担率から決定論的に計算する', () => assert.equal(calculateOtherBurdenAmount(12345, 40), 4938));
test('未清算額は既払いを控除し、過払い時は0で保持する', () => { assert.equal(calculateOutstandingAmount(5000, 1250), 3750); assert.equal(calculateOutstandingAmount(5000, 6000), 0); });
test('負担率の補完は100%になる', () => { assert.equal(complementRate(35), 65); assert.equal(complementRate(120), 0); });
test('証拠番号は既存の最大番号から採番する', () => assert.equal(nextEvidenceNumber([{ evidenceNumber: 'E-002' }, { evidenceNumber: 'E-010' }, { evidenceNumber: 'invalid' }]), 'E-011'));
test('CSVはBOM、必要列、引用符エスケープを含む', () => { const r = createExpenseRecord({ paidDate:'2026-01-01', vendor:'A"店', amount:1000, evidenceIds:['e1'] }); const csv = makeCsv([r], new Map([['e1',{evidenceNumber:'E-001'}]]), new Map()); assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /証拠番号/); assert.match(csv, /"A""店"/); });
test('異常な保存データでもモデルは負担率などを安全な数値に戻す', () => { const r = createExpenseRecord({ amount: { value: 'bad', source: 'unknown' }, selfBurdenRate: 'oops' }); assert.equal(r.amount.source, 'manual'); assert.equal(r.selfBurdenRate, 0); });
test('将来の候補値はsourceとconfidenceを保持できる', () => { const r = createExpenseRecord({ reason: { value: '候補理由', source: 'ai', confidence: 0.7 } }); assert.deepEqual(r.reason, { value: '候補理由', source: 'ai', confidence: 0.7 }); });
test('保存データ復元時に配列以外や壊れた要素を除外する', () => { assert.deepEqual(sanitizeExpenseRecords('bad'), []); assert.equal(sanitizeExpenseRecords([null, { paidDate: '2026-01-01' }]).length, 1); });
