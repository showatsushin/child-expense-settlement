# OpenAI Receipt Reader rollout

The production default Reader is openai. Tesseract remains available as an explicit provider for fallback design and future comparison. RECEIPT_READER_PROVIDER is public, non-secret configuration only.

Before deploying the Worker, configure the secret outside the repository:

```powershell
cd worker
npx wrangler secret put OPENAI_API_KEY
```

`/read-receipt` accepts one authenticated JPEG or PNG image, at most 4 MiB after the browser's temporary resize. It does not accept a receipt ID, ledger, history, or other files. The Worker sends the one data URL to the OpenAI Responses API with `store: false`; it does not persist the input. Logs contain only provider, HTTP status, elapsed time, model, and token usage.


The production default is openai; do not add automatic fallback without a separate decision. Tesseract remains implemented for future fallback or comparison.
