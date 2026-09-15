import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('responsive toolbar keeps existing controls and routes each visual group to its dedicated container', () => {
  const phase2 = source('../phase2.js');
  const backup = source('../data-backup-ui.js');
  const diagnostics = source('../data-diagnostics-ui.js');
  const numbering = source('../submission-numbering-ui.js');
  const exportUi = source('../evidence-export.js');
  const mobile = source('../mobile-ui.js');

  for (const id of ['logout', 'xlsx', 'docx', 'print']) assert.match(phase2, new RegExp(`['\"]#${id}['\"]`));
  assert.match(phase2, /primaryActions|dataProtectionActions|submissionNumberingActions|accountActions/);
  assert.match(backup, /#dataProtectionActions/);
  assert.match(diagnostics, /#dataProtectionActions/);
  assert.match(numbering, /#submissionNumberingActions/);
  assert.match(exportUi, /#primaryActions/);
  assert.match(mobile, /#accountActions/);
});

test('responsive CSS protects narrow layouts without changing period-output IDs', () => {
  const css = source('../styles.css');
  const period = source('../period-export-ui.js');
  assert.match(css, /body\{overflow-x:hidden\}/);
  assert.match(css, /@media\(max-width:768px\)/);
  assert.match(css, /@media\(max-width:480px\)/);
  assert.match(css, /\.period-scoped-actions/);
  for (const id of ['periodExcelOutput', 'periodSubmissionOutput', 'periodNumberingReview']) assert.match(period, new RegExp(id));
});
