import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('OCR completion sends candidates to the ReceiptItem controller and removes receipt-level category and reason candidates', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  assert.match(phase2, /applyOcrCandidates/);
  assert.equal(phase2.includes("['category','費目',c.categories]"), false);
  assert.equal(phase2.includes("['reason','理由',c.reasons]"), false);
});

test('new records default the other burden rate to 100 and legacy reasons support candidates plus free text', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  assert.match(phase2, /const LEGACY_REASON_OPTIONS = \[[^\]]{100,}\]/);
  assert.match(phase2, /form\.selfRate\.value = 0/);
  assert.match(phase2, /form\.otherRate\.value = 100/);
  assert.match(phase2, /input\.setAttribute\('list', 'legacyReasonOptions'\)/);
  assert.match(phase2, /5候補から選択、または自由記載/);
});

test('submission output uses record-scoped buttons, page breaks, and no submission status display', () => {
  const phase2 = readFileSync(new URL('../phase2.js', import.meta.url), 'utf8');
  const exporter = readFileSync(new URL('../evidence-export.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(phase2, /dataset\.submissionRecord = receiptId/);
  assert.match(exporter, /record\.id === receiptId/);
  assert.match(exporter, /button\[data-submission-record\]/);
  assert.doesNotMatch(exporter, /submissionStatus|提出状態|提出状況/);
  assert.match(styles, /submission-settlement\{break-after:page/);
  assert.match(styles, /label:has\(\[data-field="submissionStatus"\]\)\{display:none\}/);
});

test('receipt items expose primary OCR application and human Knowledge selection, not AI purpose controls', () => {
  const items = readFileSync(new URL('../receipt-items.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(items, /applyOcrCandidates/);
  assert.match(items, /data-knowledge-key/);
  assert.match(items, /sourceExcerpt/);
  assert.match(items, /hasManualKnowledgeFields/);
  assert.match(items, /window\.confirm/);
  assert.doesNotMatch(items, /suggestAiItem/);
  assert.doesNotMatch(items, /data-category-proposal/);
  assert.doesNotMatch(html, /reason-suggestions\.js/);
});

test('item card places Knowledge before editable final fields and supports restore and auto-grow', () => {
  const items = readFileSync(new URL('../receipt-items.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  const cardMarkup = items.slice(items.indexOf('function row('), items.indexOf('function autoGrow('));
  assert.ok(cardMarkup.indexOf('item-basics') < cardMarkup.indexOf('knowledgeControl(item)'));
  assert.ok(cardMarkup.indexOf('knowledgeControl(item)') < cardMarkup.indexOf('item-edit-fields'));
  assert.match(items, /placeholder="候補から選択または自由入力"/);
  assert.match(items, /data-autogrow rows="8"/);
  assert.match(items, /Knowledge原文に戻す/);
  assert.match(items, /restoreKnowledgePurpose/);
  assert.match(items, /manual_override/);
  assert.match(items, /keepEditing/);
  assert.doesNotMatch(items, /readOnly|disabled/);
  assert.match(css, /textarea\[data-autogrow\]/);
});
