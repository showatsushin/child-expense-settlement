import { DEFAULT_CHILDREN, createEvidenceDocument, sanitizeExpenseRecords } from './models.js';
import { migratePhase1Data, SCHEMA_VERSION } from './migrations.js';

export const namespaceForUser = (userId) => `child-expense-settlement:${encodeURIComponent(userId)}:`;
const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; } };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
export function databaseNameForUser(userId) { return `child-expense-settlement:${encodeURIComponent(userId)}`; }
function databaseName(userId) { return databaseNameForUser(userId); }
function openDb(userId) { return new Promise((resolve, reject) => { const request = indexedDB.open(databaseName(userId), 1); request.onupgradeneeded = () => request.result.createObjectStore('files'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }

export function createUserStorage(userId) {
  if (!userId) throw new Error('認証済みユーザーIDが必要です。');
  const root = namespaceForUser(userId); const keys = { records:`${root}records.v2`, evidences:`${root}evidences.v2`, children:`${root}children.v2`, history:`${root}knowledge-history.v1`, schema:`${root}schemaVersion` };
  const saveFile = async (id, file) => { const db = await openDb(userId); return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); };
  const getFile = async (id) => { const db = await openDb(userId); return new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);}); };
  const deleteFile = async (id) => { const db = await openDb(userId); return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); };
  return {
    userId, loadMigratedState: () => migratePhase1Data({ records:read(keys.records,[]), evidences:read(keys.evidences,[]), children:read(keys.children,DEFAULT_CHILDREN), schemaVersion:Number(localStorage.getItem(keys.schema)||SCHEMA_VERSION) }),
    saveMigratedState: (state) => { write(keys.records,state.records);write(keys.evidences,state.evidences);write(keys.children,state.children);localStorage.setItem(keys.schema,String(SCHEMA_VERSION)); },
    loadKnowledgeHistory: () => { try { const value = JSON.parse(localStorage.getItem(keys.history)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } },
    saveKnowledgeHistory: (value) => localStorage.setItem(keys.history, JSON.stringify(value && typeof value === 'object' ? value : {})),
    saveFile, getFile, deleteFile,
  };
}
