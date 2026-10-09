export type ScmDocumentKind =
  | 'sales_quotation'
  | 'project_quotation'
  | 'sales_contract'
  | 'sales_order'
  | 'shipping_notice'
  | 'loading'

export type ScmDocumentStatus =
  | 'draft'
  | 'created'
  | 'submitted'
  | 'approved'
  | 'effective'
  | 'expired'
  | 'completed'
  | 'closed'
  | 'terminated'
  | 'archived'
  | 'fulfilling'
  | 'cancelled'
  | 'shipped'
  | 'loaded'

export type ScmSalesContractStatus = 'DRAFT' | 'SUBM' | 'APRV' | 'PRUN' | 'PCOM' | 'FCOM' | 'CNCL'
export type ScmSalesOrderStatus =
  'DRAFT' | 'SUBM' | 'APRV' | 'PRUN' | 'PDEL' | 'FDEL' | 'CLSD' | 'CNCL'

export interface ScmDocumentDetails {
  quotationScene?: 'standard' | 'project'
  title?: string
  paperContractNo?: string
  contractTotalAmount?: number
  productCategory?: string
  productName?: string
  quotationQuantity?: number
  materialDescription?: string
  signedDate?: string
  effectiveDate?: string
  expiryDate?: string
  salesperson?: string
  salespersonId?: string
  salesDepartment?: string
  signatoryCompany?: string
  customerSignatory?: string
  projectOwner?: string
  projectDepartment?: string
  contactName?: string
  contactPhone?: string
  packageFee?: number
  transportFee?: number
  vehicleType?: string
  projectDescription?: string
  constructionNo?: string
  plannedProjectName?: string
  projectAddress?: string
  autoCreateProject?: boolean
  autoCreateMaterials?: boolean
  autoBuildBom?: boolean
  materialCategoryId?: string
  materialTypeId?: string
  baseUnitId?: string
  materialCodeRuleId?: string
  automationResult?: ScmProjectQuotationAutomationResult
  deliveryAddress?: string
  terminalCustomer?: string
  shippingAddress?: string
  receivingAddress?: string
  receiverName?: string
  receiverPhone?: string
  transportMode?: string
  transportNotes?: string
  vehiclePlate?: string
  carrierName?: string
  driverName?: string
  driverPhone?: string
  freightCost?: number
  paymentPlanMode?: 'ratio' | 'amount'
  contractStatus?: string
}

export interface ScmProjectQuotationAutomationResult {
  projectId?: string
  projectCode?: string
  projectName?: string
  materialIds: string[]
  reusedMaterialIds?: string[]
  bomIds: string[]
  executedAt?: string
}

export interface ScmEngineeringReferenceOption {
  id: string
  code: string
  name: string
  tenantId: string
}

export interface ScmEngineeringReferenceOptions {
  categories: ScmEngineeringReferenceOption[]
  materialTypes: ScmEngineeringReferenceOption[]
  units: ScmEngineeringReferenceOption[]
  codeRules: ScmEngineeringReferenceOption[]
}

export type ScmQuotationConversionTarget =
  'sales_order' | 'sales_contract' | 'purchase_request' | 'purchase_order'

export interface ScmQuotationConversionResult {
  id: string
  documentNo: string
  targetKind: ScmQuotationConversionTarget
  reused: boolean
}

export interface ScmQuotationMaterialConfig {
  materialTypeId: string
  materialSource: string
  categoryId: string
  baseUnitId: string
  codeRuleId: string
  imageUrls: string[]
  lineConfigs?: ScmQuotationMaterialLineConfig[]
}

export interface ScmQuotationMaterialLineConfig {
  quotationId?: string
  lineId: string
  baseUnitId: string
  purchaseUnitId: string
  salesUnitId: string
  inventoryUnitId: string
  productionUnitId: string
  costUnitId: string
}

export interface ScmQuotationConversionQuantity {
  targetKind: ScmQuotationConversionTarget
  lineId: string
  quantity: number
}

export interface ScmQuotationWorkOrderConfig {
  workOrderTypeId: string
  constructionNo: string
  plannedStartDate: string
  plannedEndDate: string
}

export interface ScmQuotationWorkOrderResult {
  lineId: string
  workOrderId: string
  workOrderNo: string
}

export interface ScmGeneratedQuotationMaterial {
  lineId: string
  materialId: string
  materialCode: string
}

