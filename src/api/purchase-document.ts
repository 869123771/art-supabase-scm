import { useSupabase } from '@/hooks'
import { omit } from 'lodash-es'
import { normalizeNonNullableText, normalizeNullableText } from '@/utils/form/normalize'
import { fetchAllRangePages } from '@/utils/supabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  ScmPurchaseDocument,
  ScmPurchaseKind,
  ScmPurchaseLine,
  ScmPurchaseQuery,
  ScmPurchaseStatus,
  ScmPurchaseWrite,
  ScmSupplierOption
} from './purchase-document.types'

export * from './purchase-document.types'

export interface ScmPurchaseMaterialCategory {
  id: string
  tenantId: string
  parentId: string | null
  categoryCode: string
  categoryName: string
}

export interface ScmPurchaseProjectOption {
  id: string
  tenantId: string
  projectCode: string
  projectName: string
  customerId: string | null
  projectStatus: string | null
  customer: { customerName: string } | null
  salesperson: { employeeName: string } | null
  owner: { employeeName: string } | null
}

export interface ScmPurchaseMaterialCandidate {
  id: string
  tenantId: string
  categoryId: string | null
  materialCode: string
  materialName: string
  description: string | null
  specificationModel: string | null
  drawingNo: string | null
  basicUnit: string | null
  baseUnitRecord: { unitName: string } | null
  materialSource: string | null
  brand: string | null
  baseUnitId: string | null
  purchaseUnitId: string | null
  inventoryUnitId: string | null
  auxiliaryUnitId: string | null
  auxiliaryUnit2Id: string | null
  unitConversions: Array<{ sourceUnitId: string; baseFactor: number; sourceFactor: number }> | null
  inventoryUnit: { unitName: string } | null
  purchaseUnit: { unitName: string } | null
  auxiliaryUnit: { unitName: string } | null
  auxiliaryUnit2: { unitName: string } | null
  batchManagementEnabled: boolean
  batchRuleId: string | null
}

export interface ScmPurchaseWarehouseOption {
  id: string
  warehouseCode: string
  warehouseName: string
  enableLocations: boolean
}

export interface ScmPurchaseBinOption {
  id: string
  warehouseId: string
  binCode: string
  binName: string
  supportsSerial: boolean
}

export interface ScmPurchaseCustomerOption {
  id: string
  customerCode: string
  customerName: string
}

export interface ScmReceiptBatchOption {
  batchNo: string
  materialId: string
  quantity: number
  warehouseId: string
  receivedAt: string
}

export async function fetchScmReceiptBatchOptions(
  tenantId: string,
  materialId: string,
  query: {
    keyword?: string
    warehouseId?: string
    ownerType?: 'self' | 'supplier' | 'customer'
    ownerId?: string
  }
) {
  const result = await fetchAllRangePages<ScmReceiptBatchOption>(({ from, to }) => {
    let request = supabase
      .from('wms_inventory_batch')
      .select('batch_no,material_id,quantity,warehouse_id,received_at')
      .eq('tenant_id', tenantId)
      .eq('material_id', materialId)
      .eq('owner_type', query.ownerType || 'self')
      .order('received_at', { ascending: false })
      .range(from, to)
    if (query.warehouseId) request = request.eq('warehouse_id', query.warehouseId)
    if (query.ownerId) request = request.eq('owner_id', query.ownerId)
    else request = request.is('owner_id', null)
    if (query.keyword?.trim()) request = request.ilike('batch_no', `%${query.keyword.trim()}%`)
    return responseHandle<ScmReceiptBatchOption[]>(() => request, {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '批号参选数据加载失败，请稍后重试'
    })
  })
  if (result.error) throw result.error
  const batches = new Map<string, ScmReceiptBatchOption>()
  for (const batch of result.data ?? []) {
    const existing = batches.get(batch.batchNo)
    if (existing) existing.quantity += Number(batch.quantity)
    else batches.set(batch.batchNo, { ...batch, quantity: Number(batch.quantity) })
  }
  return { data: [...batches.values()], total: batches.size }
}

