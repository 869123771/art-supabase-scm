import type { ScmDocumentDetails, ScmDocumentKind, ScmDocumentStatus } from '@scm/api'

export interface ScmDetailField {
  key: keyof ScmDocumentDetails
  label: string
  type: 'input' | 'date' | 'number' | 'select' | 'slot'
  dictionary?: string
  required?: boolean
  span?: number
}

export interface ScmDocumentTransition {
  status: ScmDocumentStatus
  action: string
  label: string
  confirm?: string
}

export interface ScmDocumentConfig {
  kind: ScmDocumentKind
  menuName: string
  permissions: Record<string, string>
  title: string
  description: string
  icon: string
  eyebrow: string
  numberLabel: string
  sourceKind?: ScmDocumentKind
  sourceLabel?: string
  sourceRequired?: boolean
  statusValues: ScmDocumentStatus[]
  transitions: Record<string, ScmDocumentTransition[]>
  fields: ScmDetailField[]
  useFees?: boolean
  usePaymentPlans?: boolean
  useDeliveryPlans?: boolean
  useClauses?: boolean
  allowImport?: boolean
  projectRequired?: boolean
}

const salesQuotation: ScmDocumentConfig = {
  kind: 'sales_quotation',
  menuName: 'ScmSalesQuotationDoc',
  permissions: {
    View: 'ScmSalesQuotationDoc:View',
    Add: 'ScmSalesQuotationDoc:Add',
    Edit: 'ScmSalesQuotationDoc:Edit',
    Delete: 'ScmSalesQuotationDoc:Delete',
    Copy: 'ScmSalesQuotationDoc:Copy',
    Import: 'ScmSalesQuotationDoc:Import',
    Export: 'ScmSalesQuotationDoc:Export',
    Convert: 'ScmSalesQuotationDoc:Convert',
    Activate: 'ScmSalesQuotationDoc:Activate',
    Expire: 'ScmSalesQuotationDoc:Expire'
  },
  title: '销售报价单',
  description: '统一录入标准产品与项目工程报价；工程数据由本单手填或批量导入。',
  icon: 'ri:file-list-3-line',
  eyebrow: 'SALES QUOTATIONS',
  numberLabel: '报价单号',
  statusValues: ['draft', 'effective', 'expired'],
  transitions: {
    draft: [
      {
        status: 'effective',
        action: 'Activate',
        label: '生效',
        confirm: '生效后不可直接修改报价内容。'
      }
    ],
    effective: [{ status: 'expired', action: 'Expire', label: '标记失效' }]
  },
  fields: [
    { key: 'effectiveDate', label: '生效日期', type: 'date' },
    { key: 'expiryDate', label: '失效日期', type: 'date' },
    { key: 'productCategory', label: '报价产品分类', type: 'input' },
    { key: 'productName', label: '产品名称', type: 'input' },
    { key: 'materialDescription', label: '物料描述', type: 'input', span: 24 }
  ],
  useFees: true,
  allowImport: true,
  projectRequired: false
}

const projectQuotation: ScmDocumentConfig = {
  kind: 'project_quotation',
  menuName: 'ScmProjectQuotation',
  permissions: {
    View: 'ScmProjectQuotation:View',
    Add: 'ScmProjectQuotation:Add',
    Edit: 'ScmProjectQuotation:Edit',
    Delete: 'ScmProjectQuotation:Delete',
    Copy: 'ScmProjectQuotation:Copy',
    Export: 'ScmProjectQuotation:Export',
    Activate: 'ScmProjectQuotation:Activate',
    Complete: 'ScmProjectQuotation:Complete',
    Close: 'ScmProjectQuotation:Close',
    GenerateContract: 'ScmProjectQuotation:GenerateContract',
    GeneratePlan: 'ScmProjectQuotation:GeneratePlan'
  },
  title: '项目报价',
  description: '由销售报价单生成；提交时按来源报价的配置联动项目、物料编码与 BOM。',
  icon: 'ri:briefcase-4-line',
  eyebrow: 'PROJECT QUOTATIONS',
  numberLabel: '报价单号',
  sourceKind: 'sales_quotation',
  sourceLabel: '来源销售报价单',
  sourceRequired: true,
  statusValues: ['created', 'effective', 'completed', 'closed'],
  transitions: {
    created: [
      {
        status: 'effective',
        action: 'Activate',
        label: '提交并生效',
        confirm: '系统将按来源销售报价单的设置创建项目、物料编码和 BOM 草稿。'
      }
    ],
    effective: [
      { status: 'completed', action: 'Complete', label: '完结' },
      { status: 'closed', action: 'Close', label: '关闭' }
    ]
  },
  fields: [
    { key: 'plannedProjectName', label: '项目名称', type: 'input' },
    { key: 'projectAddress', label: '项目地址', type: 'input', span: 24 },
    { key: 'projectOwner', label: '负责人', type: 'input' },
    { key: 'projectDepartment', label: '负责部门', type: 'input' },
    { key: 'contactName', label: '联系人', type: 'input' },
    { key: 'contactPhone', label: '联系电话', type: 'input' },
    { key: 'constructionNo', label: '施工号', type: 'input', required: true },
    { key: 'packageFee', label: '包装费（元）', type: 'number' },
    { key: 'transportFee', label: '运输费（元）', type: 'number' },
    { key: 'vehicleType', label: '运载工具车', type: 'input' },
    { key: 'projectDescription', label: '项目描述', type: 'input', span: 24 }
  ],
  useFees: true,
  projectRequired: false
}

