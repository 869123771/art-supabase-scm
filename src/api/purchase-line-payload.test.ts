import assert from 'node:assert/strict'
import test from 'node:test'
import { toScmPurchaseLinePayload } from './purchase-line-payload'
import type { ScmPurchaseLine } from './purchase-document.types'

test('采购明细使用数据库要求的第二辅助单位字段名', () => {
  const line: ScmPurchaseLine = {
    lineId: 'line-1',
    lineNo: 10,
    materialId: 'material-1',
    materialCode: 'R00-0029',
    materialDescription: '测试物料',
    specification: '',
    unit: '吨',
    quantity: 36,
    unitPrice: 1,
    taxRate: 0,
    discountRate: 0,
    gift: false,
    baseQuantity: 36000,
    auxiliaryUnit2: '吨',
    auxiliaryQuantity2: 36,
    purchasedQuantity: 5
  }

  const payload = toScmPurchaseLinePayload(line, 'purchase_order')
  assert.equal(payload.auxiliary_unit_2, '吨')
  assert.equal(payload.auxiliary_quantity_2, 36)
  assert.equal(payload.baseQuantity, 36000)
  assert.equal('auxiliaryUnit2' in payload, false)
  assert.equal('auxiliaryQuantity2' in payload, false)
  assert.equal('purchasedQuantity' in payload, false)
})

test('采购申请分批下单按本批基本数量占用来源，保留原始行', () => {
  const line: ScmPurchaseLine = {
    lineId: 'batch-1',
    materialId: 'material-1',
    materialCode: 'M1',
    materialDescription: '分批采购物料',
    specification: '',
    unit: '箱',
    quantity: 2,
    baseQuantity: 20,
    unitPrice: 5,
    taxRate: 13,
    discountRate: 0,
    gift: false,
    sourceLineId: 'request-line',
    sourceQuantity: 100
  }
  assert.equal(toScmPurchaseLinePayload(line, 'purchase_order').sourceQuantity, 20)
  assert.equal(line.sourceQuantity, 100)
  assert.equal(
    toScmPurchaseLinePayload({ ...line, quantity: 3, baseQuantity: 30 }, 'purchase_order')
      .sourceQuantity,
    30
  )
  assert.equal(toScmPurchaseLinePayload(line, 'receipt_notice').sourceQuantity, 100)
  assert.equal(
    toScmPurchaseLinePayload({ ...line, purchaseContractLineId: 'contract-line' }, 'purchase_order')
      .sourceQuantity,
    100
  )
  assert.equal(
    toScmPurchaseLinePayload({ ...line, sourceLineId: undefined }, 'purchase_order').sourceQuantity,
    100
  )
})
