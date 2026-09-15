import { namespaceForUser, databaseNameForUser } from './user-storage.js';

const LEGACY = { records:'ces.records.v1', evidences:'ces.evidences.v1', children:'ces.children.v1', schemaVersion:'ces.schemaVersion', database:'child-expense-settlement' };
const RECORDS_KEY = /^child-expense-settlement:([^:]+):records\.v2$/;

function readArraySummary(storage, key) {
  const raw = storage.getItem(key);
  if (raw === null) return { exists:false, count:0, valid:true };
  try { const value = JSON.parse(raw); return { exists:true, count:Array.isArray(value) ? value.length : 0, valid:Array.isArray(value) }; }
  catch { return { exists:true, count:0, valid:false }; }
}

function readSchemaSummary(storage, key) { const value = storage.getItem(key); return { exists:value !== null, value:value === null ? null : String(value) }; }
function userIdFromRecordsKey(key) { const match = String(key || '').match(RECORDS_KEY); if (!match) return null; try { return decodeURIComponent(match[1]); } catch { return match[1]; } }

function namespaceSummary(storage, userId) {
  const root = namespaceForUser(userId);
  return { records:readArraySummary(storage, `${root}records.v2`), evidences:readArraySummary(storage, `${root}evidences.v2`), children:readArraySummary(storage, `${root}children.v2`), schemaVersion:readSchemaSummary(storage, `${root}schemaVersion`) };
}

function legacySummary(storage) { return { records:readArraySummary(storage, LEGACY.records), evidences:readArraySummary(storage, LEGACY.evidences), children:readArraySummary(storage, LEGACY.children), schemaVersion:readSchemaSummary(storage, LEGACY.schemaVersion) }; }
function matchingDatabaseName(name) { return name === LEGACY.database || String(name || '').startsWith(`${LEGACY.database}:`); }
function displayUserId(userId) { const value = String(userId || ''); return value ? `…${value.slice(-6)}` : '不明'; }

function databaseLabel(name, currentUserId) {
  if (name === LEGACY.database) return LEGACY.database;
  const encodedUserId = String(name).slice(`${LEGACY.database}:`.length); let userId;
  try { userId = decodeURIComponent(encodedUserId); } catch { userId = encodedUserId; }
  return `${LEGACY.database}:${userId === currentUserId ? '現在のユーザー' : displayUserId(userId)}`;
}

async function fileCount(indexedDb, name) {
  return new Promise((resolve) => {
    let request;
    try { request = indexedDb.open(name); } catch { resolve({ available:false, fileCount:null }); return; }
    request.onerror = () => resolve({ available:false, fileCount:null });
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('files')) { db.close(); resolve({ available:true, fileCount:null }); return; }
      let transaction;
      try { transaction = db.transaction('files', 'readonly'); } catch { db.close(); resolve({ available:false, fileCount:null }); return; }
      const count = transaction.objectStore('files').count();
      count.onsuccess = () => { db.close(); resolve({ available:true, fileCount:Number(count.result) || 0 }); };
      count.onerror = () => { db.close(); resolve({ available:false, fileCount:null }); };
    };
  });
}

async function databaseSummaries(indexedDb, currentUserId) {
  if (!indexedDb || typeof indexedDb.databases !== 'function') return { available:false, entries:[] };
  let databases;
  try { databases = await indexedDb.databases(); } catch { return { available:false, entries:[] }; }
  const names = [...new Set((Array.isArray(databases) ? databases : []).map((entry) => entry?.name).filter(matchingDatabaseName))];
  const entries = await Promise.all(names.map(async (name) => {
    const result = await fileCount(indexedDb, name);
    const kind = name === LEGACY.database ? 'legacy' : name === databaseNameForUser(currentUserId) ? 'current' : 'other';
    return { kind, database:databaseLabel(name, currentUserId), fileCount:result.fileCount, available:result.available };
  }));
  return { available:true, entries };
}

function findingsFor({ current, legacy, otherNamespaces, databases }) {
  const findings = [];
  if (legacy.records.count > 0) findings.push({ level:'high', code:'legacy_records', message:'過去の保存データが見つかりました。現在表示されていない登録データが残っている可能性があります。' });
  if (otherNamespaces.some((entry) => entry.data.records.count > 0)) findings.push({ level:'high', code:'other_user_records', message:'別のユーザーIDの保存データが見つかりました。' });
  if (databases.entries.some((entry) => entry.kind === 'legacy' && (entry.fileCount || 0) > 0)) findings.push({ level:'high', code:'legacy_files', message:'過去の原本ファイルが残っている可能性があります。' });
  const allKnownCountsAreZero = current.records.count === 0 && current.evidences.count === 0 && legacy.records.count === 0 && legacy.evidences.count === 0 && otherNamespaces.every((entry) => entry.data.records.count === 0 && entry.data.evidences.count === 0) && databases.available && databases.entries.every((entry) => !entry.fileCount);
  if (!findings.length && allKnownCountsAreZero) findings.push({ level:'info', code:'none_found', message:'このブラウザでは過去の保存データを確認できませんでした。別のPC・ブラウザ・保存場所を確認してください。' });
  if (!findings.length) findings.push({ level:'info', code:'no_high_signal', message:'過去データの強い残存兆候は見つかりませんでした。この診断ではデータの変更・削除は行いません。' });
  return findings;
}

export async function diagnoseStoredData({ userId, storage = globalThis.localStorage, indexedDb = globalThis.indexedDB } = {}) {
  if (!userId) throw new Error('診断するユーザーを確認できませんでした。');
  const current = namespaceSummary(storage, userId); const legacy = legacySummary(storage);
  const otherUserIds = [...new Set(Array.from({ length:storage.length }, (_, index) => userIdFromRecordsKey(storage.key(index))).filter((candidate) => candidate && candidate !== userId))];
  const otherNamespaces = otherUserIds.map((otherUserId) => ({ userIdSuffix:displayUserId(otherUserId), data:namespaceSummary(storage, otherUserId) }));
  const databases = await databaseSummaries(indexedDb, userId);
  return { formatVersion:1, currentUserIdSuffix:displayUserId(userId), current, legacy, otherNamespaces, databases, findings:findingsFor({ current, legacy, otherNamespaces, databases }) };
}
