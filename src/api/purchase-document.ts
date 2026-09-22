import { useSupabase } from '@/hooks'
import { omit } from 'lodash-es'
import { normalizeNonNullableText, normalizeNullableText } from '@/utils/form/normalize'
import { fetchAllRangePages } from '@/utils/supabase'
import type {
  ScmPurchaseDocument,
  ScmPurchaseKind,
  ScmPurchaseQuery,
  ScmPurchaseStatus,
  ScmPurchaseWrite,
  ScmSupplierOption
} from './purchase-document.types'

export * from './purchase-document.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const documentSelect =
  '*,project:mdm_project!scm_purchase_document_project_id_fkey(project_code,project_name),document_type:mdm_document_type!scm_purchase_document_document_type_id_fkey(document_type_name)'

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
    rows.map((row) => row.id)
  )
  const used = new Map<string, number>()
  for (const order of data)
    for (const line of order.lines)
      if (line.sourceLineId)
        used.set(line.sourceLineId, (used.get(line.sourceLineId) ?? 0) + Number(line.quantity))
  return rows.map((row) => ({
    ...row,
    lines: row.lines.map((line) => ({
      ...line,
      purchasedQuantity: used.get(line.lineId) ?? 0,
      remainingQuantity: Math.max(0, Number(line.quantity) - (used.get(line.lineId) ?? 0))
    }))
  }))
}

type PurchaseChild = Pick<
  ScmPurchaseDocument,
  'id' | 'sourceId' | 'status' | 'lines' | 'documentDate'
>

async function fetchPurchaseChildren(kind: ScmPurchaseKind, sourceIds: string[]) {
  if (!sourceIds.length) return [] as PurchaseChild[]
  const result = await fetchAllRangePages<PurchaseChild>(({ from, to }) =>
    responseHandle<PurchaseChild[]>(
      () =>
        supabase
          .from('scm_purchase_document')
          .select('id,source_id,status,lines,document_date')
          .eq('kind', kind)
          .in('source_id', sourceIds)
          .neq('status', 'cancelled')
          .order('id')
          .range(from, to),
      { breakReturn: true, showErrorMessage: true, errorMessage: '来源数量加载失败，请稍后重试' }
    )
  )
  if (result.error) throw result.error
  return result.data ?? []
}

async function attachOrderProgress(row: ScmPurchaseDocument) {
  const receipts = (await fetchPurchaseChildren('receipt_notice', [row.id])).filter(
    (item) => item.status === 'completed'
  )
  const received = new Map<string, number>()
  let recentDeliveryDate: string | undefined
  for (const receipt of receipts) {
    if (!recentDeliveryDate || receipt.documentDate > recentDeliveryDate)
      recentDeliveryDate = receipt.documentDate
    for (const line of receipt.lines)
      if (line.sourceLineId)
        received.set(
          line.sourceLineId,
          (received.get(line.sourceLineId) ?? 0) + Number(line.quantity)
        )
  }
  let unallocated = [...received.values()].reduce((sum, quantity) => sum + quantity, 0)
  return {
    ...row,
    lines: row.lines.map((line) => ({
      ...line,
      receivedQuantity: received.get(line.lineId) ?? 0,
      remainingQuantity: Math.max(0, Number(line.quantity) - (received.get(line.lineId) ?? 0))
    })),
    deliveryPlans: row.deliveryPlans.map((plan) => {
      const deliveredQuantity = Math.min(Number(plan.quantity), unallocated)
      unallocated -= deliveredQuantity
      return {
        ...plan,
        deliveredQuantity,
        remainingQuantity: Math.max(0, Number(plan.quantity) - deliveredQuantity),
        recentDeliveryDate: deliveredQuantity > 0 ? recentDeliveryDate : undefined
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
  if (result.data?.length) result.data = await attachSuppliers(result.data)
  return result
}

export async function fetchScmPurchaseRemainingLines(source: ScmPurchaseDocument) {
  const childKind: ScmPurchaseKind =
    source.kind === 'purchase_request' ? 'purchase_order' : 'receipt_notice'
  const data = await fetchPurchaseChildren(childKind, [source.id])
  const used = new Map<string, number>()
  for (const document of data)
    for (const line of document.lines)
      if (line.sourceLineId)
        used.set(line.sourceLineId, (used.get(line.sourceLineId) ?? 0) + Number(line.quantity))
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
