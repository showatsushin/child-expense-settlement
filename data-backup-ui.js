import { BACKUP_FORMAT_VERSION, createBackupArchive, parseBackupArchive, restoreBackup } from './src/data-backup.js';
import { SCHEMA_VERSION } from './src/migrations.js';

const stamp = (date = new Date()) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '-');
const download = (blob, name) => { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); };
const countText = (manifest) => `登録データ: ${manifest.recordCount}件 / ReceiptItem: ${manifest.receiptItemCount || 0}件 / Evidence: ${manifest.evidenceCount}件 / 原本: ${manifest.originalFileCount}件`;

function setup() {
  const app = window.receiptApp; if (!app) return;
  const panel = document.createElement('section'); panel.className = 'data-protection'; panel.innerHTML = '<span>データ保全</span> <button id="backupAllData" type="button">全データをバックアップ</button> <button id="restoreBackupFile" type="button">バックアップから復元</button> <input id="restoreBackupInput" type="file" accept=".zip,application/zip" hidden><div id="backupRestoreStatus" class="data-protection-status" role="status"></div><div id="backupRestorePreview" class="data-protection-preview" hidden></div>';
  const style = document.createElement('style'); style.textContent = '.data-protection{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:8px}.data-protection span{font-size:12px;color:#55666f;font-weight:700}.data-protection-status{width:100%;font-size:12px;color:#17603e}.data-protection-preview{width:100%;padding:8px;border:1px solid #d1a554;background:#fff8e8;font-size:12px}.data-protection-preview button{margin-top:6px}.data-protection-error{color:#9d302c}'; document.head.append(style);
  document.querySelector('.top > div:last-child')?.append(panel);
  const status = panel.querySelector('#backupRestoreStatus'); const preview = panel.querySelector('#backupRestorePreview'); const input = panel.querySelector('#restoreBackupInput'); let selected = null;
  panel.querySelector('#backupAllData').addEventListener('click', async () => {
    status.className = 'data-protection-status'; status.textContent = 'バックアップを作成しています…';
    try { const result = await createBackupArchive({ storage:app.storage, appSchemaVersion:SCHEMA_VERSION }); download(result.archive, `child-expense-backup-${stamp()}.zip`); status.textContent = `${countText(result.manifest)} — バックアップ完了`; if (result.warnings.length) status.textContent += `（警告: ${result.warnings.join(' / ')}）`; }
    catch (error) { status.className = 'data-protection-status data-protection-error'; status.textContent = `バックアップに失敗しました: ${error.message || error}`; }
  });
  panel.querySelector('#restoreBackupFile').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; selected = null; preview.hidden = true; if (!file) return;
    status.className = 'data-protection-status'; status.textContent = 'バックアップを検証しています…';
    try { selected = await parseBackupArchive(file, { appSchemaVersion:SCHEMA_VERSION }); const manifest = selected.manifest; preview.innerHTML = `<div>バックアップ作成日時: ${manifest.createdAt}</div><div>${countText(manifest)}</div><div>backupFormatVersion: ${manifest.backupFormatVersion} / appSchemaVersion: ${manifest.appSchemaVersion}</div><button id="confirmRestoreBackup" type="button" class="warn">現在のデータへ復元する</button>`; preview.hidden = false; status.textContent = '内容を検証しました。復元はまだ実行されていません。'; }
    catch (error) { status.className = 'data-protection-status data-protection-error'; status.textContent = `復元できません: ${error.message || error}`; }
    finally { input.value = ''; }
  });
  preview.addEventListener('click', async (event) => {
    if (event.target.id !== 'confirmRestoreBackup' || !selected) return;
    if (!confirm('現在のデータへ復元します。現在のデータは先に緊急バックアップとしてダウンロードされ、その後完全に置換されます。続けますか？')) return;
    status.className = 'data-protection-status'; status.textContent = '現在のデータを緊急バックアップしています…';
    try { const emergency = await createBackupArchive({ storage:app.storage, appSchemaVersion:SCHEMA_VERSION }); if (emergency.warnings.length) throw new Error(`現在データの緊急バックアップに完全性警告があります: ${emergency.warnings.join(' / ')}`); download(emergency.archive, `child-expense-pre-restore-${stamp()}.zip`); status.textContent = '復元しています…'; const restored = await restoreBackup({ storage:app.storage, backup:selected, appSchemaVersion:SCHEMA_VERSION }); status.textContent = `復元完了: 登録データ ${restored.recordCount}件 / Evidence ${restored.evidenceCount}件 / 原本 ${restored.originalFileCount}件。再読み込みします。`; alert(status.textContent); window.location.reload(); }
    catch (error) { status.className = 'data-protection-status data-protection-error'; status.textContent = `復元に失敗しました。現在データはロールバックを試行しました: ${error.message || error}`; }
  });
}

if (window.receiptApp) setup(); else window.addEventListener('receipt-app-ready', setup, { once:true });
export { BACKUP_FORMAT_VERSION };