export interface ScmReceiptOrderLineChoice extends ScmPurchaseLine {
  choiceId: string
  sourcePurchaseDocumentId: string
  sourceDocumentNo: string
  sourceLineId: string
  sourceLineNo: number
  projectId: string
  projectName: string
  supplierId: string
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const documentSelect =
  '*,project:mdm_project!scm_purchase_document_project_id_fkey(project_code,project_name),document_type:mdm_document_type!scm_purchase_document_document_type_id_fkey(document_type_name)'

export async function fetchScmPurchaseProjectOptions(tenantId: string) {
  const { data } = await responseHandle<ScmPurchaseProjectOption[]>(
    () =>
      supabase
        .from('mdm_project')
        .select(
          'id,tenant_id,project_code,project_name,customer_id,project_status,customer:mdm_customer!mdm_project_customer_tenant_fk(customer_name),salesperson:mdm_employee!mdm_project_sales_tenant_fk(employee_name),owner:mdm_employee!mdm_project_owner_tenant_fk(employee_name)'
        )
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .order('project_name')
        .range(0, 999),
    { breakReturn: true, showErrorMessage: true, errorMessage: '项目参选数据加载失败，请稍后重试' }
  )
  return data ?? []
}

export async function fetchScmProjectSections(tenantId: string) {
  const { data } = await responseHandle<
    Array<{
      id: string
      projectId: string
      constructionNo: string
      sectionName: string
      status: 'active' | 'closed'
    }>
  >(
    () =>
      supabase
        .from('mdm_project_construction')
        .select('id,project_id,construction_no,section_name,status')
        .eq('tenant_id', tenantId)
        .order('construction_no'),
    { breakReturn: true, showErrorMessage: true, errorMessage: '项目施工号加载失败，请稍后重试' }
  )
  return data ?? []
}

export async function fetchScmPurchaseMaterialCategories(tenantId: string) {
  const { data } = await responseHandle<ScmPurchaseMaterialCategory[]>(
    () =>
      supabase
        .from('mdm_material_category')
        .select('id,tenant_id,parent_id,category_code,category_name')
        .eq('tenant_id', tenantId)
        .order('sort')
        .order('category_code')
        .range(0, 999),
    { breakReturn: true, showErrorMessage: true, errorMessage: '物料分类加载失败，请稍后重试' }
  )
  return data ?? []
}

export async function fetchScmPurchaseMaterialCandidates(
  tenantId: string,
  query: { keyword?: string; categoryIds?: string[]; from: number; to: number }
) {
  let request = supabase
    .from('mdm_material')
    .select(
      'id,tenant_id,category_id,material_code,material_name,description,specification_model,drawing_no,basic_unit,material_source,brand,base_unit_id,purchase_unit_id,inventory_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,batch_management_enabled,batch_rule_id,baseUnitRecord:mdm_unit_of_measure!mdm_material_base_unit_fkey(unit_name),purchaseUnit:mdm_unit_of_measure!mdm_material_purchase_unit_id_fkey(unit_name),inventoryUnit:mdm_unit_of_measure!mdm_material_inventory_unit_id_fkey(unit_name),auxiliaryUnit:mdm_unit_of_measure!mdm_material_aux_unit_fkey(unit_name),auxiliaryUnit2:mdm_unit_of_measure!mdm_material_aux_unit_2_fkey(unit_name)',
      { count: 'exact' }
    )
    .eq('tenant_id', tenantId)
    .order('material_code')
    .range(query.from, query.to)
  if (query.categoryIds?.length) request = request.in('category_id', query.categoryIds)
  if (query.keyword?.trim())
    request = request.or(
      buildOrIlikeFilter(
        ['material_code', 'material_name', 'description', 'specification_model', 'drawing_no'],
        query.keyword.trim()
      )
    )
  const { data, total } = await responseHandle<ScmPurchaseMaterialCandidate[]>(() => request, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '物料参选数据加载失败，请稍后重试'
  })
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchScmPurchaseWarehouseOptions(tenantId: string) {
  const { data } = await responseHandle<ScmPurchaseWarehouseOption[]>(
    () =>
      supabase
        .from('mdm_warehouse')
        .select('id,warehouse_code,warehouse_name,enable_locations')
        .eq('tenant_id', tenantId)
        .eq('status', 'enabled')
        .order('warehouse_code')
        .range(0, 999),
    { breakReturn: true, showErrorMessage: true, errorMessage: '仓库加载失败，请稍后重试' }
  )
  return data ?? []
}

export async function fetchScmPurchaseBinOptions(tenantId: string) {
  const { data } = await responseHandle<ScmPurchaseBinOption[]>(
    () =>
      supabase
        .from('mdm_warehouse_bin')
        .select('id,warehouse_id,bin_code,bin_name,supports_serial')
        .eq('tenant_id', tenantId)
        .eq('status', 'available')
        .order('bin_code')
        .range(0, 999),
    { breakReturn: true, showErrorMessage: true, errorMessage: '仓位加载失败，请稍后重试' }
  )
  return data ?? []
}

export async function recommendScmReceiptBin(input: {
  warehouseId: string
  materialId: string
  quantity: number
}): Promise<string | null> {
  const { data } = await responseHandle<string | null>(
    () =>
      supabase.rpc('wms_recommend_bin_secure', {
        p_warehouse_id: input.warehouseId,
        p_material_id: input.materialId,
        p_quantity: input.quantity,
        p_area_sqm: null
      }),
    { breakReturn: true, showErrorMessage: true, errorMessage: '自动选位失败，请稍后重试' }
  )
  return data ?? null
}

export async function fetchScmPurchaseBinOption(tenantId: string, binId: string) {
  const { data } = await responseHandle<ScmPurchaseBinOption>(
    () =>
      supabase
        .from('mdm_warehouse_bin')
        .select('id,warehouse_id,bin_code,bin_name,supports_serial')
        .eq('tenant_id', tenantId)
        .eq('id', binId)
        .eq('status', 'available')
        .single(),
    { breakReturn: true, showErrorMessage: true, errorMessage: '推荐库位加载失败，请稍后重试' }
  )
  return data
}

export async function fetchScmPurchaseCustomerOptions(tenantId: string) {
  const { data } = await responseHandle<ScmPurchaseCustomerOption[]>(
    () =>
      supabase
        .from('mdm_customer')
        .select('id,customer_code,customer_name')
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .order('customer_code')
        .range(0, 999),
    { breakReturn: true, showErrorMessage: true, errorMessage: '客户加载失败，请稍后重试' }
  )
  return data ?? []
}

export async function generateScmReceiptBatchNo(materialId: string): Promise<string> {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('scm_generate_receipt_batch_no_secure', { p_material_id: materialId }),
    {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '批号生成失败，请检查物料批号规则后重试'
    }
  )
  if (!data) throw new Error('批号生成失败，请检查物料批号规则后重试')
  return data
}

