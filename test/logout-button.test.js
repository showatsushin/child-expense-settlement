import test from 'node:test';
import assert from 'node:assert/strict';
import { wireLogoutButton } from '../src/logout-button.js';

function fakeButton() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    click() { return listeners.get('click')?.(); },
    listenerCount(type) { return listeners.has(type) ? 1 : 0; },
  };
}

test('logout click invokes the existing logout exactly once', async () => {
  const button = fakeButton(); let calls = 0;
  wireLogoutButton(button, async () => { calls += 1; });
  await button.click();
  assert.equal(calls, 1);
  assert.equal(button.listenerCount('click'), 1);
});

test('logout listener preserves logout rejection', async () => {
  const button = fakeButton(); const failure = new Error('sign out failed');
  wireLogoutButton(button, async () => { throw failure; });
  await assert.rejects(button.click(), failure);
});

test('wiring logout does not attach handlers to other header buttons', () => {
  const logoutButton = fakeButton(); const excelButton = fakeButton();
  wireLogoutButton(logoutButton, async () => {});
  assert.equal(logoutButton.listenerCount('click'), 1);
  assert.equal(excelButton.listenerCount('click'), 0);
});