const salesContract: ScmDocumentConfig = {
  kind: 'sales_contract',
  menuName: 'ScmSalesContract',
  permissions: {
    View: 'ScmSalesContract:View',
    Add: 'ScmSalesContract:Add',
    Edit: 'ScmSalesContract:Edit',
    Delete: 'ScmSalesContract:Delete',
    Copy: 'ScmSalesContract:Copy',
    Export: 'ScmSalesContract:Export',
    Submit: 'ScmSalesContract:Submit',
    Withdraw: 'ScmSalesContract:Withdraw',
    Approve: 'ScmSalesContract:Approve',
    Activate: 'ScmSalesContract:Activate',
    Terminate: 'ScmSalesContract:Terminate',
    Archive: 'ScmSalesContract:Archive'
  },
  title: '销售合同',
  description: '从合同拟定到审核、生效和归档，统一管理合同明细、收款计划与条款。',
  icon: 'ri:contract-line',
  eyebrow: 'SALES CONTRACTS',
  numberLabel: '合同编号',
  sourceKind: 'project_quotation',
  sourceLabel: '来源项目报价',
  statusValues: ['draft', 'submitted', 'approved', 'effective', 'terminated', 'archived'],
  transitions: {
    draft: [{ status: 'submitted', action: 'Submit', label: '提交评审' }],
    submitted: [
      { status: 'draft', action: 'Withdraw', label: '撤回' },
      { status: 'approved', action: 'Approve', label: '审核通过' }
    ],
    approved: [{ status: 'effective', action: 'Activate', label: '生效' }],
    effective: [
      {
        status: 'terminated',
        action: 'Terminate',
        label: '终止合同',
        confirm: '终止后不可继续履约。'
      },
      { status: 'archived', action: 'Archive', label: '归档' }
    ],
    terminated: [{ status: 'archived', action: 'Archive', label: '归档' }]
  },
  fields: [
    { key: 'title', label: '合同名称', type: 'input', required: true, span: 24 },
    { key: 'paperContractNo', label: '纸质合同号', type: 'input' },
    { key: 'salespersonId', label: '销售员', type: 'slot' },
    { key: 'signedDate', label: '签订日期', type: 'date' },
    { key: 'effectiveDate', label: '起始日期', type: 'date' },
    { key: 'expiryDate', label: '截止日期', type: 'date' },
    { key: 'signatoryCompany', label: '签署单位', type: 'input' },
    { key: 'customerSignatory', label: '客户签约人', type: 'input' }
  ],
  usePaymentPlans: true,
  useClauses: true
}

const salesOrder: ScmDocumentConfig = {
  kind: 'sales_order',
  menuName: 'ScmSalesOrder',
  permissions: {
    View: 'ScmSalesOrder:View',
    Add: 'ScmSalesOrder:Add',
    Edit: 'ScmSalesOrder:Edit',
    Delete: 'ScmSalesOrder:Delete',
    Copy: 'ScmSalesOrder:Copy',
    Import: 'ScmSalesOrder:Import',
    Export: 'ScmSalesOrder:Export',
    Select: 'ScmSalesOrder:Select',
    Push: 'ScmSalesOrder:Push',
    Submit: 'ScmSalesOrder:Submit',
    Withdraw: 'ScmSalesOrder:Withdraw',
    Approve: 'ScmSalesOrder:Approve',
    Fulfill: 'ScmSalesOrder:Fulfill',
    Complete: 'ScmSalesOrder:Complete',
    Cancel: 'ScmSalesOrder:Cancel'
  },
  title: '销售订单',
  description: '从报价、合同或物料编制订单，安排收款与发货计划。',
  icon: 'ri:shopping-bag-3-line',
  eyebrow: 'SALES ORDERS',
  numberLabel: '销售订单号',
  sourceKind: 'sales_contract',
  sourceLabel: '来源销售合同',
  statusValues: ['draft', 'submitted', 'approved', 'fulfilling', 'completed', 'cancelled'],
  transitions: {
    draft: [{ status: 'submitted', action: 'Submit', label: '提交订单' }],
    submitted: [
      { status: 'draft', action: 'Withdraw', label: '撤回' },
      { status: 'approved', action: 'Approve', label: '审核通过' }
    ],
    approved: [
      { status: 'fulfilling', action: 'Fulfill', label: '开始履约' },
      { status: 'cancelled', action: 'Cancel', label: '取消' }
    ],
    fulfilling: [
      { status: 'completed', action: 'Complete', label: '完结订单' },
      { status: 'cancelled', action: 'Cancel', label: '取消' }
    ]
  },
  fields: [
    { key: 'salespersonId', label: '销售员', type: 'slot' },
    { key: 'salesDepartment', label: '销售部门', type: 'input' },
    { key: 'deliveryAddress', label: '送货地址', type: 'input', span: 24 }
  ],
  usePaymentPlans: true,
  useDeliveryPlans: true
}

