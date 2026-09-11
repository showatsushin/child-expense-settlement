import { analyzeReceiptOcr } from './receipt-ocr-pipeline.js';

export function extractReceiptItemCandidates(text, analysis = analyzeReceiptOcr(text)) { return analysis.items; }
export { analyzeReceiptOcr } from './receipt-ocr-pipeline.js';
