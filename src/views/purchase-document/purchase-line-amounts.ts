import type { ScmPurchaseKind, ScmPurchaseLine } from '@scm/api'

export function lineTotal(line: ScmPurchaseLine, kind: ScmPurchaseKind): number {
  return lineSubtotal(line, kind) + lineTaxAmount(line, kind)
}
export function lineSubtotal(line: ScmPurchaseLine, kind: ScmPurchaseKind): number {
  if (line.gift) return 0
  if (kind === 'purchase_order')
    return (
      Math.round(
        (Number(line.quantity || 0) * Number(line.unitPrice || 0) -
          lineDiscountAmount(line, kind)) *
          100
      ) / 100
    )
  return (
    Math.round(
      Number(line.quantity || 0) *
        Number(line.unitPrice || 0) *
        (1 - Number(line.discountRate || 0) / 100) *
        100
    ) / 100
  )
}
export function lineDiscountAmount(line: ScmPurchaseLine, kind: ScmPurchaseKind): number {
  if (line.gift) return 0
  if (kind === 'purchase_order')
    return (
      Math.round(
        Number(line.quantity || 0) * lineTaxedUnitPrice(line, kind) * Number(line.discountRate || 0)
      ) / 100
    )
  return (
    Math.round(
      Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.discountRate || 0)
    ) / 100
  )
}
export function lineTaxAmount(line: ScmPurchaseLine, kind: ScmPurchaseKind): number {
  if (line.gift) return 0
  if (kind === 'purchase_order')
    return (
      Math.round(
        Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.taxRate || 0)
      ) / 100
    )
  return (
    Math.round(
      Number(line.quantity || 0) *
        Number(line.unitPrice || 0) *
        (1 - Number(line.discountRate || 0) / 100) *
        Number(line.taxRate || 0)
    ) / 100
  )
}
export function lineTaxedUnitPrice(line: ScmPurchaseLine, kind: ScmPurchaseKind): number {
  if (line.gift) return 0
  if (kind === 'purchase_order')
    return Number(
      line.taxInclusiveUnitPrice ??
        Math.round(Number(line.unitPrice || 0) * (1 + Number(line.taxRate || 0) / 100) * 10000) /
          10000
    )
  return (
    Number(line.unitPrice || 0) *
    (1 - Number(line.discountRate || 0) / 100) *
    (1 + Number(line.taxRate || 0) / 100)
  )
}
