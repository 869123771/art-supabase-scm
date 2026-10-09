import dayjs from 'dayjs'
import { orderBy } from 'lodash-es'
import type { ScmPurchaseDocument, ScmPurchaseLine } from './purchase-document.types'

/** Pricing is independent of the order's request/quotation provenance. */
export function findPurchaseContractPrice(
  contracts: ScmPurchaseDocument[],
  target: {
    tenantId: string
    projectId: string | null
    supplierId: string
    materialId: string
    documentDate: string
  }
): { contract: ScmPurchaseDocument; line: ScmPurchaseLine } | undefined {
  if (!dayjs(target.documentDate).isValid()) return undefined
  const candidates = contracts.filter((contract) => {
    const { startDate, endDate } = contract.details
    return (
      contract.tenantId === target.tenantId &&
      contract.kind === 'purchase_contract' &&
      contract.status === 'effective' &&
      contract.supplierId === target.supplierId &&
      (contract.projectId == null || contract.projectId === target.projectId) &&
      (!startDate || (dayjs(startDate).isValid() && startDate <= target.documentDate)) &&
      (!endDate || (dayjs(endDate).isValid() && endDate >= target.documentDate)) &&
      contract.lines.some((line) => line.materialId === target.materialId)
    )
  })
  const contract = orderBy(
    candidates,
    [
      (record) => record.projectId != null,
      (record) => record.details.startDate ?? '',
      'updatedAt',
      'id'
    ],
    ['desc', 'desc', 'desc', 'asc']
  )[0]
  const line = contract?.lines.find((item) => item.materialId === target.materialId)
  return contract && line ? { contract, line } : undefined
}
