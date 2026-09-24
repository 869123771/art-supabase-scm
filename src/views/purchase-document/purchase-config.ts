import type { ScmPurchaseDetails, ScmPurchaseKind, ScmPurchaseStatus } from '@scm/api'

export interface PurchaseField {
  key: keyof ScmPurchaseDetails
  label: string
  type: 'input' | 'date' | 'select'
  span?: number
}

export interface PurchaseTransition {
  status: ScmPurchaseStatus
  action: string
  label: string
}

export interface PurchaseConfig {
  kind: ScmPurchaseKind
  menuName: string
  title: string
  description: string
  eyebrow: string
  icon: string
  numberLabel: string
  sourceKind?: ScmPurchaseKind
  fields: PurchaseField[]
  tabs: Array<'payments' | 'deliveries' | 'clauses'>
  transitions: Partial<Record<ScmPurchaseStatus, PurchaseTransition[]>>
  permissions: Record<string, string>
}

export const purchaseConfigs: Record<ScmPurchaseKind, PurchaseConfig> = {
  purchase_contract: {
    kind: 'purchase_contract',
    menuName: 'ScmPurchaseContract',
    title: '采购合同',
    description: '集中管理供应商合同、采购物料、付款安排与合同条款。',
    eyebrow: 'PURCHASE CONTRACTS',
    icon: 'ri:file-paper-2-line',
    numberLabel: '合同编号',
    fields: [
      { key: 'title', label: '合同名称', type: 'input' },
      { key: 'paperContractNo', label: '纸质合同号', type: 'input' },
      { key: 'buyer', label: '采购员', type: 'input' },
      { key: 'signatoryCompany', label: '合同主体', type: 'input' },
      { key: 'signatory', label: '合同签约人', type: 'input' },
      { key: 'signedDate', label: '签订日期', type: 'date' },
      { key: 'startDate', label: '起始日期', type: 'date' },
      { key: 'endDate', label: '截止日期', type: 'date' },
      { key: 'contractStatus', label: '合同状态', type: 'select' },
      { key: 'effectiveness', label: '生效状态', type: 'select' }
    ],
    tabs: ['payments', 'clauses'],
    transitions: {
      draft: [{ status: 'submitted', action: 'Submit', label: '提交合同' }],
      submitted: [
        { status: 'draft', action: 'Withdraw', label: '撤回' },
        { status: 'approved', action: 'Approve', label: '审核通过' }
      ],
      approved: [{ status: 'effective', action: 'Activate', label: '生效' }],
      effective: [{ status: 'expired', action: 'Expire', label: '标记失效' }]
    },
    permissions: {
      View: 'ScmPurchaseContract:View',
      Add: 'ScmPurchaseContract:Add',
      Copy: 'ScmPurchaseContract:Copy',
      Edit: 'ScmPurchaseContract:Edit',
      Delete: 'ScmPurchaseContract:Delete',
      Export: 'ScmPurchaseContract:Export',
      Submit: 'ScmPurchaseContract:Submit',
      Withdraw: 'ScmPurchaseContract:Withdraw',
      Approve: 'ScmPurchaseContract:Approve',
      Activate: 'ScmPurchaseContract:Activate',
      Expire: 'ScmPurchaseContract:Expire'
    }
  },
  purchase_request: {
    kind: 'purchase_request',
    menuName: 'ScmPurchaseRequest',
    title: '采购申请',
    description: '从项目需求归集采购物料，跟踪已采购与待采购数量。',
    eyebrow: 'PURCHASE REQUESTS',
    icon: 'ri:file-add-line',
    numberLabel: '采购申请单号',
    fields: [
      { key: 'department', label: '需求部门', type: 'input' },
      { key: 'applicant', label: '申请人', type: 'input' }
    ],
    tabs: [],
    transitions: {},
    permissions: {
      View: 'ScmPurchaseRequest:View',
      Add: 'ScmPurchaseRequest:Add',
      Copy: 'ScmPurchaseRequest:Copy',
      Edit: 'ScmPurchaseRequest:Edit',
      Delete: 'ScmPurchaseRequest:Delete',
      Export: 'ScmPurchaseRequest:Export',
      Import: 'ScmPurchaseRequest:Import',
      Push: 'ScmPurchaseRequest:Push',
      Select: 'ScmPurchaseRequest:Select'
    }
  },
  purchase_order: {
    kind: 'purchase_order',
    menuName: 'ScmPurchaseOrder',
    title: '采购订单',
    description: '从采购申请、合同或报价选单，统筹价格、付款与交货计划。',
    eyebrow: 'PURCHASE ORDERS',
    icon: 'ri:shopping-cart-2-line',
    numberLabel: '采购订单号',
    sourceKind: 'purchase_request',
    fields: [
      { key: 'buyer', label: '采购员', type: 'input' },
      { key: 'ownerType', label: '货主类型', type: 'select' },
      { key: 'ownerId', label: '货主', type: 'input' }
    ],
    tabs: ['payments', 'deliveries'],
    transitions: {
      draft: [{ status: 'submitted', action: 'Submit', label: '提交订单' }],
      submitted: [
        { status: 'draft', action: 'Withdraw', label: '撤回' },
        { status: 'approved', action: 'Approve', label: '审核通过' }
      ],
      approved: [{ status: 'completed', action: 'Complete', label: '完结订单' }]
    },
    permissions: {
      View: 'ScmPurchaseOrder:View',
      Add: 'ScmPurchaseOrder:Add',
      Copy: 'ScmPurchaseOrder:Copy',
      Edit: 'ScmPurchaseOrder:Edit',
      Delete: 'ScmPurchaseOrder:Delete',
      Export: 'ScmPurchaseOrder:Export',
      Import: 'ScmPurchaseOrder:Import',
      Push: 'ScmPurchaseOrder:Push',
      Select: 'ScmPurchaseOrder:Select',
      Submit: 'ScmPurchaseOrder:Submit',
      Withdraw: 'ScmPurchaseOrder:Withdraw',
      Approve: 'ScmPurchaseOrder:Approve',
      Complete: 'ScmPurchaseOrder:Complete',
      RecentPrice: 'ScmPurchaseOrder:RecentPrice'
    }
  },
  receipt_notice: {
    kind: 'receipt_notice',
    menuName: 'ScmReceiptNotice',
    title: '收料通知单',
    description: '从未完成交货的采购订单选择物料，安排供应商到货。',
    eyebrow: 'RECEIPT NOTICES',
    icon: 'ri:inbox-archive-line',
    numberLabel: '收料通知单号',
    sourceKind: 'purchase_order',
    fields: [
      { key: 'constructionNo', label: '施工号', type: 'select' },
      { key: 'contractNo', label: '采购合同号', type: 'input' },
      { key: 'buyer', label: '采购员', type: 'input' },
      { key: 'purchasingOrganization', label: '采购组织', type: 'input' },
      { key: 'keeper', label: '库管员', type: 'input' },
      { key: 'receiptDescription', label: '收料说明', type: 'input', span: 24 }
    ],
    tabs: [],
    transitions: {
      draft: [{ status: 'submitted', action: 'Submit', label: '提交通知' }],
      submitted: [
        { status: 'draft', action: 'Withdraw', label: '撤回' },
        { status: 'completed', action: 'Complete', label: '确认收料' }
      ]
    },
    permissions: {
      View: 'ScmReceiptNotice:View',
      Add: 'ScmReceiptNotice:Add',
      Copy: 'ScmReceiptNotice:Copy',
      Edit: 'ScmReceiptNotice:Edit',
      Delete: 'ScmReceiptNotice:Delete',
      Export: 'ScmReceiptNotice:Export',
      Submit: 'ScmReceiptNotice:Submit',
      Withdraw: 'ScmReceiptNotice:Withdraw',
      Complete: 'ScmReceiptNotice:Complete',
      GenerateBatch: 'ScmReceiptNotice:GenerateBatch',
      GenerateSerial: 'ScmReceiptNotice:GenerateSerial',
      Import: 'ScmReceiptNotice:Import',
      Push: 'ScmReceiptNotice:Push',
      Select: 'ScmReceiptNotice:Select'
    }
  }
}