async function attachSuppliers(rows: ScmPurchaseDocument[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.supplierId ? [row.supplierId] : [])))]
  if (!ids.length) return rows
  const { data } = await responseHandle<ScmSupplierOption[]>(
    () =>
      supabase.rpc('scm_purchase_suppliers_secure', {
        p_tenant_id: null,
        p_ids: ids
      }),
    { breakReturn: true, showErrorMessage: true, errorMessage: '供应商信息加载失败，请稍后重试' }
  )
  const suppliers = new Map((data ?? []).map((supplier) => [supplier.id, supplier]))
  return rows.map((row) => ({
    ...row,
    supplier: row.supplierId ? (suppliers.get(row.supplierId) ?? null) : null
  }))
}

async function attachSources(rows: ScmPurchaseDocument[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.sourceId ? [row.sourceId] : [])))]
  if (!ids.length) return rows
  const { data } = await responseHandle<
    Array<Pick<ScmPurchaseDocument, 'id' | 'documentNo' | 'kind'>>
  >(() => supabase.from('scm_purchase_document').select('id,document_no,kind').in('id', ids), {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '来源单据加载失败，请稍后重试'
  })
  const sources = new Map(
    (data ?? []).map(({ id, documentNo, kind }) => [id, { documentNo, kind }])
  )
  return rows.map((row) => ({
    ...row,
    source: row.sourceId ? (sources.get(row.sourceId) ?? null) : null
  }))
}

