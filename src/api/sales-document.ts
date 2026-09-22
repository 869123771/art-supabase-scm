import { useSupabase } from '@/hooks'
import { normalizeNonNullableText, normalizeNullableText } from '@/utils/form/normalize'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  ScmCustomerOption,
  ScmDocumentKind,
  ScmDocumentStatus,
  ScmDocumentTypeOption,
  ScmMaterialOption,
  ScmSalesDocument,
  ScmSalesDocumentQuery,
  ScmSalesDocumentWrite
} from './sales-document.types'

export * from './sales-document.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

const documentSelect =
  '*,project:mdm_project!scm_sales_document_project_id_fkey(project_code,project_name,customer_id),customer:mdm_customer!scm_sales_document_customer_id_fkey(customer_code,customer_name),document_type:mdm_document_type!scm_sales_document_document_type_id_fkey(document_type_code,document_type_name)'

async function withSourceDocuments(documents: ScmSalesDocument[]): Promise<ScmSalesDocument[]> {
  const sourceIds = [
    ...new Set(documents.flatMap((document) => (document.sourceId ? [document.sourceId] : [])))
  ]
  if (!sourceIds.length) return documents

  const { data } = await responseHandle<
    Array<Pick<ScmSalesDocument, 'id' | 'documentNo' | 'kind' | 'status'>>
  >(
    () =>
      supabase.from('scm_sales_document').select('id,document_no,kind,status').in('id', sourceIds),
    { breakReturn: true, showErrorMessage: true, errorMessage: '来源单据加载失败，请稍后重试' }
  )
  const sources = new Map(
    (data ?? []).map(({ id, documentNo, kind, status }) => [id, { documentNo, kind, status }])
  )
  return documents.map((document) => ({
    ...document,
    source: document.sourceId ? (sources.get(document.sourceId) ?? null) : null
  }))
}

export async function fetchScmSalesDocuments(
  kind: ScmDocumentKind,
  query: ScmSalesDocumentQuery = {}
) {
  const { keyword, status, tenantId, projectId, from = 0, to = 999 } = query
  let request = supabase
    .from('scm_sales_document')
    .select(documentSelect, { count: 'exact' })
    .eq('kind', kind)
    .order('updated_at', { ascending: false })
    .range(from, to)
  if (keyword?.trim()) {
    const matches = await responseHandle<Array<{ id: string }>>(
      () =>
        supabase.rpc('scm_search_sales_document_ids', { p_kind: kind, p_keyword: keyword.trim() }),
      { breakReturn: true, showErrorMessage: true, errorMessage: '组合查询失败，请稍后重试' }
    )
    const ids = matches.data?.map((item) => item.id) ?? []
    request = request.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }
  if (status) request = request.eq('status', status)
  if (tenantId) request = request.eq('tenant_id', tenantId)
  if (projectId) request = request.eq('project_id', projectId)
  const result = await responseHandle<ScmSalesDocument[]>(() => request, {
    showErrorMessage: true,
    errorMessage: '单据列表加载失败，请稍后重试'
  })
  if (result.data?.length) result.data = await withSourceDocuments(result.data)
  return result
}

export async function fetchScmSalesDocument(id: string) {
  const result = await responseHandle<ScmSalesDocument>(
    () => supabase.from('scm_sales_document').select(documentSelect).eq('id', id).single(),
    { breakReturn: true, showErrorMessage: true, errorMessage: '单据详情加载失败，请稍后重试' }
  )
  if (result.data) result.data = (await withSourceDocuments([result.data]))[0]
  return result
}

function writePayload(input: ScmSalesDocumentWrite) {
  return {
    kind: input.kind,
    documentNo: normalizeNonNullableText(input.documentNo),
    documentTypeId: input.documentTypeId,
    projectId: input.projectId,
    customerId: input.customerId,
    sourceId: input.sourceId,
    documentDate: input.documentDate,
    deliveryDate: input.deliveryDate,
    currency: normalizeNonNullableText(input.currency),
    details: input.details,
    lines: input.lines,
    fees: input.fees,
    paymentPlans: input.paymentPlans,
    deliveryPlans: input.deliveryPlans,
    clauses: input.clauses,
    remark: normalizeNullableText(input.remark)
  }
}

export async function createScmSalesDocument(input: ScmSalesDocumentWrite) {
  return responseHandle<ScmSalesDocument>(
    () =>
      supabase
        .from('scm_sales_document')
        .insert(keysToSnakeDeep({ ...writePayload(input), tenantId: input.tenantId }))
        .select('*')
        .single(),
    {
      showMessage: true,
      breakReturn: true,
      message: '单据已创建',
      errorMessage: '创建失败，请检查编号、关联数据和当前权限'
    }
  )
}

export async function importScmSalesQuotations(inputs: ScmSalesDocumentWrite[]) {
  return responseHandle<ScmSalesDocument[]>(
    () =>
      supabase
        .from('scm_sales_document')
        .insert(
          inputs.map((input) =>
            keysToSnakeDeep({ ...writePayload(input), tenantId: input.tenantId })
          )
        )
        .select('id'),
    {
      breakReturn: true,
      showMessage: true,
      message: `已导入 ${inputs.length} 份销售报价单`,
      errorMessage: '导入失败，请检查编号、项目、客户和明细数据'
    }
  )
}

