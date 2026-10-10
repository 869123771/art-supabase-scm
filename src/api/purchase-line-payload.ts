import { omit } from 'lodash-es'
import type { ScmPurchaseKind, ScmPurchaseLine } from './purchase-document.types'

export function toScmPurchaseLinePayload(line: ScmPurchaseLine, kind: ScmPurchaseKind) {
  const { auxiliaryQuantity2, auxiliaryUnit2, ...values } = omit(line, [
    'purchasedQuantity',
    'receivedQuantity',
    'remainingQuantity'
  ])
  return {
    ...values,
    // 采购申请按基本单位占用数量，分批下单必须使用本批数量。
    sourceQuantity:
      kind === 'purchase_order' && line.sourceLineId && !line.purchaseContractLineId
        ? line.baseQuantity
        : line.sourceQuantity,
    auxiliary_quantity_2: auxiliaryQuantity2,
    auxiliary_unit_2: auxiliaryUnit2
  }
}
