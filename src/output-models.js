import { calculateSummary, calculateReceiptSummary, receiptClaimTotal, receiptDifference, receiptItemTotal, receiptTotal } from './calculations.js';
import { formatSubmissionEvidenceNumber } from './submission-evidence-number.js';
import { amountInputModeLabel, taxRateLabel } from './item-tax.js';

const field = (value) => value?.value ?? value ?? '';
const internalEvidenceNumbers = (record, evidenceById) => (record.evidenceIds || []).map((id) => evidenceById.get(id)?.evidenceNumber || '').filter(Boolean).join(' / ');
const submissionEvidenceNumbers = (record, evidenceById) => (record.evidenceIds || []).map((id) => formatSubmissionEvidenceNumber(evidenceById.get(id)?.submissionEvidenceNumber)).filter(Boolean).join(' / ');
const wordEvidenceReference = (record, evidenceById) => {
  const internal = internalEvidenceNumbers(record, evidenceById); const submission = submissionEvidenceNumbers(record, evidenceById);
  return submission ? `${submission}（内部管理番号: ${internal || '—'}）` : internal;
};

export function buildWorkbookData(records, evidences, children) {
  const source = Array.isArray(records) ? records : []; const evidenceById = new Map((evidences || []).map((item) => [item.id,item])); const childById = new Map((children || []).map((item) => [item.id,item]));
  const settlement = [['内部管理番号','提出用証拠番号','購入日','対象児童','会計費目','購入店','レシート総額','商品明細合計','提出対象額','レシート総額との差額','相手負担想定額','既払い額','未清算額','状態','備考'], ...source.map((record) => [internalEvidenceNumbers(record,evidenceById),submissionEvidenceNumbers(record,evidenceById),record.paidDate,childById.get(field(record.childId))?.name || '',field(record.category),field(record.vendor),receiptTotal(record),receiptItemTotal(record),receiptClaimTotal(record),receiptDifference(record),record.otherBurdenAmount,record.alreadyPaidAmount,record.outstandingAmount,field(record.settlementStatus),record.notes])];
  const receiptItems = [['内部管理番号','提出用証拠番号','購入日','店名','商品名','数量','単価','金額','税率','金額入力区分','種別','購入目的・必要性','提出状態','根拠','備考'], ...source.flatMap((record) => (record.items || []).map((item) => [internalEvidenceNumbers(record,evidenceById),submissionEvidenceNumbers(record,evidenceById),record.paidDate,field(record.vendor),item.productName,item.quantity,item.unitPrice,item.amount,taxRateLabel(item.taxRate),amountInputModeLabel(item.amountInputMode),item.category,field(item.purpose),item.submissionStatus,(item.basis || []).join(' / '),item.notes]))];
  const receiptSummary = calculateReceiptSummary(source); const oldSummary = calculateSummary(source);
  return {
    settlement,
    receiptItems,
    category:[['種別','提出対象額'],...receiptSummary.categorySubtotals.map((item) => [item.category,item.amount])],
    evidence:[['内部管理番号','提出用証拠番号','ファイル名','種別','OCR状態','OCR処理日時','紐付くレシート'],...(evidences || []).map((evidence) => [evidence.evidenceNumber,formatSubmissionEvidenceNumber(evidence.submissionEvidenceNumber),evidence.fileName,evidence.mimeType,evidence.ocr?.status || 'not_started',evidence.ocr?.processedAt || '',source.filter((record) => (record.evidenceIds || []).includes(evidence.id)).map((record) => record.id).join(' / ')])],
    summary:[['集計項目','金額'],['支出総額',oldSummary.amount],['レシート件数',receiptSummary.receiptCount],['レシート総額',receiptSummary.receiptTotalAmount],['商品明細合計',receiptSummary.itemTotalAmount],['提出対象総額',receiptSummary.claimTotalAmount],['相手負担想定額',oldSummary.other],['既払い額',oldSummary.paid],['未清算額',oldSummary.outstanding]],
  };
}

export function buildWordDocumentModel(records, evidences, children, periodLabel) {
  const evidenceById = new Map((evidences || []).map((item) => [item.id,item])); const childById = new Map((children || []).map((item) => [item.id,item])); const summary = calculateReceiptSummary(records || []);
  return {
    title:'子ども関連支出 清算説明書', periodLabel, summary,
    rows:(records || []).map((record) => ({ evidence:wordEvidenceReference(record,evidenceById), paidDate:record.paidDate, vendor:field(record.vendor), category:field(record.category), amount:receiptTotal(record), other:Number(record.otherBurdenAmount || 0), reason:field(record.reason) })),
    disclaimer:'本資料は登録された支出資料を整理・集計したものであり、法的判断、提出対象の確定及び負担義務の判断を自動的に行うものではありません。',
    receiptRows:(records || []).map((record) => ({ evidence:wordEvidenceReference(record,evidenceById), paidDate:record.paidDate, child:childById.get(field(record.childId))?.name || '', vendor:field(record.vendor), receiptTotal:receiptTotal(record), claimTotal:receiptClaimTotal(record), difference:receiptDifference(record) })),
    itemRows:(records || []).flatMap((record) => (record.items || []).map((item) => ({ evidence:wordEvidenceReference(record,evidenceById), paidDate:record.paidDate, vendor:field(record.vendor), productName:item.productName, category:item.category, amount:item.amount, purpose:field(item.purpose), submissionStatus:item.submissionStatus }))),
  };
}
