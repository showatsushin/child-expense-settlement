import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mobileUi = await readFile(new URL('../mobile-ui.js', import.meta.url), 'utf8');

test('モバイル用カメラ入力は背面カメラと画像形式を指定する', () => {
  assert.match(mobileUi, /id="camera" type="file" accept="image\/\*" capture="environment"/);
  assert.match(mobileUi, /id="picker" type="file" accept="image\/\*,\.pdf"/);
});

test('使い方と初回案内はユーザー名前空間の設定を利用する', () => {
  assert.match(mobileUi, /welcome-guide\.v1/);
  assert.match(mobileUi, /namespaceForUser\(userId\)/);
  assert.match(mobileUi, /次回から表示しない/);
});

test('モバイル表示はPCのドロップ領域を維持しつつ小幅で一列化する', () => {
  assert.match(mobileUi, /@media\(min-width:641px\)\{\.mobile-file-actions\{display:none\}\}/);
  assert.match(mobileUi, /@media\(max-width:640px\)\{\.drop\{display:none!important\}/);
  assert.match(mobileUi, /grid-template-columns:1fr!important/);
});