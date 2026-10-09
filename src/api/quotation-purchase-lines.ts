import type { ScmPurchaseDocument } from './purchase-document.types'

// Legacy quotation conversions copied source row numbers into the target row number.
// Normalize only that legacy shape; stable line IDs keep downstream references intact.
export function normalizeQuotationPurchaseLines(
  document: ScmPurchaseDocument
): ScmPurchaseDocument {
  if (
    document.kind !== 'purchase_order' ||
    !document.lines.some(
      (line) =>
        line.quotationLineId === line.lineId && line.sourceSalesDocumentId && !line.sourceLineNo
    )
  )
    return document
  return {
    ...document,
    lines: document.lines.map((line, index) => ({
      ...line,
      sourceLineNo:
        line.sourceLineNo ??
        (line.quotationLineId === line.lineId && line.sourceSalesDocumentId
          ? line.lineNo
          : undefined),
      lineNo: (index + 1) * 10
    }))
  }
}
