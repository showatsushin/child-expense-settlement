import { auth } from './src/auth-gate.js';
import { diagnoseStoredData } from './src/data-diagnostics.js';

const countText = (summary) => summary.valid === false ? '形式を確認できません' : `${summary.count}件`;
const blobText = (entry) => entry.fileCount === null ? 'files storeなし' : entry.available ? `${entry.fileCount}件` : '確認できません';

function textFor(result) {
  const lines = [
    '過去データ診断結果（データの変更・削除は行っていません）',
    `現在のユーザー: ${result.currentUserIdSuffix}`,
    `現在データ: 登録 ${countText(result.current.records)} / Evidence ${countText(result.current.evidences)} / 子ども ${countText(result.current.children)} / schema ${result.current.schemaVersion.value ?? 'なし'}`,
    `旧共通領域: 登録 ${countText(result.legacy.records)} / Evidence ${countText(result.legacy.evidences)} / 子ども ${countText(result.legacy.children)} / schema ${result.legacy.schemaVersion.value ?? 'なし'}`,
    `別ユーザーIDの保存データ: ${result.otherNamespaces.length}件検出`,
  ];
  result.otherNamespaces.forEach((entry) => lines.push(`- ${entry.userIdSuffix}: 登録 ${countText(entry.data.records)} / Evidence ${countText(entry.data.evidences)} / schema ${entry.data.schemaVersion.value ?? 'なし'}`));
  if (result.databases.available) { lines.push('原本ファイル領域:'); result.databases.entries.forEach((entry) => lines.push(`- ${entry.database}: ${blobText(entry)}`)); }
  else lines.push('原本ファイル領域: このブラウザではDB一覧を確認できません');
  lines.push('判定:'); result.findings.forEach((finding) => lines.push(`- ${finding.message}`));
  return lines.join('\n');
}

function setup() {
  const header = document.querySelector('#dataProtectionActions');
  if (!header || document.querySelector('#diagnoseStoredData')) return;
  const panel = document.createElement('section'); panel.className = 'data-diagnostics';
  panel.innerHTML = '<button id="diagnoseStoredData" type="button">過去データを診断</button><button id="copyDiagnosticResult" type="button" hidden>診断結果をコピー</button><div id="diagnosticStatus" class="data-diagnostics-status" role="status"></div><pre id="diagnosticResult" class="data-diagnostics-result" hidden></pre>';
  const style = document.createElement('style'); style.textContent = '.data-diagnostics{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:8px}.data-diagnostics-status{width:100%;font-size:12px;color:#17603e}.data-diagnostics-result{width:100%;max-width:680px;max-height:280px;overflow:auto;margin:0;padding:10px;border:1px solid #b8d4db;border-radius:8px;background:#f5fbfc;white-space:pre-wrap;font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:#24404b}.data-diagnostics-error{color:#9d302c}'; document.head.append(style);
  header.append(panel);
  const diagnose = panel.querySelector('#diagnoseStoredData'); const copy = panel.querySelector('#copyDiagnosticResult'); const status = panel.querySelector('#diagnosticStatus'); const output = panel.querySelector('#diagnosticResult'); let shareText = '';
  diagnose.addEventListener('click', async () => {
    diagnose.disabled = true; copy.hidden = true; output.hidden = true; status.className = 'data-diagnostics-status'; status.textContent = '保存データを確認しています…';
    try { const session = await auth.getSession(); const result = await diagnoseStoredData({ userId:session?.user?.id }); shareText = textFor(result); output.textContent = shareText; output.hidden = false; copy.hidden = false; status.textContent = '診断が完了しました。この診断ではデータの変更・削除は行いません。'; }
    catch (error) { status.className = 'data-diagnostics-status data-diagnostics-error'; status.textContent = `診断できませんでした: ${error.message || error}`; }
    finally { diagnose.disabled = false; }
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareText); status.textContent = '診断結果をコピーしました。'; }
    catch { status.className = 'data-diagnostics-status data-diagnostics-error'; status.textContent = 'コピーできませんでした。表示内容を選択してコピーしてください。'; }
  });
}

if (window.receiptApp) setup(); else window.addEventListener('receipt-app-ready', setup, { once:true });