export async function updateScmSalesDocument(id: string, input: ScmSalesDocumentWrite) {
  return responseHandle<ScmSalesDocument>(
    () =>
      supabase
        .from('scm_sales_document')
        .update(keysToSnakeDeep(writePayload(input)), { count: 'exact' })
        .eq('id', id)
        .select('*')
        .single(),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      message: '单据已保存',
      errorMessage: '保存失败，请检查单据状态和当前权限'
    }
  )
}

export async function deleteScmSalesDocument(id: string) {
  return responseHandle(
    () => supabase.from('scm_sales_document').delete({ count: 'exact' }).eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      message: '单据已删除',
      errorMessage: '删除失败，请确认单据仍为草稿且未被下游引用'
    }
  )
}

export async function transitionScmSalesDocument(id: string, status: ScmDocumentStatus) {
  return responseHandle<ScmSalesDocument>(
    () =>
      supabase
        .from('scm_sales_document')
        .update({ status }, { count: 'exact' })
        .eq('id', id)
        .select('*')
        .single(),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      message: '单据状态已更新',
      errorMessage: '状态变更失败，请确认前置状态和当前权限'
    }
  )
}

export async function generateScmSalesContract(projectQuotationId: string) {
  return responseHandle<{ id: string; documentNo: string }>(
    () => supabase.rpc('scm_generate_sales_contract', { project_quotation_id: projectQuotationId }),
    {
      showMessage: true,
      breakReturn: true,
      message: '销售合同草稿已生成',
      errorMessage: '生成合同失败，请确认项目报价状态和当前权限'
    }
  )
}

export async function fetchScmCustomerOptions(tenantId?: string, keyword?: string) {
  let request = supabase
    .from('mdm_customer')
    .select('id,tenant_id,customer_code,customer_name')
    .eq('enabled', true)
    .order('customer_name')
    .range(0, 999)
  if (tenantId) request = request.eq('tenant_id', tenantId)
  if (keyword) request = request.or(buildOrIlikeFilter(['customer_code', 'customer_name'], keyword))
  return responseHandle<ScmCustomerOption[]>(() => request, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '客户列表加载失败，请稍后重试'
  })
}

export async function fetchScmMaterialOptions(tenantId?: string) {
  let request = supabase
    .from('mdm_material')
    .select('id,tenant_id,material_code,material_name,description,specification_model,basic_unit')
    .order('material_name')
    .range(0, 999)
  if (tenantId) request = request.eq('tenant_id', tenantId)
  const response = await responseHandle<
    Array<{
      id: string
      tenantId: string
      materialCode: string
      materialName: string
      description: string | null
      specificationModel: string | null
      basicUnit: string | null
    }>
  >(() => request, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '物料列表加载失败，请稍后重试'
  })
  const data: ScmMaterialOption[] = (response.data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    materialCode: row.materialCode,
    materialDescription: row.description || row.materialName,
    specification: row.specificationModel,
    unit: row.basicUnit
  }))
  return { ...response, data }
}

export async function fetchScmDocumentTypeOptions(tenantId?: string) {
  let request = supabase
    .from('mdm_document_type')
    .select('id,tenant_id,document_type_code,document_type_name')
    .eq('enabled', true)
    .order('sort_order')
    .range(0, 999)
  if (tenantId) request = request.eq('tenant_id', tenantId)
  return responseHandle<ScmDocumentTypeOption[]>(() => request, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '单据类型加载失败，请稍后重试'
  })
}

export async function fetchScmSourceOptions(
  kind: ScmDocumentKind,
  tenantId: string,
  projectId?: string | null,
  customerId?: string | null
) {
  let request = supabase
    .from('scm_sales_document')
    .select('*')
    .eq('kind', kind)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .range(0, 499)
  if (projectId) request = request.eq('project_id', projectId)
  if (customerId) request = request.eq('customer_id', customerId)
  return responseHandle<ScmSalesDocument[]>(() => request, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '来源单据加载失败，请稍后重试'
  })
}

export async function fetchScmRemainingSourceLines(source: ScmSalesDocument) {
  if (source.kind !== 'sales_order' && source.kind !== 'shipping_notice') return source.lines
  const childKind: ScmDocumentKind = source.kind === 'sales_order' ? 'shipping_notice' : 'loading'
  const response = await responseHandle<Array<Pick<ScmSalesDocument, 'status' | 'lines'>>>(
    () =>
      supabase
        .from('scm_sales_document')
        .select('id,kind,status,lines')
        .eq('source_id', source.id)
        .eq('kind', childKind)
        .range(0, 9999),
    { breakReturn: true, showErrorMessage: true, errorMessage: '剩余数量加载失败，请稍后重试' }
  )
  const allocated = new Map<string, number>()
  for (const child of response.data ?? []) {
    if (['cancelled', 'closed', 'terminated'].includes(child.status)) continue
    for (const line of child.lines) {
      if (!line.sourceLineId) continue
      allocated.set(line.sourceLineId, (allocated.get(line.sourceLineId) ?? 0) + line.quantity)
    }
  }
  return source.lines
    .map((line) => ({
      ...line,
      quantity: Math.max(0, line.quantity - (allocated.get(line.lineId) ?? 0))
    }))
    .filter((line) => line.quantity > 0)
}
