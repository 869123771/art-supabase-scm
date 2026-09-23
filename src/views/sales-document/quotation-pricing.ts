import type { ScmDocumentLine, ScmMaterialOption } from '@scm/api'

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100
const roundUnitPrice = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10000) / 10000

export function quotationTaxInclusivePrice(line: ScmDocumentLine): number {
  return roundUnitPrice(line.unitPrice * (1 + line.taxRate / 100))
}

export function quotationTaxExclusivePrice(taxInclusivePrice: number, taxRate: number): number {
  return roundUnitPrice(taxInclusivePrice / (1 + taxRate / 100))
}

export function calculateQuotationLine(line: ScmDocumentLine) {
  if (line.gift) return { discount: 0, amount: 0, tax: 0, total: 0 }
  const gross = line.quantity * line.unitPrice
  const discountRate = line.discountMode === 'none' ? 0 : (line.discountRate ?? 0) / 100
  const discount = roundMoney(line.quantity * quotationTaxInclusivePrice(line) * discountRate)
  const amount = roundMoney(gross * (1 - discountRate))
  const tax = roundMoney((amount * line.taxRate) / 100)
  return { discount, amount, tax, total: roundMoney(amount + tax) }
}

/** Contract totals follow the agreed line formulas; gifts contribute no receivable. */
export function calculateContractLine(line: ScmDocumentLine) {
  if (line.gift) return { discount: 0, amount: 0, tax: 0, total: 0 }
  const discountRate = line.discountMode === 'none' ? 0 : (line.discountRate ?? 0) / 100
  const discount = roundMoney(line.quantity * quotationTaxInclusivePrice(line) * discountRate)
  const amount = roundMoney(line.quantity * line.unitPrice - discount)
  const tax = roundMoney(line.quantity * line.unitPrice * (line.taxRate / 100))
  return { discount, amount, tax, total: roundMoney(amount + tax) }
}

export function contractAuxiliaryQuantity(
  quantity: number,
  unitId: string | null | undefined,
  material: ScmMaterialOption | undefined
): number | undefined {
  if (!unitId || !material) return undefined
  const conversion = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
  if (!conversion || conversion.baseFactor <= 0 || conversion.sourceFactor <= 0) return undefined
  return Math.round((quantity * conversion.sourceFactor * 1000) / conversion.baseFactor) / 1000
}
