import { omit } from 'lodash-es'
import type { ScmPurchaseLine } from './purchase-document.types'

export function toScmPurchaseLinePayload(line: ScmPurchaseLine) {
  const { auxiliaryQuantity2, auxiliaryUnit2, ...values } = omit(line, [
    'purchasedQuantity',
    'receivedQuantity',
    'remainingQuantity'
  ])
  return {
    ...values,
    auxiliary_quantity_2: auxiliaryQuantity2,
    auxiliary_unit_2: auxiliaryUnit2
  }
}