export async function fetchScmPurchaseDocuments(
  kind: ScmPurchaseKind,
  query: ScmPurchaseQuery = {}
) {
  const { keyword, status, tenantId, from = 0, to = 999 } = query
  let request = supabase
    .from('scm_purchase_document')
    .select(documentSelect, { count: 'exact' })
    .eq('kind', kind)
    .order('updated_at', { ascending: false })
    .range(from, to)
  if (keyword?.trim()) {
    const matches = await responseHandle<Array<{ id: string }>>(
      () =>
        supabase.rpc('scm_search_purchase_document_ids', {
          p_kind: kind,
          p_keyword: keyword.trim()
        }),
      { breakReturn: true, showErrorMessage: true, errorMessage: '组合查询失败，请稍后重试' }
    )
    const ids = matches.data?.map((item) => item.id) ?? []
    request = request.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }
  if (status) request = request.eq('status', status)
  if (tenantId) request = request.eq('tenant_id', tenantId)
  const result = await responseHandle<ScmPurchaseDocument[]>(() => request, {
    showErrorMessage: true,
    errorMessage: '采购单据加载失败，请稍后重试'
  })
  if (result.data?.length) {
    const [withSources, withSuppliers] = await Promise.all([
      attachSources(result.data),
      attachSuppliers(result.data)
    ])
    result.data = withSources.map((row, index) => ({
      ...row,
      supplier: withSuppliers[index].supplier
    }))
    if (kind === 'purchase_request') result.data = await attachRequestQuantities(result.data)
  }
  return result
}

async function attachRequestQuantities(rows: ScmPurchaseDocument[]) {
  const data = await fetchPurchaseChildren(
    'purchase_order',
    rows.map((row) => row.id),
    [...new Set(rows.map((row) => row.tenantId))]
  )
  const used = new Map<string, number>()
  for (const order of data)
    for (const line of order.lines)
      if (line.sourceLineId && (line.sourcePurchaseDocumentId || order.sourceId))
        used.set(
          `${line.sourcePurchaseDocumentId || order.sourceId}:${line.sourceLineId}`,
          (used.get(`${line.sourcePurchaseDocumentId || order.sourceId}:${line.sourceLineId}`) ??
            0) + Number(line.sourceQuantity ?? line.quantity)
        )
  return rows.map((row) => ({
    ...row,
    lines: row.lines.map((line) => ({
      ...line,
      purchasedQuantity: used.get(`${row.id}:${line.lineId}`) ?? 0,
      remainingQuantity: Math.max(
        0,
        Number(line.quantity) - (used.get(`${row.id}:${line.lineId}`) ?? 0)
      )
    }))
  }))
}

type PurchaseChild = Pick<
  ScmPurchaseDocument,
  'id' | 'sourceId' | 'status' | 'lines' | 'documentDate'
>

async function fetchPurchaseChildren(
  kind: ScmPurchaseKind,
  sourceIds: string[],
  tenantIds: string[] = []
) {
  if (!sourceIds.length) return [] as PurchaseChild[]
  const result = await fetchAllRangePages<PurchaseChild>(({ from, to }) => {
    let request = supabase
      .from('scm_purchase_document')
      .select('id,source_id,status,lines,document_date')
      .eq('kind', kind)
      .neq('status', 'cancelled')
      .order('id')
      .range(from, to)
    if (kind === 'purchase_order') {
      if (tenantIds.length) request = request.in('tenant_id', tenantIds)
    } else request = request.in('source_id', sourceIds)
    return responseHandle<PurchaseChild[]>(() => request, {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '来源数量加载失败，请稍后重试'
    })
  })
  if (result.error) throw result.error
  return result.data ?? []
}

