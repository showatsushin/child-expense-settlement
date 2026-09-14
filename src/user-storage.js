import { DEFAULT_CHILDREN, createEvidenceDocument, sanitizeExpenseRecords } from './models.js';
import { migratePhase1Data, SCHEMA_VERSION } from './migrations.js';
import { normalizeConfirmedHistory } from './confirmed-history.js';

export const namespaceForUser = (userId) => `child-expense-settlement:${encodeURIComponent(userId)}:`;
const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; } };
const readObject = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback; } catch { return fallback; } };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
export function databaseNameForUser(userId) { return `child-expense-settlement:${encodeURIComponent(userId)}`; }
export function confirmedHistoryKeyForUser(userId) { return `${namespaceForUser(userId)}confirmedHistory.v1`; }
function databaseName(userId) { return databaseNameForUser(userId); }
function openDb(userId) { return new Promise((resolve, reject) => { const request = indexedDB.open(databaseName(userId), 1); request.onupgradeneeded = () => request.result.createObjectStore('files'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }

export function createUserStorage(userId) {
  if (!userId) throw new Error('認証済みユーザーIDが必要です。');
  const root = namespaceForUser(userId); const keys = { records:`${root}records.v2`, evidences:`${root}evidences.v2`, children:`${root}children.v2`, confirmedHistory:confirmedHistoryKeyForUser(userId), schema:`${root}schemaVersion` };
  const saveFile = async (id, file) => { const db = await openDb(userId); return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); };
  const getFile = async (id) => { const db = await openDb(userId); return new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);}); };
  const deleteFile = async (id) => { const db = await openDb(userId); return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); };
  const listFiles = async () => { const db = await openDb(userId); return new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').openCursor();const files=[];request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(files);return;}files.push({id:String(cursor.key),file:cursor.value});cursor.continue();};request.onerror=()=>reject(request.error);}); };
  const replaceFiles = async (files) => { const db = await openDb(userId); return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');const store=tx.objectStore('files');store.clear();for(const entry of files)store.put(entry.file,entry.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('原本ファイルの置換を中止しました。'));}); };
  const rawState = () => ({ records:read(keys.records,[]), evidences:read(keys.evidences,[]), children:read(keys.children,DEFAULT_CHILDREN), schemaVersion:Number(localStorage.getItem(keys.schema)||SCHEMA_VERSION) });
  const restoreRawLocalState = (before) => { for(const [key,value] of Object.entries(before)){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);} };
  const replaceBackupState = async (next) => {
    const localBefore={records:localStorage.getItem(keys.records),evidences:localStorage.getItem(keys.evidences),children:localStorage.getItem(keys.children),schema:localStorage.getItem(keys.schema)};
    const filesBefore=await listFiles();
    try { await replaceFiles(next.files); write(keys.records,next.records);write(keys.evidences,next.evidences);write(keys.children,next.children);localStorage.setItem(keys.schema,String(next.schemaVersion)); }
    catch(error){try{await replaceFiles(filesBefore);restoreRawLocalState(localBefore);}catch(rollbackError){throw new Error(`復元に失敗し、ロールバックにも失敗しました: ${rollbackError.message||rollbackError}`);}throw error;}
  };
  return {
    userId, loadMigratedState: () => migratePhase1Data(rawState()),
    saveMigratedState: (state) => { write(keys.records,state.records);write(keys.evidences,state.evidences);write(keys.children,state.children);localStorage.setItem(keys.schema,String(SCHEMA_VERSION)); },
    loadConfirmedHistory: () => normalizeConfirmedHistory(readObject(keys.confirmedHistory, {})),
    saveConfirmedHistory: (history) => write(keys.confirmedHistory, normalizeConfirmedHistory(history)),
    saveFile, getFile, deleteFile, listFiles, loadBackupState:rawState, replaceBackupState,
  };
}
