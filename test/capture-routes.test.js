import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const phase2 = await readFile(new URL('../phase2.js', import.meta.url), 'utf8');

test('capture UI has distinct save-later and read-now routes', () => {
  assert.match(phase2, /id="saveCamera"/);
  assert.match(phase2, /id="readCamera"/);
  assert.match(phase2, /id="quickFile"/);
  assert.match(phase2, /id="readFile"/);
  assert.match(phase2, /capture\(event\.target\.files\?\.\[0\], \{ readNow: true \}\)/);
});

test('both routes store the original as unorganized before any optional reader execution', () => {
  assert.match(phase2, /saveUnorganizedEvidence/);
  assert.match(phase2, /if \(readNow\) await readActiveEvidence\(\)/);
});