async function fetchReceiptDocuments(tenantId: string) {
  const result = await fetchAllRangePages<PurchaseChild>(({ from, to }) =>
    responseHandle<PurchaseChild[]>(
      () =>
        supabase
          .from('scm_purchase_document')
          .select('id,source_id,status,lines,document_date')
          .eq('tenant_id', tenantId)
          .eq('kind', 'receipt_notice')
          .neq('status', 'cancelled')
          .order('id')
          .range(from, to),
      { breakReturn: true, showErrorMessage: true, errorMessage: '已收料数量加载失败，请稍后重试' }
    )
  )
  if (result.error) throw result.error
  return result.data ?? []
}

export async function fetchScmReceiptOrderLineChoices(
  tenantId: string,
  supplierId: string,
  projectId?: string
): Promise<ScmReceiptOrderLineChoice[]> {
  const [orderResult, receipts] = await Promise.all([
    fetchAllRangePages<ScmPurchaseDocument>(({ from, to }) => {
      let request = supabase
        .from('scm_purchase_document')
        .select(documentSelect)
        .eq('tenant_id', tenantId)
        .eq('kind', 'purchase_order')
        .eq('supplier_id', supplierId)
        .in('status', ['approved', 'completed'])
        .order('id')
        .range(from, to)
      if (projectId) request = request.eq('project_id', projectId)
      return responseHandle<ScmPurchaseDocument[]>(() => request, {
        breakReturn: true,
        showErrorMessage: true,
        errorMessage: '采购订单明细加载失败，请稍后重试'
      })
    }),
    fetchReceiptDocuments(tenantId)
  ])
  if (orderResult.error) throw orderResult.error
  const used = new Map<string, number>()
  for (const receipt of receipts)
    for (const line of receipt.lines) {
      const sourceId = line.sourcePurchaseDocumentId || receipt.sourceId
      if (!sourceId || !line.sourceLineId) continue
      const key = `${sourceId}:${line.sourceLineId}`
      used.set(key, (used.get(key) ?? 0) + Number(line.quantity))
    }
  return (orderResult.data ?? []).flatMap((order) =>
    order.lines.flatMap((line, index) => {
      const key = `${order.id}:${line.lineId}`
      const remaining = Math.max(0, Number(line.quantity) - (used.get(key) ?? 0))
      return remaining > 0
        ? [
            {
              ...line,
              choiceId: key,
              sourcePurchaseDocumentId: order.id,
              sourceDocumentNo: order.documentNo,
              sourceLineId: line.lineId,
              sourceLineNo: line.lineNo ?? (index + 1) * 10,
              projectId: order.projectId || '',
              projectName: order.project?.projectName || '',
              supplierId: order.supplierId || '',
              quantity: remaining
            }
          ]
        : []
    })
  )
}

async function attachOrderProgress(row: ScmPurchaseDocument) {
  const { data } = await responseHandle<
    Array<{
      lineId: string
      receivedQuantity: number
      recentDeliveryDate: string | null
    }>
  >(
    () =>
      supabase.rpc('scm_purchase_order_inbound_progress_secure', {
        p_order_id: row.id
      }),
    { breakReturn: true, showErrorMessage: true, errorMessage: '采购订单入库进度加载失败' }
  )
  const progress = new Map((data ?? []).map((item) => [item.lineId, item]))
  const allocated = new Map<string, number>()
  return {
    ...row,
    lines: row.lines.map((line) => ({
      ...line,
      receivedQuantity: Number(progress.get(line.lineId)?.receivedQuantity ?? 0),
      remainingQuantity: Math.max(
        0,
        Number(line.quantity) - Number(progress.get(line.lineId)?.receivedQuantity ?? 0)
      )
    })),
    deliveryPlans: row.deliveryPlans.map((plan) => {
      const lineId = plan.lineId || row.lines[0]?.lineId || ''
      const lineProgress = progress.get(lineId)
      const available = Math.max(
        0,
        Number(lineProgress?.receivedQuantity ?? 0) - (allocated.get(lineId) ?? 0)
      )
      const deliveredQuantity = Math.min(Number(plan.quantity), available)
      allocated.set(lineId, (allocated.get(lineId) ?? 0) + deliveredQuantity)
      return {
        ...plan,
        deliveredQuantity,
        remainingQuantity: Math.max(0, Number(plan.quantity) - deliveredQuantity),
        recentDeliveryDate:
          deliveredQuantity > 0 ? lineProgress?.recentDeliveryDate || undefined : undefined
      }
    })
  }
}

