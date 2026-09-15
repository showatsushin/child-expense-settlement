import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diagnoseStoredData } from '../src/data-diagnostics.js';

function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values)); const calls = { get:0, set:0, remove:0 };
  return { get length() { return data.size; }, key(index) { return [...data.keys()][index] ?? null; }, getItem(key) { calls.get += 1; return data.has(key) ? data.get(key) : null; }, setItem() { calls.set += 1; throw new Error('diagnostic must not write localStorage'); }, removeItem() { calls.remove += 1; throw new Error('diagnostic must not remove localStorage'); }, calls };
}

function fakeIndexedDb(databases) {
  const transactions = [];
  return { transactions, async databases() { return databases.map(({ name }) => ({ name })); }, open(name) { const request = {}; queueMicrotask(() => { const item = databases.find((entry) => entry.name === name); request.result = { objectStoreNames:{ contains:(store) => store === 'files' && item.hasFiles !== false }, transaction(store, mode) { transactions.push({ name, store, mode }); return { objectStore:() => ({ count:() => { const count = {}; queueMicrotask(() => { count.result = item.count; count.onsuccess?.(); }); return count; } }) }; }, close() {} }; request.onsuccess?.(); }); return request; } };
}

test('diagnostic detects legacy and other-user namespaces without exposing record contents', async () => {
  const storage = memoryStorage({
    'child-expense-settlement:current-user:records.v2': JSON.stringify([{ secret:'current record' }]), 'child-expense-settlement:current-user:evidences.v2': JSON.stringify([{ secret:'current evidence' }]), 'child-expense-settlement:current-user:children.v2': JSON.stringify([{ name:'private child' }]), 'child-expense-settlement:current-user:schemaVersion': '3',
    'ces.records.v1': JSON.stringify([{ secret:'legacy record' }, { secret:'legacy record 2' }]), 'ces.evidences.v1': JSON.stringify([{ secret:'legacy evidence' }]), 'ces.children.v1': JSON.stringify([{ name:'legacy child' }]), 'ces.schemaVersion': '2',
    'child-expense-settlement:other-user-abcdef:records.v2': JSON.stringify([{ secret:'other record' }]), 'child-expense-settlement:other-user-abcdef:evidences.v2': JSON.stringify([{ secret:'other evidence' }]), 'child-expense-settlement:other-user-abcdef:children.v2': JSON.stringify([]), 'child-expense-settlement:other-user-abcdef:schemaVersion': '3',
  });
  const indexedDb = fakeIndexedDb([{ name:'child-expense-settlement', count:2 }, { name:'child-expense-settlement:current-user', count:1 }, { name:'child-expense-settlement:other-user-abcdef', count:4 }]);
  const result = await diagnoseStoredData({ userId:'current-user', storage, indexedDb });
  assert.equal(result.current.records.count, 1); assert.equal(result.legacy.records.count, 2); assert.equal(result.otherNamespaces.length, 1); assert.equal(result.otherNamespaces[0].userIdSuffix, '…abcdef'); assert.equal(result.databases.entries.find((entry) => entry.kind === 'legacy').fileCount, 2);
  assert.ok(result.findings.some((entry) => entry.code === 'legacy_records')); assert.ok(result.findings.some((entry) => entry.code === 'other_user_records')); assert.ok(result.findings.some((entry) => entry.code === 'legacy_files'));
  assert.equal(JSON.stringify(result).includes('legacy record'), false); assert.equal(JSON.stringify(result).includes('private child'), false); assert.equal(storage.calls.set, 0); assert.equal(storage.calls.remove, 0); assert.ok(indexedDb.transactions.every((entry) => entry.mode === 'readonly'));
});

test('diagnostic reports no legacy signal when all known stores are empty', async () => {
  const storage = memoryStorage({ 'child-expense-settlement:current-user:records.v2':'[]', 'child-expense-settlement:current-user:evidences.v2':'[]' });
  const result = await diagnoseStoredData({ userId:'current-user', storage, indexedDb:fakeIndexedDb([{ name:'child-expense-settlement:current-user', count:0 }]) });
  assert.ok(result.findings.some((entry) => entry.code === 'none_found'));
});

test('diagnostic source and UI contain no storage or IndexedDB write operations', () => {
  const source = readFileSync(new URL('../src/data-diagnostics.js', import.meta.url), 'utf8'); const ui = readFileSync(new URL('../data-diagnostics-ui.js', import.meta.url), 'utf8');
  for (const forbidden of ['setItem(', 'removeItem(', '.put(', '.delete(', '.clear(', "'readwrite'", '"readwrite"']) { assert.equal(source.includes(forbidden), false, `${forbidden} must not appear in diagnostic logic`); assert.equal(ui.includes(forbidden), false, `${forbidden} must not appear in diagnostic UI`); }
  assert.match(ui, /過去データを診断/); assert.match(ui, /診断結果をコピー/);
});