const shippingNotice: ScmDocumentConfig = {
  kind: 'shipping_notice',
  menuName: 'ScmShippingNotice',
  permissions: {
    View: 'ScmShippingNotice:View',
    Add: 'ScmShippingNotice:Add',
    Edit: 'ScmShippingNotice:Edit',
    Delete: 'ScmShippingNotice:Delete',
    Copy: 'ScmShippingNotice:Copy',
    Export: 'ScmShippingNotice:Export',
    Submit: 'ScmShippingNotice:Submit',
    Withdraw: 'ScmShippingNotice:Withdraw',
    Ship: 'ScmShippingNotice:Ship',
    Complete: 'ScmShippingNotice:Complete'
  },
  title: '发货通知单',
  description: '选取销售订单明细或直接添加物料，安排发货地址与运输方式。',
  icon: 'ri:truck-line',
  eyebrow: 'SHIPPING NOTICES',
  numberLabel: '发货通知单号',
  sourceKind: 'sales_order',
  sourceLabel: '来源销售订单',
  sourceRequired: false,
  statusValues: ['draft', 'submitted', 'shipped', 'completed'],
  transitions: {
    draft: [{ status: 'submitted', action: 'Submit', label: '提交通知' }],
    submitted: [
      { status: 'draft', action: 'Withdraw', label: '撤回' },
      { status: 'shipped', action: 'Ship', label: '确认发货' }
    ],
    shipped: [{ status: 'completed', action: 'Complete', label: '发货完成' }]
  },
  fields: [
    { key: 'terminalCustomer', label: '终端客户', type: 'input' },
    { key: 'shippingAddress', label: '发货地址', type: 'input', span: 24 },
    { key: 'receivingAddress', label: '收货地址', type: 'input', span: 24 },
    { key: 'receiverName', label: '接收人', type: 'input' },
    { key: 'receiverPhone', label: '联系电话', type: 'input' },
    { key: 'transportMode', label: '运输方式', type: 'select', dictionary: 'scmTransportMode' },
    { key: 'transportNotes', label: '运输说明', type: 'input', span: 24 }
  ]
}

const loading: ScmDocumentConfig = {
  kind: 'loading',
  menuName: 'ScmLoading',
  permissions: {
    View: 'ScmLoading:View',
    Add: 'ScmLoading:Add',
    Edit: 'ScmLoading:Edit',
    Delete: 'ScmLoading:Delete',
    Copy: 'ScmLoading:Copy',
    Export: 'ScmLoading:Export',
    Load: 'ScmLoading:Load',
    Complete: 'ScmLoading:Complete'
  },
  title: '发货装车',
  description: '从已发货通知单选择物料，登记车牌、承运人、运费和装车明细。',
  icon: 'ri:truck-fill',
  eyebrow: 'VEHICLE LOADING',
  numberLabel: '装车单号',
  sourceKind: 'shipping_notice',
  sourceLabel: '来源发货通知单',
  sourceRequired: true,
  statusValues: ['draft', 'loaded', 'completed'],
  transitions: {
    draft: [{ status: 'loaded', action: 'Load', label: '确认装车' }],
    loaded: [{ status: 'completed', action: 'Complete', label: '装车完成' }]
  },
  fields: [
    { key: 'terminalCustomer', label: '终端客户', type: 'input' },
    { key: 'vehiclePlate', label: '车牌号', type: 'input' },
    { key: 'carrierName', label: '承运单位', type: 'input' },
    { key: 'driverName', label: '承运人', type: 'input' },
    { key: 'driverPhone', label: '承运电话', type: 'input' },
    { key: 'freightCost', label: '运费（元）', type: 'number' },
    { key: 'shippingAddress', label: '发货地址', type: 'input', span: 24 },
    { key: 'receivingAddress', label: '收货地址', type: 'input', span: 24 },
    { key: 'receiverName', label: '接收人', type: 'input' },
    { key: 'receiverPhone', label: '联系电话', type: 'input' },
    { key: 'transportNotes', label: '运输说明', type: 'input', span: 24 }
  ]
}

export const scmDocumentConfigs: Record<ScmDocumentKind, ScmDocumentConfig> = {
  sales_quotation: salesQuotation,
  project_quotation: projectQuotation,
  sales_contract: salesContract,
  sales_order: salesOrder,
  shipping_notice: shippingNotice,
  loading
}
