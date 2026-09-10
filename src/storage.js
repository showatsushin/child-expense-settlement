import { DEFAULT_CHILDREN, sanitizeExpenseRecords, createEvidenceDocument } from './models.js';
import { migratePhase1Data, SCHEMA_VERSION } from './migrations.js';

const KEYS = { records: 'ces.records.v1', evidences: 'ces.evidences.v1', children: 'ces.children.v1', schemaVersion: 'ces.schemaVersion' };
const DB_NAME = 'child-expense-settlement'; const STORE = 'files';

function safeRead(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; }
}
function safeWrite(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

export const storage = {
  loadRecords: () => sanitizeExpenseRecords(safeRead(KEYS.records, [])), saveRecords: (items) => safeWrite(KEYS.records, items),
  loadEvidences: () => safeRead(KEYS.evidences, []).filter((item) => item && typeof item === 'object').map(createEvidenceDocument), saveEvidences: (items) => safeWrite(KEYS.evidences, items),
  loadChildren: () => safeRead(KEYS.children, DEFAULT_CHILDREN), saveChildren: (items) => safeWrite(KEYS.children, items),
  loadMigratedState: () => migratePhase1Data({ records: safeRead(KEYS.records, []), evidences: safeRead(KEYS.evidences, []), children: safeRead(KEYS.children, DEFAULT_CHILDREN), schemaVersion: Number(localStorage.getItem(KEYS.schemaVersion) || 1) }),
  saveMigratedState: (state) => { safeWrite(KEYS.records, state.records); safeWrite(KEYS.evidences, state.evidences); safeWrite(KEYS.children, state.children); localStorage.setItem(KEYS.schemaVersion, String(SCHEMA_VERSION)); },
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function saveFile(id, file) { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(file, id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
export async function getFile(id) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(STORE).objectStore(STORE).get(id); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); }); }
export async function deleteFile(id) { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
