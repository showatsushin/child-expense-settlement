# OpenAI Receipt Reader rollout

The default Reader is `tesseract`. To make the deployed Pages build select the OpenAI candidate after a documented A/B decision, build with `RECEIPT_READER_PROVIDER=openai`. This is public, non-secret configuration only.

Before deploying the Worker, configure the secret outside the repository:

```powershell
cd worker
npx wrangler secret put OPENAI_API_KEY
```

`/read-receipt` accepts one authenticated JPEG or PNG image, at most 4 MiB after the browser's temporary resize. It does not accept a receipt ID, ledger, history, or other files. The Worker sends the one data URL to the OpenAI Responses API with `store: false`; it does not persist the input. Logs contain only provider, HTTP status, elapsed time, model, and token usage.

For an A/B measurement, use `runReceiptReaderAbComparison(file)` from `src/services/receiptReaderProvider.js` in an authenticated development session. It returns both raw and structured results, total differences, review counts, and blank human-measurement fields for correct/incorrect names and amounts, missed items, and false items. Do not hard-code a real receipt's expected content into tests.

Do not set `RECEIPT_READER_PROVIDER=openai` for production until an approved same-original A/B evaluation shows the required improvement. There is intentionally no automatic fallback between providers.
