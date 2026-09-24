export type ScmPurchaseKind =
  'purchase_contract' | 'purchase_request' | 'purchase_order' | 'receipt_notice'
export type ScmPurchaseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'effective'
  | 'expired'
  | 'purchasing'
  | 'completed'
  | 'cancelled'

export interface ScmPurchaseLine {
  lineId: string
  lineNo?: number
  materialId: string
  materialCode: string
  materialDescription: string
  specification: string
  unit: string
  baseUnit?: string
  stockUnit?: string
  stockQuantity?: number
  baseQuantity?: number
  quantity: number
  unitPrice: number
  taxInclusiveUnitPrice?: number
  taxRate: number
  discountMode?: string
  discountRate: number
  gift: boolean
  needDate?: string
  department?: string
  applicant?: string
  applicantName?: string
  contractNo?: string
  warehouse?: string
  location?: string
  warehouseId?: string
  binId?: string
  ownerType?: 'self' | 'supplier' | 'customer'
  ownerId?: string
  sourcePurchaseDocumentId?: string
  sourceLineId?: string
  sourceDocumentNo?: string
  sourceSalesDocumentId?: string
  quotationLineId?: string
  purchaseContractLineId?: string
  sourceLineNo?: number
  sourceQuantity?: number
  suggestedSupplierId?: string
  reason?: string
  remark?: string
  auxiliaryQuantity?: number
  auxiliaryUnit?: string
  auxiliaryQuantity2?: number
  auxiliaryUnit2?: string
  batchNo?: string
  serialNumbers?: string[]
  purchasedQuantity?: number
  receivedQuantity?: number
  remainingQuantity?: number
}

export interface ScmPurchasePaymentPlan {
  id: string
  contractNo?: string
  contractLine?: number
  isAdvance: boolean
  dueDate: string
  ratio: number
  amount: number
  remark?: string
}

export interface ScmPurchaseDeliveryPlan {
  id: string
  lineId?: string
  unit?: string
  plannedDate: string
  quantity: number
  plannedBaseQuantity?: number
  deliveredQuantity: number
  remainingQuantity?: number
  recentDeliveryDate?: string
  location: string
  address: string
  remark?: string
}

export interface ScmPurchaseClause {
  id: string
  title: string
  content: string
}

export interface ScmPurchaseDetails {
  title?: string
  paperContractNo?: string
  buyer?: string
  buyerName?: string
  applicant?: string
  applicantName?: string
  department?: string
  purchasingOrganization?: string
  keeper?: string
  keeperName?: string
  signatoryCompany?: string
  signatory?: string
  signedDate?: string
  startDate?: string
  endDate?: string
  effectiveness?: string
  contractStatus?: string
  receiptDescription?: string
  contractNo?: string
  paymentMode?: 'ratio' | 'amount'
  ownerType?: 'self' | 'supplier' | 'customer'
  ownerId?: string
}

export interface ScmPurchaseDocument {
  id: string
  tenantId: string
  kind: ScmPurchaseKind
  documentNo: string
  documentTypeId: string | null
  projectId: string | null
  supplierId: string | null
  sourceId: string | null
  status: ScmPurchaseStatus
  documentDate: string
  deliveryDate: string | null
  details: ScmPurchaseDetails
  lines: ScmPurchaseLine[]
  paymentPlans: ScmPurchasePaymentPlan[]
  deliveryPlans: ScmPurchaseDeliveryPlan[]
  clauses: ScmPurchaseClause[]
  subtotal: number
  taxAmount: number
  totalAmount: number
  remark: string | null
  createdAt: string
  updatedAt: string
  project?: { projectCode: string; projectName: string } | null
  supplier?: { supplierCode: string; supplierName: string } | null
  documentType?: { documentTypeName: string } | null
  source?: { documentNo: string; kind: ScmPurchaseKind } | null
}

export type ScmPurchaseWrite = Pick<
  ScmPurchaseDocument,
  | 'tenantId'
  | 'kind'
  | 'documentNo'
  | 'documentTypeId'
  | 'projectId'
  | 'supplierId'
  | 'sourceId'
  | 'documentDate'
  | 'deliveryDate'
  | 'details'
  | 'lines'
  | 'paymentPlans'
  | 'deliveryPlans'
  | 'clauses'
> & { remark: string }

export interface ScmPurchaseQuery {
  keyword?: string
  status?: ScmPurchaseStatus
  tenantId?: string
  from?: number
  to?: number
}

export interface ScmSupplierOption {
  id: string
  tenantId: string
  supplierCode: string
  supplierName: string
}
