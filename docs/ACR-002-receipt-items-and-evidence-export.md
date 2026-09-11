# ACR-002: レシート購入品明細と提出用原本証拠

- Status: Accepted
- Date: 2026-09-11
- Scope: child-expense-settlement receipt / receipt item / evidence submission extension

## Context

従来の `ExpenseRecord` は1件の支出を記録できたが、1枚のレシートに複数の購入品が含まれる場合、商品ごとの種別、購入目的、提出状態を第三者が追跡できなかった。レシートに印字された合計額と、提出対象として利用者が選んだ商品の合計額も区別する必要がある。

## Decision

既存の `ExpenseRecord` を破壊的に置換せず、レシートヘッダとして拡張する方式を採用した。schemaVersionは3である。

```text
ExpenseRecord (receipt header)
  ├─ evidenceIds[]
  ├─ receiptTotalAmount
  └─ items[] (ReceiptItem)
       ├─ productName / quantity / unitPrice / amount
       ├─ category (提出整理用の種別)
       ├─ purpose
       └─ submissionStatus
```

既存の会計費目マスターは維持する。購入品の種別は、混在レシートの提出整理に使う別概念の小さなマスターであり、会計費目を置き換えない。

## Amount rules

- `receiptTotalAmount`: レシートに印字された総額。
- `itemTotalAmount`: `items[].amount` の合計。
- `claimTotalAmount`: `submissionStatus === included` の商品合計。

3つの金額は自動的に一致させない。レシート総額と商品明細合計の差額を画面で要確認として表示する。`excluded` と `review` は提出対象額へ含めない。

## Migration

旧データは1件のレシートヘッダと1件の購入品へ移行する。旧 `amount` を `receiptTotalAmount` と最初のitemの金額へ、旧 `reason` をitemの `purpose` へ移す。旧養育関連区分が明確に「対象外」の場合だけ `excluded`、明確に「対象」の場合だけ `included` とし、それ以外は推測せず `review` とする。既存証拠番号と `evidenceIds[]` は変更しない。

## Original evidence submission

原本は引き続き認証済みユーザーIDを含むブラウザ内IndexedDB名前空間だけに保存する。提出用ビューは、清算概要、レシート一覧、購入品明細、証拠番号順の原本を一体で印刷/PDF保存できる。

画像原本は印刷ビュー内へ表示する。PDF原本は完全埋込を保証せず、証拠番号・ファイル名・別添PDFを開くリンクとして明示する。添付済みとは表示しない。ZIPは実装しない。

## AI boundary

購入品のAI提案は既存の認証済みWorkers AI接続を使う。選択中の商品の商品名、商品種別、購入日、購入店、OCR抜粋、対象児童表示名、利用者が入力した補足事実だけを既存リクエストへ最小化して送る。原本画像、PDF、ファイル、`evidenceIds[]`、台帳全体、IndexedDB、負担率は送らない。

AI提案は目的文の下書きであり、法的判断、提出対象の確定、負担義務、入力にない医療者等の指示の創作を行わない。候補を採用すると `source: ai`、人が編集すると `source: manual` とする。ネットワーク失敗時はローカル候補を維持する。

## Verification record

- Frontend tests: 48 passed.
- Worker tests: 12 passed.
- Total tests: 60 passed.
- Production build succeeded.
- Pages workflow `34551680398` succeeded for commit `2b37425`.
- Production frontend, receipt-items.js, evidence-export.js, and itemSuggestion.js returned HTTP 200.
- Worker was not changed or redeployed; its existing JWT validation, CORS restriction, PII-safe logging, and local fallback remain in effect.

## Unverified items

- 実際の認証済み利用者セッションによるAI呼び出しは、非機微のテストデータを使用できる権限者が実施する必要がある。
- ブラウザ印刷ダイアログからの最終PDF保存は端末・ブラウザ依存のため、提出先の端末で確認する。
