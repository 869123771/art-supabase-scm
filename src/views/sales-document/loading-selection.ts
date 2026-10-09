import { round } from 'lodash-es'
import type { ScmLoadingChoice, ScmDocumentLine } from '../../api/sales-document'

/** Notice balance and stock batches are shared across every selected source row. */
export function buildLoadingLines(
  choices: ScmLoadingChoice[],
  existing: ScmDocumentLine[],
  createId: () => string
): ScmDocumentLine[] {
  const noticeUsed = new Map<string, number>()
  const stockUsed = new Map<string, number>()
  for (const line of existing) {
    const key = `${line.sourceDocumentId}:${line.sourceLineId}`
    noticeUsed.set(key, (noticeUsed.get(key) ?? 0) + Number(line.quantity ?? 0))
    if (line.stockBatchId)
      stockUsed.set(
        line.stockBatchId,
        (stockUsed.get(line.stockBatchId) ?? 0) + Number(line.quantity ?? 0)
      )
  }
  const added: ScmDocumentLine[] = []
  const lastLineNo = Math.max(0, ...existing.map((line) => line.lineNo ?? 0))
  for (const choice of choices) {
    const key = `${choice.noticeId}:${choice.noticeLineId}`
    const quantity = round(
      Math.min(
        choice.availableQuantity - (noticeUsed.get(key) ?? 0),
        choice.availableStock - (stockUsed.get(choice.stockBatchId) ?? 0)
      ),
      3
    )
    if (quantity <= 0) continue
    noticeUsed.set(key, (noticeUsed.get(key) ?? 0) + quantity)
    stockUsed.set(choice.stockBatchId, (stockUsed.get(choice.stockBatchId) ?? 0) + quantity)
    added.push({
      ...choice.line,
      lineId: createId(),
      lineNo: lastLineNo + (added.length + 1) * 10,
      quantity,
      sourceLineId: choice.noticeLineId,
      sourceDocumentId: choice.noticeId,
      sourceDocumentNo: choice.noticeNo,
      sourceLineNo: choice.noticeLineNo,
      stockBatchId: choice.stockBatchId,
      warehouseId: choice.warehouseId,
      warehouseName: choice.warehouseName,
      warehouse: choice.warehouseName,
      location: choice.binName,
      zoneName: choice.zoneName,
      binName: choice.binName,
      batchNo: choice.batchNo,
      deliveredQuantity: 0,
      outboundQuantity: 0,
      returnQuantity: 0
    })
  }
  return added
}
