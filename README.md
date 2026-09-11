# 子ども関連支出 清算整理（Phase 1 ローカルPoC）

離婚調停前などの場面で、子どもに関する支出・立替経費を原本証拠と結び付けて整理し、相手負担想定額・未清算額を積算するローカルアプリです。法律上の結論や、養育費として認められるかどうかは判断しません。

## Phase 1の範囲

- JPG/JPEG/PNG/PDFの原本選択、ドラッグ＆ドロップ、画面内プレビュー
- 経費の登録、詳細表示、編集、削除、証拠番号（`E-001`形式）の自動採番
- 負担率からの相手負担想定額と未清算額の自動計算
- 対象児童・費目・区分・状態・期間によるフィルターと連動集計
- Windows Excel向けUTF-8 BOM付きCSV出力と、ブラウザ印刷用レイアウト

## 起動方法

依存関係はありません。`index.html` を最新ブラウザで開くか、PowerShellで次を実行して `http://localhost:8080` を開きます。

```powershell
python -m http.server 8080
```

テストは `npm test` で実行します（Node.js 18以上）。

## 保存場所と原本の扱い

- 経費明細、証拠メタデータ、対象児童マスターはブラウザの `localStorage` に保存します。
- 原本ファイル本体は同じブラウザ・同じ端末の `IndexedDB` に保存します。外部へ送信しません。
- IndexedDB / サイトデータをブラウザから削除すると、原本と登録データは削除されます。アプリ内に一括削除は設けていないため、ブラウザのサイトデータ削除画面で削除してください。
- 20MBを超える原本、または対応外の形式は登録できません。

## 未実装機能

OCR・AI・クラウド同期・認証・Google連携・Excel/Wordネイティブ出力・裁判所様式や法的判断は実装していません。対象児童は画面上で子1・子2の名称を変更できます（追加・削除はPhase 1の対象外です）。

## 将来のOCR / AI接続境界

`src/services/documentRecognition.js` と `src/services/expenseSuggestion.js` がProvider境界です。候補値は各主要項目の `{ value, source, confidence }` 構造として保持でき、人が保存して初めて確定値として扱う想定です。Phase 1のこれらのサービスは外部通信をせず、未実装結果のみ返します。

## 計算方針

相手負担想定額は `金額 × 相手負担率 / 100` を円単位で丸めます。未清算額は `相手負担想定額 − 既払い額` で、Phase 1では過払いの場合も表示・保存値を0円にします（既払い額そのものは保持します）。

## Phase 2 実用PoC

- 画像（JPG/JPEG/PNG）は、同梱した **Tesseract.js** と日本語学習データをブラウザ内で実行してOCRします。原本画像やOCR原文を外部送信しません。
- PDFは **PDF.js** でPDF内のテキストレイヤーを抽出します。画像だけで構成されたPDFへのOCRはPhase 2では未実装です。
- OCR結果は証拠の `ocr.rawText` として保持し、修正テキストは `ocr.correctedText` として分離します。候補をフォームへ反映しても登録はされず、人が保存して確定します。
- XLSX output now contains Settlement, Purchase Items, Category Summary, Evidence List, and Summary sheets; DOCX includes receipt and purchase-item rows with evidence numbers.
- Phase 1/2 saved data migrates safely to schema v3: each legacy ExpenseRecord becomes one receipt header with one item, retaining evidence numbers and original values.

Phase 2で追加したブラウザ用依存パッケージは `tesseract.js`、`@tesseract.js-data/jpn`、`@tesseract.js-data/eng`、`pdfjs-dist`、`xlsx`、`docx` です。`node_modules` を公開できるローカルHTTPサーバーから起動してください。例：`npx http-server -c-1`。
## Receipt items and evidence submission

Each ExpenseRecord now acts as a backward-compatible receipt header and can contain multiple purchase items. Every item has a submission-only category, purpose/necessity text, and a user-selected submission state: `included`, `excluded`, or `review`.

The printed receipt total, item total, and included-item claim total are separate values. A non-zero difference between the receipt total and item total is shown for review and is never corrected automatically.

Original JPG/JPEG/PNG/PDF files remain in the authenticated user's browser IndexedDB namespace. The submission view can print the settlement material and image originals together. PDF originals are explicitly listed as separate originals with an open link; they are not falsely described as embedded in the printout. ZIP export is not included.

CSV now provides receipt-summary.csv and receipt-items.csv. XLSX includes Settlement, Purchase Items, Category Summary, Evidence List, and Summary sheets. DOCX includes receipt and purchase-item rows with evidence numbers.

Device-local storage does not synchronize automatically when the device or browser changes. AI proposals use only the selected item's entered text and OCR excerpt; original files, PDFs, images, and the ledger are never sent. AI is a factual drafting aid only: it does not make legal decisions or determine whether an item should be submitted.
