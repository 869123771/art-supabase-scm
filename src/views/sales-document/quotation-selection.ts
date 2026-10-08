import type { ScmDocumentLine, ScmSalesDocument } from '@scm/api'

export type QuotationActionLine = ScmDocumentLine & {
  quotationId: string
  documentNo: string
  key: string
}

export function quotationActionLines(records: ScmSalesDocument[]): QuotationActionLine[] {
  return records.flatMap((record) =>
    record.lines.map((line) => ({
      ...line,
      quotationId: record.id,
      documentNo: record.documentNo,
      key: `${record.id}:${line.lineId}`
    }))
  )
}

export function selectedQuotationDocuments(
  records: ScmSalesDocument[],
  lines: QuotationActionLine[]
): ScmSalesDocument[] {
  const selected = new Set(lines.map((line) => line.key))
  return records
    .map((record) => ({
      ...record,
      lines: record.lines.filter((line) => selected.has(`${record.id}:${line.lineId}`))
    }))
    .filter((record) => record.lines.length > 0)
}

export function normalizeQuotationSelection(
  record: ScmSalesDocument | ScmSalesDocument[]
): ScmSalesDocument[] {
  return Array.isArray(record) ? record : [record]
}