export async function fetchScmPurchaseDocument(id: string) {
  const result = await responseHandle<ScmPurchaseDocument>(
    () => supabase.from('scm_purchase_document').select(documentSelect).eq('id', id).single(),
    { breakReturn: true, showErrorMessage: true, errorMessage: '采购单据详情加载失败，请稍后重试' }
  )
  if (result.data) {
    const [withSources, withSuppliers] = await Promise.all([
      attachSources([result.data]),
      attachSuppliers([result.data])
    ])
    const rows = [{ ...withSources[0], supplier: withSuppliers[0].supplier }]
    result.data =
      result.data.kind === 'purchase_request'
        ? (await attachRequestQuantities(rows))[0]
        : result.data.kind === 'purchase_order'
          ? await attachOrderProgress(rows[0])
          : rows[0]
  }
  return result
}

function payload(input: ScmPurchaseWrite) {
  return keysToSnakeDeep({
    kind: input.kind,
    documentNo: normalizeNonNullableText(input.documentNo),
    documentTypeId: input.documentTypeId,
    projectId: input.projectId,
    supplierId: input.supplierId,
    sourceId: input.sourceId,
    documentDate: input.documentDate,
    deliveryDate: input.deliveryDate,
    details: input.details,
    lines: input.lines.map((line) =>
      omit(line, ['purchasedQuantity', 'receivedQuantity', 'remainingQuantity'])
    ),
    paymentPlans: input.paymentPlans,
    deliveryPlans: input.deliveryPlans.map((plan) =>
      omit(plan, ['remainingQuantity', 'recentDeliveryDate'])
    ),
    clauses: input.clauses,
    remark: normalizeNullableText(input.remark)
  })
}

export async function createScmPurchaseDocument(input: ScmPurchaseWrite) {
  return responseHandle<ScmPurchaseDocument>(
    () =>
      supabase
        .from('scm_purchase_document')
        .insert({ ...payload(input), tenant_id: input.tenantId })
        .select('*')
        .single(),
    {
      breakReturn: true,
      showMessage: true,
      message: '采购单据已创建',
      errorMessage: '创建失败，请检查编号、来源数量和当前权限'
    }
  )
}

export async function updateScmPurchaseDocument(id: string, input: ScmPurchaseWrite) {
  return responseHandle<ScmPurchaseDocument>(
    () =>
      supabase
        .from('scm_purchase_document')
        .update(payload(input), { count: 'exact' })
        .eq('id', id)
        .select('*')
        .single(),
    {
      breakReturn: true,
      requireAffected: true,
      showMessage: true,
      message: '采购单据已保存',
      errorMessage: '保存失败，请检查来源数量和当前权限'
    }
  )
}

export async function deleteScmPurchaseDocument(id: string) {
  return responseHandle(
    () => supabase.from('scm_purchase_document').delete({ count: 'exact' }).eq('id', id),
    {
      breakReturn: true,
      requireAffected: true,
      showMessage: true,
      message: '采购单据已删除',
      errorMessage: '删除失败，请确认仍为草稿且未被下游引用'
    }
  )
}

