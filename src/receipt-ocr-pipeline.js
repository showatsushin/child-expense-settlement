import { makeId } from './models.js';

const normalizeSpace = (value) => String(value || '').normalize('NFKC').replace(/[\t\u3000]/g, ' ').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim();
const rounded = (value) => Math.round((Number(value) || 0) * 100) / 100;
const moneyPattern = /(?:[\u00a5\uffe5]\s*)?([+-]?\s*\d[\d, ]*(?:\.\d+)?)\s*(?:\u5186)?\s*$/;
const subtotalWords = /(?:\u5c0f\u8a08|SUB\s*TOTAL)/i;
const totalWords = /(?:\u5408\u8a08|\u7dcf\u984d|\u3054\u8acb\u6c42|\u304a\u8cb7\u4e0a|\u73fe\u8a08|\u7a0e\u8fbc\u5408\u8a08|TOTAL)/i;
const paymentWords = /(?:\u304a\u9810\u308a|\u304a\u91e3\u308a|\u652f\u6255|\u30ab\u30fc\u30c9|\u30af\u30ec\u30b8\u30c3\u30c8|\u96fb\u5b50\u30de\u30cd\u30fc|\u30dd\u30a4\u30f3\u30c8|\u73fe\u91d1|CHANGE)/i;
const discountWords = /(?:\u5024\u5f15|\u5272\u5f15|\u30af\u30fc\u30dd\u30f3|\u7279\u58f2|\u8abf\u6574|^-\s*\d)/i;
const taxWords = /(?:\u6d88\u8cbb\u7a0e|\u5185\u7a0e|\u5916\u7a0e|\u8efd\u6e1b\u7a0e\u7387|\u7a0e\u984d)/i;
const addressWords = /(?:\u90fd\u9053\u5e9c\u770c|\u5e02\u533a\u753a\u6751|\u4e01\u76ee|\u756a\u5730|\u53f7|TEL|\u96fb\u8a71|FAX|https?:|www\.)/i;
const footerWords = /(?:\u3042\u308a\u304c\u3068\u3046|\u307e\u305f\u306e\u3054\u6765\u5e97|\u30ec\u30b7\u30fc\u30c8|\u767b\u9332\u756a\u53f7|\u8fd4\u54c1|\u4ea4\u63db)/i;
const datePattern = /(?:(?:19|20)\d{2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,2}|(?:\u4ee4\u548c|\u5e73\u6210|R)\s*\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{1,2})/i;
const quantityPattern = /(\d+(?:\.\d+)?)\s*(?:\u70b9|\u500b|\u672c|\u679a|\u888b|\u7bb1|\u30bb\u30c3\u30c8)\s*(?:[x\u00d7]\s*\d+(?:\.\d+)?)?/i;

export function normalizeOcrLine(raw) {
  const normalized = normalizeSpace(raw)
    .replace(/([\u00a5\uffe5])\s+/g, '$1')
    .replace(/(\d)\s+(?=\d{3}(?:\D|$))/g, '$1')
    .replace(/\s*,\s*/g, ',');
  return { raw: String(raw || ''), normalized };
}

export function normalizeOcrText(rawText) {
  return String(rawText || '').split(/\r?\n/).map(normalizeOcrLine).filter((line) => line.normalized);
}

export function parseReceiptMoney(value) {
  const text = normalizeSpace(value).replace(/([+-])\s+/g, '$1').replace(/[\u00a5\uffe5,\s\u5186]/g, '');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? rounded(number) : null;
}

function trailingMoney(text) {
  const match = normalizeSpace(text).match(moneyPattern);
  return match ? parseReceiptMoney(match[1]) : null;
}

function splitInlineItem(text) {
  const match = normalizeSpace(text).match(/^(.*?)(?:\s+|\s*[\u00a5\uffe5]\s*)([+-]?\s*\d[\d, ]*(?:\.\d+)?)\s*(?:\u5186)?\s*$/);
  if (!match) return null;
  const productName = normalizeSpace(match[1]);
  const amount = parseReceiptMoney(match[2]);
  return productName && amount != null ? { productName, amount } : null;
}

function quantityFrom(text) {
  const match = normalizeSpace(text).match(quantityPattern);
  return match ? Number(match[1]) : null;
}

function isQuantityLine(text) {
  return quantityFrom(text) != null && /(?:\u70b9|\u500b|\u672c|\u679a|\u888b|\u7bb1|\u30bb\u30c3\u30c8)\s*(?:[x\u00d7]\s*\d+(?:\.\d+)?)?/i.test(text);
}

function classify(text) {
  if (subtotalWords.test(text)) return 'subtotal';
  if (totalWords.test(text)) return 'total';
  if (discountWords.test(text)) return 'discount';
  if (paymentWords.test(text)) return 'payment';
  if (taxWords.test(text)) return 'tax';
  if (datePattern.test(text)) return 'date';
  if (addressWords.test(text)) return /TEL|\u96fb\u8a71|FAX/i.test(text) ? 'phone' : 'address';
  if (footerWords.test(text)) return 'footer';
  if (isQuantityLine(text)) return 'quantity';
  if (splitInlineItem(text)) return 'item_inline';
  if (trailingMoney(text) != null) return 'item_amount';
  if (/^[0-9\s:/.-]+$/.test(text)) return 'unknown';
  return 'item_name';
}

