import { imagePreprocessPlan } from './documentRecognition.js';

function canvasJpeg(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

// This returns a one-request derivative only; it never mutates or persists the evidence File.
export async function prepareReceiptImageForVision(file) {
  if (!file?.type?.startsWith('image/') || typeof globalThis.createImageBitmap !== 'function' || typeof document === 'undefined') return { input: file, preprocessing: { applied: false, mode: 'original' } };
  let bitmap;
  try {
    bitmap = await globalThis.createImageBitmap(file);
    const plan = imagePreprocessPlan(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas'); canvas.width = plan.width; canvas.height = plan.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return { input: file, preprocessing: { applied: false, mode: 'original' } };
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, plan.width, plan.height);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(bitmap, 0, 0, plan.width, plan.height);
    const blob = await canvasJpeg(canvas);
    return blob ? { input: blob, preprocessing: { applied: true, mode: 'resize-jpeg-for-reader', width: plan.width, height: plan.height, scale: plan.scale } } : { input: file, preprocessing: { applied: false, mode: 'original' } };
  } catch { return { input: file, preprocessing: { applied: false, mode: 'original' } }; }
  finally { bitmap?.close?.(); }
}
