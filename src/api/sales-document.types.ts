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

export interface ScmDocumentDetails {
  title?: string
  paperContractNo?: string
  productCategory?: string
  productName?: string
  materialDescription?: string
  signedDate?: string
  effectiveDate?: string
  expiryDate?: string
  salesperson?: string
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
}

export interface ScmDocumentLine {
  lineId: string
  materialId: string
  materialCode: string
  materialDescription: string
  specification?: string
  manufacturer?: string
  salesUnit?: string
  stockUnit?: string
  quantity: number
  unitPrice: number
  taxRate: number
  costUnitPrice?: number
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
  sourceLineId?: string
  deliveredQuantity?: number
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
  materialDescription: string
  specification?: string | null
  unit?: string | null
  materialSource?: string | null
}

export interface ScmDocumentTypeOption {
  id: string
  tenantId: string
  menuId?: string | null
  documentTypeCode: string
  documentTypeName: string
}
