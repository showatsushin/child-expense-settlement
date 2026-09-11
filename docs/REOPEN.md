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