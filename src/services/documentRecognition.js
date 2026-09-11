export function imagePreprocessPlan(width, height) {
  const sourceWidth = Number(width) || 0;
  const sourceHeight = Number(height) || 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) return { applied: false, width: sourceWidth, height: sourceHeight, scale: 1 };
  const desiredScale = Math.max(1, Math.min(2, 1600 / sourceWidth));
  const maxScale = Math.sqrt(12000000 / (sourceWidth * sourceHeight));
  const scale = Math.max(0.25, Math.min(desiredScale, maxScale));
  return { applied: true, width: Math.max(1, Math.round(sourceWidth * scale)), height: Math.max(1, Math.round(sourceHeight * scale)), scale };
}

function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function prepareReceiptImageForOcr(file) {
  if (!file?.type?.startsWith('image/') || typeof globalThis.createImageBitmap !== 'function' || typeof document === 'undefined') return { input: file, preprocessing: { applied: false, mode: 'original' } };
  let bitmap;
  try {
    bitmap = await globalThis.createImageBitmap(file);
    const plan = imagePreprocessPlan(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return { input: file, preprocessing: { applied: false, mode: 'original' } };
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, plan.width, plan.height);
    context.filter = 'grayscale(1) contrast(1.35)';
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, plan.width, plan.height);
    const blob = await canvasBlob(canvas);
    return blob ? { input: blob, preprocessing: { applied: true, mode: 'grayscale-contrast-resize', width: plan.width, height: plan.height, scale: plan.scale } } : { input: file, preprocessing: { applied: false, mode: 'original' } };
  } catch {
    return { input: file, preprocessing: { applied: false, mode: 'original' } };
  } finally {
    bitmap?.close?.();
  }
}

export async function recognizeImage(file, onProgress = () => {}) {
  if (!globalThis.Tesseract) throw new Error('\u004f\u0043\u0052\u30e9\u30a4\u30d6\u30e9\u30ea\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u30ed\u30fc\u30ab\u30ebHTTP\u30b5\u30fc\u30d0\u30fc\u304b\u3089\u958b\u3044\u3066\u304f\u3060\u3055\u3044\u3002');
  const prepared = await prepareReceiptImageForOcr(file);
  const worker = await globalThis.Tesseract.createWorker('jpn', 1, { workerPath: './node_modules/tesseract.js/dist/worker.min.js', corePath: './node_modules/tesseract.js-core/tesseract-core.wasm.js', langPath: './node_modules/@tesseract.js-data/jpn/4.0.0', logger: (m) => { if (m.status === 'recognizing text') onProgress(Math.round((m.progress || 0) * 100)); } });
  try {
    const result = await worker.recognize(prepared.input);
    return { status: 'completed', rawText: result.data.text || '', correctedText: '', processedAt: new Date().toISOString(), engine: 'Tesseract.js (local jpn)', confidence: Number(result.data.confidence || 0) / 100, preprocessing: prepared.preprocessing };
  } finally { await worker.terminate(); }
}

export async function extractPdfText(file) {
  const pdfjs = await import('../../node_modules/pdfjs-dist/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) { const page = await pdf.getPage(pageNo); const content = await page.getTextContent(); pages.push(content.items.map((item) => item.str).join(' ')); }
  return { status: 'completed', rawText: pages.join('\n'), correctedText: '', processedAt: new Date().toISOString(), engine: 'PDF.js text layer', confidence: null, preprocessing: { applied: false, mode: 'pdf-text-layer' } };
}