function makeItem({ productName, amount, lineNumbers, rawLines, quantity = 1, confidence = 0.55, basis = [] }) {
  const name = normalizeSpace(productName).replace(/^[*\u30fb.]+|[*\u30fb.]+$/g, '');
  if (!name || amount == null || amount < 0) return null;
  const count = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  return {
    id: makeId('ocr-item'),
    lineOrder: 0,
    productName: name,
    quantity: count,
    unitPrice: count > 1 ? rounded(amount / count) : amount,
    amount: rounded(amount),
    category: '\u305d\u306e\u4ed6',
    purpose: { value: '', source: 'ocr', confidence: 0 },
    submissionStatus: 'review',
    source: 'ocr',
    confidence,
    basis: [...basis, `OCR lines: ${lineNumbers.join(',')}`],
    notes: '',
    sourceLineNumbers: lineNumbers,
    sourceLines: rawLines
  };
}

export function analyzeReceiptOcr(rawText) {
  const lines = normalizeOcrText(rawText).map((line, index) => ({ ...line, number: index + 1, kind: classify(line.normalized) }));
  const headers = { vendor: '', purchaseDate: '', receiptTotalAmount: null };
  const items = [];
  let pendingName = null;
  let pendingQuantity = null;

  for (const line of lines) {
    const text = line.normalized;
    const inline = splitInlineItem(text);
    const amount = trailingMoney(text);
    if (line.kind === 'date' && !headers.purchaseDate) headers.purchaseDate = text;
    if (line.kind === 'total' && headers.receiptTotalAmount == null && amount != null) headers.receiptTotalAmount = amount;
    if (!headers.vendor && line.number <= 5 && line.kind === 'item_name' && !inline && text.length >= 2 && !/^[\d\s]+$/.test(text)) headers.vendor = text;

    if (line.kind === 'discount') {
      if (items.length && amount != null && amount < 0) {
        const previous = items[items.length - 1];
        previous.amount = rounded(Math.max(0, previous.amount + amount));
        previous.unitPrice = previous.quantity > 1 ? rounded(previous.amount / previous.quantity) : previous.amount;
        previous.basis.push(`OCR line ${line.number}: ${text}`);
        previous.sourceLineNumbers.push(line.number);
        previous.sourceLines.push(line.raw);
      }
      continue;
    }
    if (line.kind === 'quantity') {
      pendingQuantity = quantityFrom(text) || pendingQuantity;
      continue;
    }
    if (line.kind === 'item_amount' && pendingName && amount != null) {
      const candidate = makeItem({ productName: pendingName.text, amount, quantity: pendingQuantity || 1, lineNumbers: [pendingName.number, line.number], rawLines: [pendingName.raw, line.raw], confidence: 0.58 });
      if (candidate) items.push(candidate);
      pendingName = null;
      pendingQuantity = null;
      continue;
    }
    if (line.kind === 'item_inline' && inline && inline.amount >= 0 && !totalWords.test(inline.productName) && !paymentWords.test(inline.productName)) {
      const candidate = makeItem({ productName: inline.productName, amount: inline.amount, quantity: pendingQuantity || quantityFrom(inline.productName) || 1, lineNumbers: [line.number], rawLines: [line.raw], confidence: 0.72 });
      if (candidate) items.push(candidate);
      pendingName = null;
      pendingQuantity = null;
      continue;
    }
    if (line.kind === 'item_name' && !inline && text.length >= 2) {
      pendingName = { text, number: line.number, raw: line.raw };
      continue;
    }
    if (['total', 'subtotal', 'payment', 'tax', 'address', 'phone', 'footer'].includes(line.kind)) {
      pendingName = null;
      pendingQuantity = null;
    }
  }

  const itemTotalAmount = rounded(items.reduce((sum, item) => sum + item.amount, 0));
  const difference = headers.receiptTotalAmount == null ? null : rounded(headers.receiptTotalAmount - itemTotalAmount);
  const monetaryLines = lines.filter((line) => trailingMoney(line.normalized) != null).length;
  const lowConfidenceCount = items.filter((item) => item.confidence < 0.65).length;
  const hasSignals = lines.length >= 3 && monetaryLines >= 2;
  const status = !items.length ? (hasSignals ? 'low_confidence' : 'failed') : headers.receiptTotalAmount != null && Math.abs(difference) <= 1 ? 'success' : 'partial';
  return {
    headers,
    lines,
    items: items.map((item) => ({ ...item, lineOrder: item.sourceLineNumbers[0] || 1 })),
    quality: { status, candidateCount: items.length, lowConfidenceCount, lineCount: lines.length, monetaryLineCount: monetaryLines, receiptTotalAmount: headers.receiptTotalAmount, itemTotalAmount, difference, totalConsistent: headers.receiptTotalAmount != null && Math.abs(difference) <= 1 }
  };
}