export interface ScmDocumentLine {
  lineId: string
  lineNo?: number
  materialId: string
  materialCode: string
  materialDescription: string
  materialSource?: string
  specification?: string
  manufacturer?: string
  brand?: string
  materialCategory?: string
  materialType?: string
  baseUnit?: string
  division?: string
  salesUnit?: string
  stockUnit?: string
  quantity: number | null
  unitPrice: number
  taxRate: number
  costUnitPrice?: number
  quoteFactor?: number
  gift?: boolean
  discountMode?: string
  discountRate?: number
  unitQuantity?: number
  auxiliaryQuantity?: number
  auxiliaryUnit?: string
  auxiliaryQuantity2?: number
  auxiliaryUnit2?: string
  discountFactor?: number
  listPrice?: number
  warehouse?: string
  location?: string
  needDate?: string
  deliveryDate?: string
  sourceLineId?: string
  sourceDocumentId?: string
  sourceDocumentNo?: string
  sourceLineNo?: number
  stockBatchId?: string
  warehouseId?: string
  warehouseName?: string
  zoneName?: string
  binName?: string
  batchNo?: string
  deliveredQuantity?: number
  shippingNoticeQuantity?: number
  returnedQuantity?: number
  undeliveredQuantity?: number
  outboundQuantity?: number
  returnQuantity?: number
  remark?: string
}

export interface ScmDocumentFee {
  expenseId: string
  amount: number
  cost: number
  remark?: string
}

export interface ScmPaymentPlan {
  id: string
  paymentTypes?: string[]
  isAdvance: boolean
  dueDate: string
  ratio: number
  amount: number
  excessRatio?: number
  remark?: string
}

export interface ScmDeliveryPlan {
  id: string
  location: string
  address: string
  needDate: string
  leadDays: number
  plannedDate: string
  quantity: number
  remark?: string
}

export interface ScmContractClause {
  id: string
  title: string
  content: string
}

export interface ScmSalesDocument {
  id: string
  tenantId: string
  kind: ScmDocumentKind
  documentNo: string
  documentTypeId: string | null
  projectId: string | null
  customerId: string | null
  sourceId: string | null
  status: ScmDocumentStatus
  contractStatus?: ScmSalesContractStatus
  orderStatus?: ScmSalesOrderStatus
  workflowStatus?: 'running' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled'
  workflowInstanceId?: string
  workflowInitiatorUserId?: string
  receivedAmount?: number
  documentDate: string
  deliveryDate: string | null
  currency: string
  details: ScmDocumentDetails
  lines: ScmDocumentLine[]
  fees: ScmDocumentFee[]
  paymentPlans: ScmPaymentPlan[]
  deliveryPlans: ScmDeliveryPlan[]
  clauses: ScmContractClause[]
  subtotal: number
  feeTotal: number
  taxAmount: number
  costTotal: number
  totalAmount: number
  grossProfit: number
  grossMargin: number
  remark: string | null
  createdAt: string
  updatedAt: string
  project?: { projectCode: string; projectName: string; customerId: string | null } | null
  customer?: { customerCode: string; customerName: string } | null
  documentType?: { documentTypeCode: string; documentTypeName: string } | null
  source?: { documentNo: string; kind: ScmDocumentKind; status: ScmDocumentStatus } | null
}

export interface ScmSalesDocumentWrite {
  tenantId: string
  kind: ScmDocumentKind
  documentNo: string
  documentTypeId: string | null
  projectId: string | null
  customerId: string | null
  sourceId: string | null
  documentDate: string
  deliveryDate: string | null
  currency: string
  details: ScmDocumentDetails
  lines: ScmDocumentLine[]
  fees: ScmDocumentFee[]
  paymentPlans: ScmPaymentPlan[]
  deliveryPlans: ScmDeliveryPlan[]
  clauses: ScmContractClause[]
  remark: string
}

export interface ScmSalesDocumentQuery {
  keyword?: string
  status?: ScmDocumentStatus
  tenantId?: string
  projectId?: string
  from?: number
  to?: number
}

export interface ScmCustomerOption {
  id: string
  tenantId: string
  customerCode: string
  customerName: string
}

export interface ScmMaterialOption {
  id: string
  tenantId: string
  materialCode: string
  materialName?: string
  categoryId?: string | null
  materialDescription: string
  specification?: string | null
  brand?: string | null
  manufacturer?: string | null
  materialCategory?: string | null
  materialType?: string | null
  unit?: string | null
  baseUnitName?: string | null
  baseUnitId?: string | null
  purchaseUnitId?: string | null
  salesUnitId?: string | null
  salesUnit?: string | null
  inventoryUnitId?: string | null
  stockUnit?: string | null
  purchaseUnit?: string | null
  batchManagementEnabled?: boolean
  serialManagementEnabled?: boolean
  batchRuleId?: string | null
  materialSource?: string | null
  auxiliaryUnit?: string | null
  auxiliaryUnit2?: string | null
  auxiliaryUnitId?: string | null
  auxiliaryUnit2Id?: string | null
  unitConversions?: Array<{ sourceUnitId: string; baseFactor: number; sourceFactor: number }>
}

export interface ScmDocumentTypeOption {
  id: string
  tenantId: string
  menuId?: string | null
  menuIds: string[]
  documentTypeCode: string
  documentTypeName: string
  isDefault: boolean
}
