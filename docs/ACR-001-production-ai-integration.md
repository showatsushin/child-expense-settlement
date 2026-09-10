# ACR-001: 認証付きローカル台帳と Workers AI 提案の本番構成

- Status: Accepted
- Date: 2026-09-10
- Scope: child-expense-settlement Phase 1 / Phase 2 の本番到達点

## Context

子ども関連支出を、原本証拠と紐付けてローカルで整理・清算するアプリを構築した。利用者の認証は必要だが、経費明細・原本ファイル・OCR本文をクラウド台帳へ送らず、同一ブラウザを複数利用者が使う場合にもデータが混ざらない構成が必要だった。

ローカル理由提案を維持しつつ、利用者が明示的に求めた場合だけ、Cloudflare Workers AI による事実説明の下書き提案を追加する。

## Accepted architecture

```text
GitHub Pages
  └─ Supabase Auth (email/password session)
       └─ browser-local data namespace (user ID per localStorage / IndexedDB)
            ├─ local OCR (Tesseract.js / PDF text extraction)
            ├─ local deterministic calculation and exports
            └─ explicit AI suggestion request only
                 └─ child-expense-ai Worker
                      ├─ Supabase JWT validation
                      └─ Workers AI binding: AI
```

### Production endpoints

- Frontend: `https://showatsushin.github.io/child-expense-settlement/`
- AI Worker: `https://child-expense-ai.steep-tooth-3561.workers.dev`
- Worker route: `POST /suggest-expense`
- CORS allowed origin: `https://showatsushin.github.io`

## Key decisions

### Authentication and data isolation

- Supabase Auth session is the authentication source of truth.
- The unauthenticated browser never initializes the application body.
- Browser-local expense records, children master, evidence metadata, and IndexedDB files are namespaced by authenticated user ID.
- Legacy unauthenticated data is not automatically assigned to a signed-in user.

### Local-first evidence handling

- JPG / JPEG / PNG / PDF evidence files remain in browser IndexedDB.
- OCR is performed locally in the browser: Tesseract.js for images and PDF.js text extraction for text-layer PDFs.
- Original files, images, and PDFs are not included in AI requests.

### Deterministic accounting

- Other-party burden and outstanding amount are calculated by pure deterministic functions.
- AI does not decide burden rates, settlement status, legal eligibility, or registration.
- CSV, XLSX, DOCX, and print/PDF output are generated in the browser.

### AI suggestion boundary

- `src/services/expenseSuggestion.js` is the frontend suggestion boundary.
- Local concise / standard / detailed templates remain available without network access.
- The `AIで提案` button is the only frontend trigger for a Worker call. OCR and page load never call AI automatically.
- Worker model: `@cf/meta/llama-3.1-8b-instruct-fast`.
- The model was selected because it supports structured JSON output and is not in the Workers Paid-plan-only model list.
- Worker output is validated and normalized before it is sent to the browser. Category values are limited to the existing category master.
- AI candidates are saved only after the user selects them and then registers the form. Subsequent manual edits use `source: "manual"`.

### Worker security controls

- `OPTIONS /suggest-expense` serves preflight; only `POST /suggest-expense` can invoke AI.
- Worker validates Supabase access tokens with the project JWKS, including issuer and `authenticated` audience. If the Supabase project uses legacy HS256 signing, it safely verifies the token through Supabase Auth `/user` using only the publishable/anon key.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are Worker secrets. No service-role key is used.
- Maximum request body: 24 KB; OCR and short-text fields have individual limits.
- In-memory per-user rate limiting is applied per isolate.
- Worker logging excludes authorization tokens, OCR/corrected text, child labels, vendor, amount, reasons, and AI response content. It logs only request ID, status, latency, model ID, and error class.
- Legal assertions and invalid AI JSON are rejected. The browser displays a fallback message and preserves local suggestions.

## AI request data minimization

The browser may send only:

- `ocrText`
- `correctedText`
- `paidDate`
- `vendor`
- `amount`
- `category`
- `childLabel`

The browser does not send original files, images, PDFs, notes, target period, burden rates, already-paid amount, saved ledger data, localStorage contents, or IndexedDB contents.

## User experience

- Mobile camera input uses `accept="image/*"` and `capture="environment"`; photo/PDF selection remains available.
- Desktop drag-and-drop remains available.
- The form is responsive: desktop two-column evidence/form layout, single-column mobile flow, and mobile record cards.
- A user-scoped first-run guide and in-app usage guide explain evidence handling, classifications, local storage, and export flow.

## Verification record

- Frontend tests: 37 passed.
- Worker tests: 12 passed.
- Total tests: 49 passed.
- Production build succeeded.
- GitHub Pages workflow `34471665852` succeeded for commit `5b842ad`.
- Worker `child-expense-ai` latest deployed version: `cb60e202-07a8-4e0b-8e04-3e2b47df31c0`.
- Worker preflight returned 204 with the production CORS origin.
- Worker unauthenticated and invalid-token requests returned 401.
- Production frontend, AI configuration/module, Tesseract worker/core/Japanese traineddata, and PDF.js worker returned HTTP 200.

## Non-goals and remaining verification

- This application does not make legal determinations, calculate legal obligations, or automatically register expenses.
- Image/PDF evidence is not sent to Workers AI.
- An end-to-end production test using a real authenticated user session and a real AI invocation remains to be performed by an authorized user with non-sensitive test data.

## Related commits

- `f241f53` — Supabase Auth boundary and user namespaces
- `8b2f3a4` — mobile capture UX and local reason suggestions
- `7f34cb1` — authenticated Workers AI expense suggestions
- `5b842ad` — preserve Worker observability settings
