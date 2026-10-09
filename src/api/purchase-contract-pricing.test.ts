import assert from 'node:assert/strict'
import test from 'node:test'
import { findPurchaseContractPrice } from './purchase-contract-pricing'
import type { ScmPurchaseDocument } from './purchase-document.types'

test('合同价格限于同租户供应商和有效日期，优先项目合同', () => {
  const contract = (
    id: string,
    projectId: string | null,
    startDate: string,
    endDate: string
  ): ScmPurchaseDocument => ({
    id,
    tenantId: 'tenant',
    kind: 'purchase_contract',
    status: 'effective',
    supplierId: 'supplier',
    projectId,
    documentNo: id,
    documentDate: startDate,
    deliveryDate: null,
    documentTypeId: null,
    sourceId: null,
    details: { startDate, endDate },
    lines: [
      {
        lineId: id,
        lineNo: 10,
        materialId: 'material',
        materialCode: 'M',
        materialDescription: '物料',
        specification: '',
        unit: '件',
        quantity: null,
        unitPrice: 8,
        taxRate: 13,
        discountRate: 0,
        gift: false
      }
    ],
    paymentPlans: [],
    deliveryPlans: [],
    clauses: [],
    remark: null,
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    createdAt: startDate,
    updatedAt: startDate
  })
  const global = contract('global', null, '2026-10-01', '2026-10-09')
  const project = contract('project', 'project', '2026-10-01', '2026-10-09')
  const expired = contract('expired', 'project', '2026-09-01', '2026-10-08')
  const target = {
    tenantId: 'tenant',
    supplierId: 'supplier',
    projectId: 'project',
    materialId: 'material',
    documentDate: '2026-10-09'
  }
  assert.equal(
    findPurchaseContractPrice([global, project, expired], target)?.contract.id,
    'project'
  )
  assert.equal(findPurchaseContractPrice([global, expired], target)?.contract.id, 'global')
  assert.equal(
    findPurchaseContractPrice([global], { ...target, documentDate: '2026-10-10' }),
    undefined
  )
  assert.equal(findPurchaseContractPrice([global], { ...target, tenantId: 'other' }), undefined)
  assert.equal(findPurchaseContractPrice([global], { ...target, supplierId: 'other' }), undefined)
})