export async function transitionScmPurchaseDocument(id: string, status: ScmPurchaseStatus) {
  return responseHandle<ScmPurchaseDocument>(
    () =>
      supabase
        .from('scm_purchase_document')
        .update({ status }, { count: 'exact' })
        .eq('id', id)
        .select('*')
        .single(),
    {
      breakReturn: true,
      requireAffected: true,
      showMessage: true,
      message: '单据状态已更新',
      errorMessage: '状态变更失败，请检查前置状态和当前权限'
    }
  )
}

export async function fetchScmSupplierOptions(tenantId: string) {
  return responseHandle<ScmSupplierOption[]>(
    () =>
      supabase.rpc('scm_purchase_suppliers_secure', {
        p_tenant_id: tenantId,
        p_ids: null
      }),
    { breakReturn: true, showErrorMessage: true, errorMessage: '供应商列表加载失败，请稍后重试' }
  )
}

export async function fetchScmPurchaseMenuIds() {
  const names = [
    'ScmPurchaseContract',
    'ScmPurchaseRequest',
    'ScmPurchaseOrder',
    'ScmReceiptNotice'
  ]
  return responseHandle<Array<{ id: string; name: string }>>(
    () => supabase.from('sys_menu').select('id,name').in('name', names),
    { breakReturn: true, showErrorMessage: true, errorMessage: '单据类型配置加载失败，请稍后重试' }
  )
}

export async function fetchScmPurchaseSourceOptions(kind: ScmPurchaseKind, tenantId: string) {
  const result = await responseHandle<ScmPurchaseDocument[]>(
    () =>
      supabase
        .from('scm_purchase_document')
        .select(documentSelect)
        .eq('kind', kind)
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .range(0, 499),
    { breakReturn: true, showErrorMessage: true, errorMessage: '来源单据加载失败，请稍后重试' }
  )
  if (result.data?.length) {
    result.data = await attachSuppliers(result.data)
    if (kind === 'purchase_request') result.data = await attachRequestQuantities(result.data)
  }
  return result
}

export async function fetchScmPurchaseRemainingLines(source: ScmPurchaseDocument) {
  const childKind: ScmPurchaseKind =
    source.kind === 'purchase_request' ? 'purchase_order' : 'receipt_notice'
  const data = await fetchPurchaseChildren(childKind, [source.id], [source.tenantId])
  const used = new Map<string, number>()
  for (const document of data)
    for (const line of document.lines)
      if (
        line.sourceLineId &&
        (source.kind !== 'purchase_request' ||
          (line.sourcePurchaseDocumentId || document.sourceId) === source.id)
      )
        used.set(
          line.sourceLineId,
          (used.get(line.sourceLineId) ?? 0) +
            Number(
              source.kind === 'purchase_request'
                ? (line.sourceQuantity ?? line.quantity)
                : line.quantity
            )
        )
  return source.lines.flatMap((line) => {
    const quantity = Math.max(0, Number(line.quantity) - (used.get(line.lineId) ?? 0))
    return quantity > 0
      ? [
          {
            ...line,
            lineId: crypto.randomUUID(),
            sourceLineId: line.lineId,
            sourceDocumentNo: source.documentNo,
            quantity
          }
        ]
      : []
  })
}

export async function fetchScmRecentPurchasePrices(tenantId: string, materialIds: string[]) {
  if (!materialIds.length) return new Map<string, number>()
  const { data } = await responseHandle<Array<Pick<ScmPurchaseDocument, 'lines'>>>(
    () =>
      supabase
        .from('scm_purchase_document')
        .select('lines')
        .eq('tenant_id', tenantId)
        .eq('kind', 'purchase_order')
        .in('status', ['approved', 'completed'])
        .order('document_date', { ascending: false })
        .range(0, 499),
    { breakReturn: true, showErrorMessage: true, errorMessage: '最近采购价加载失败，请稍后重试' }
  )
  const prices = new Map<string, number>()
  for (const document of data ?? [])
    for (const line of document.lines)
      if (materialIds.includes(line.materialId) && !prices.has(line.materialId))
        prices.set(line.materialId, Number(line.unitPrice))
  return prices
}
