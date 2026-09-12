# Reopen record

Last updated: 2026-09-11 (Asia/Tokyo)

## Current baseline

- Branch: `main`
- HEAD: `5ffaa67e78e3a9e1749ccfa4ab2bcf168be47f7a`
- Commit: `Productize receipt OCR item extraction`
- Remote: `origin/main` is synchronized (ahead/behind `0/0` at completion).
- Production: <https://showatsushin.github.io/child-expense-settlement/>
- GitHub Pages workflow: `34560047155`, conclusion `success`.

## Last completed change

Receipt OCR was productized without changing schema v3, evidence draft lifecycle, Supabase Auth, Workers AI contracts, or output features.

- New local pipeline: normalization -> explicit line classification -> item/name amount pairing -> ReceiptItem candidates -> quality assessment.
- Supports same-line and split-line product/amount, quantity lines, discounts, Japanese yen/comma/space variants, and excludes subtotal/tax/payment/change lines.
- Candidate source OCR lines are retained on ReceiptItem (`sourceLineNumbers`, `sourceLines`) and in `basis`.
- Initial OCR candidates are `review`; OCR rerun does not replace pre-existing user-edited items.
- Zero candidates with material OCR monetary signals produces `low_confidence` and a visible warning, not a success message.
- Canvas-only preprocessing is used for OCR input (grayscale, contrast, bounded resize); original evidence bytes are unchanged.
- Legacy receipt-header category/reason remain for compatibility but are explicitly labeled as legacy supplemental fields. Product-level category/purpose remains the new primary path.
- Tomato source image from the user's Downloads was converted to favicon/apple/PWA icon assets. The temporary workspace copy was deleted; the user original was not changed.

## Relevant implementation locations

- `src/receipt-ocr-pipeline.js` — normalization, classification, extraction, quality.
- `src/services/documentRecognition.js` — local Canvas OCR preprocessing and Tesseract invocation.
- `receipt-items.js` — candidate UI, quality rendering, rerun protection.
- `phase2.js` — OCR orchestration and legacy-header labeling.
- `src/models.js` — additive OCR quality/preprocessing and source-line persistence.
- `index.html`, `scripts/build.mjs` — cache-versioned favicon links and static asset build.

## Verification at completion

- `npm test`: 67 passed, 0 failed.
- `npm run build`: passed.
- Secret scan and `git diff --check`: passed.
- Production HTTP checks: page, OCR modules, and all favicon assets returned HTTP 200.
- Production OCR pipeline SHA-256 matched the built artifact.
- No Cloudflare Worker deploy was required.

## Explicitly unverified

A real authenticated production OCR session using the user's actual receipt was not run in this environment: no authenticated app session or personal receipt original was available to this agent. Therefore the production-specific counts for actual-source items, corrections, misses, and false positives remain unmeasured. Do not claim this test has been completed.

## Safe next step

If continuing OCR work, first run an authenticated production test with a user-provided non-sensitive/approved receipt. Record raw OCR text only with sensitive data redacted, then report source item count, candidate count, correct count, correction count, miss count, false-positive count, receipt total, item total, difference, and rerun preservation.
## 2026-09-12 handoff: Knowledge editing UI and Reader diagnosis


- main is at 43e62fccec89aa0e37ab371f1ce1e29886b858b3 (Improve Knowledge item editing UI). GitHub Pages workflow 34622789096 succeeded; main was synchronized and clean.
- The UI change was limited to receipt-items.js, styles.css, and test/ocr-primary-flow.test.js. No phase2, Worker, Reader, prompt, model, image-preparation, or fallback code changed.
- The product-card UI now presents Knowledge after basics, separates its original excerpt from editable purchase purpose, supports free-form category input, auto-grows purpose text, records manual overrides, and confirms restore/switch actions.
- npm run test:all passed (79 frontend and 24 Worker tests); npm run build and git diff --check passed. The deployed receipt-items.js contained the expected UI identifiers.
- A user reported the generic production Reader failure message. It intentionally has no Worker requestId or diagnostic stage.
- Diff 8b1d12b..43e62fc confirmed the /read-receipt URL, JWT, imageDataUrl/mimeType payload, provider, second-pass logic, and fallback conditions were unaffected by the UI commit.
- Existing Cloudflare safe diagnostics are live-only: wrangler tail child-expense-ai --format json --status error --search read_receipt. The initial failure preceded observation, and no retry arrived while tail was active, so no requestId, status, stage, upstream status, timeout, structured-output/schema result, item count, second-pass result, or final Worker status was captured.
- A second error-only tail was prepared for one retry and stopped when the session closed. No source, JWT, receipt text, or AI output was logged or retained.
- Next Reader diagnosis: start the same error-only tail, wait for confirmation, retry once, then report only safe ai_diagnostic fields. Do not change code until a stage is identified.

## 2026-09-12 handoff: Evidence lifecycle, human-confirmed candidates, and compact mobile UI

### Current baseline

- Branch: `main`
- HEAD / `origin/main`: `5648bbd9038da29a34251ede3c07e7432d71e930` (`feat: combine vendor candidates`)
- Working tree: clean at handoff; ahead / behind: `0 / 0`.
- Production: <https://showatsushin.github.io/child-expense-settlement/>
- GitHub Pages workflow `34694179282`: success.

### Completed product changes

- Evidence lifecycle is additive: selecting an original creates a `draft`; `未整理に保存` changes that same Evidence to `unorganized` without Reader execution or a second Blob; normal registration uses the existing `attachDraftEvidence()` transition to `attached`.
- `未整理BOX` is a filtered view of the existing Evidence store (`status === "unorganized"`). It reuses the same Evidence ID and Blob, supports safe deletion of unreferenced unorganized originals, and has `整理する` to reload the existing upper preview. It does not create a mode, a second preview, a second Evidence, or automatically run Reader.
- `証拠一覧` is now the complementary filtered view (`status === "attached"` only). Unorganized Evidence appears only in `未整理BOX`; Evidence / Blob storage and lifecycle contracts were not changed.
- Both `証拠一覧` and `未整理BOX` use closed native `<details>` sections with counts derived on each render.
- Human-confirmed history remains separate from Evidence and ReceiptItems, in the authenticated user namespace `confirmedHistory.v1`. Only explicit registration saves vendor, product, category, and selected Knowledge values. History never auto-confirms a value.
- Product category is free text with an empty initial value. It offers compact, collapsible `過去に確定` and normal `候補` groups; a click is required to apply a candidate. Free-form categories remain stored and aggregated, and Knowledge logic was not changed.
- Vendor candidates are grouped as Reader, OCR, and historical values. Clicking one appends it to the existing `支払先` value as `既存値（候補）`; repeated normalized values are not appended. The input remains freely editable, and the final source of truth is the one human-confirmed vendor string at registration.

### Non-goals preserved

- No Reader-engine, OCR structured-output, Worker, Knowledge matching, purchase-purpose, Evidence/Blob schema, capture/organize mode, `currentEvidence`, or preview-duplication work was introduced.
- Candidate display and selection do not call Reader or auto-register data.

### Latest verification

- Frontend tests: `93` passed.
- `node --check phase2.js`: passed.
- `npm run build`: passed.
- `git diff --check`: passed before each production commit.
- GitHub Pages build and deployment succeeded for the current HEAD.

### Safe next step

Do not begin a new phase implicitly. First conduct the user-side production checks for the latest candidate UI: select Reader and OCR vendor candidates sequentially, verify duplicate prevention and free editing, and verify the compact category-candidate disclosure on a phone-width layout. Only begin additional work after an explicit next-stage instruction.
