import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestReasons, REASON_TEMPLATES } from '../src/services/expenseSuggestion.js';
import { sourced } from '../src/models.js';

const forbidden = /(養育費として当然認められる|法的に負担義務がある|相手方が支払うべき|裁判所で認められる|必ず清算対象となる|法律上必要である)/;

test('医療費テンプレートは指定の簡潔な事実説明を返す', () => {
  assert.equal(REASON_TEMPLATES['医療費'].concise, '子どもの診察・治療に伴い発生した医療費。');
  assert.equal(suggestReasons({ category: '医療費' })[0].value, REASON_TEMPLATES['医療費'].concise);
});

test('教育費テンプレートを独立マスターから返す', () => {
  assert.equal(suggestReasons({ category: '教育費' })[0].value, '子どもの学習・教育に必要な費用として支出。');
});

test('標準文は入力済みの支払日と支払先だけを使う', () => {
  const standard = suggestReasons({ category: '医療費', paidDate: '2026-09-10', vendor: '○○クリニック' })[1];
  assert.equal(standard.value, '2026-09-10、子どもの診察・治療に伴い、○○クリニックへ支払った医療費。');
  assert.deepEqual(standard.basis, ['category: 医療費', 'paidDate: 2026-09-10', 'vendor: ○○クリニック']);
});

test('事実が不足しても未定義の支払先・日付を創作しない', () => {
  const candidates = suggestReasons({ category: '交通費' });
  assert.equal(candidates.length, 3);
  assert.ok(candidates.every((candidate) => !/undefined|null|へ支払った/.test(candidate.value)));
});

test('簡潔・標準・詳細の候補と出所・根拠を保持する', () => {
  const candidates = suggestReasons({ category: '食費' });
  assert.deepEqual(candidates.map((candidate) => candidate.style), ['concise', 'standard', 'detailed']);
  assert.ok(candidates.every((candidate) => candidate.source === 'template' && candidate.confidence === 1));
  assert.deepEqual(candidates[0].basis, ['category: 食費']);
});

test('候補には禁止された法的判断表現を含めない', () => {
  const categories = Object.keys(REASON_TEMPLATES);
  for (const category of categories) for (const candidate of suggestReasons({ category, vendor: '架空店', paidDate: '2026-09-10' })) assert.doesNotMatch(candidate.value, forbidden);
});

test('候補反映後の人による修正はmanual出所へ移る', () => {
  const proposed = sourced('子どもの診察・治療に伴い発生した医療費。', 'template', 1);
  const edited = sourced(`${proposed.value} 領収書を確認。`, 'manual', null);
  assert.equal(proposed.source, 'template'); assert.equal(edited.source, 'manual');
});