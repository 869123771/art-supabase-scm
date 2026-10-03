import { useSupabase } from '@/hooks'
import { groupBy, uniq } from 'lodash-es'
import { normalizeNonNullableText, normalizeNullableText } from '@/utils/form/normalize'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import type {
  EmployeeIntegrationItem,
  EmployeeSelectorContractParams
} from '@/api/integration/employees'
import type {
  ScmCustomerOption,
  ScmDocumentKind,
  ScmDocumentStatus,
  ScmDocumentTypeOption,
  ScmEngineeringReferenceOptions,
  ScmMaterialOption,
  ScmProjectQuotationAutomationResult,
  ScmQuotationConversionResult,
  ScmQuotationConversionTarget,
  ScmQuotationMaterialConfig,
  ScmGeneratedQuotationMaterial,
  ScmQuotationWorkOrderConfig,
  ScmQuotationWorkOrderResult,
  ScmSalesDocument,
  ScmSalesContractStatus,
  ScmSalesOrderStatus,
  ScmSalesDocumentQuery,
  ScmSalesDocumentWrite
} from './sales-document.types'

export * from './sales-document.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

const documentSelect =
  '*,project:mdm_project!scm_sales_document_project_id_fkey(project_code,project_name,customer_id),customer:mdm_customer!scm_sales_document_customer_id_fkey(customer_code,customer_name),document_type:mdm_document_type!scm_sales_document_document_type_id_fkey(document_type_code,document_type_name)'

/** Sales contracts can select active roster employees without HR maintenance permissions. */
export async function fetchScmSalespersonOptions(params: EmployeeSelectorContractParams = {}) {
  const { tenantId, keyword, from = 0, to = 9 } = params
  const result = await responseHandle<{ records?: EmployeeIntegrationItem[]; total?: number }>(
    () =>
      supabase.rpc('scm_list_salesperson_options', {
        p_from: Math.max(from, 0),
        p_to: Math.max(to, from),
        p_tenant_id: tenantId || null,
        p_keyword: normalizeNullableText(keyword)
      }),
    { showErrorMessage: true, errorMessage: '销售员花名册加载失败，请稍后重试' }
  )
  return {
    data: result.data?.records ?? [],
    total: result.data?.total ?? 0,
    error: result.error,
    fieldAccess: {}
  }
}

async function withSourceDocuments(documents: ScmSalesDocument[]): Promise<ScmSalesDocument[]> {
  const sourceIds = uniq(
    documents.flatMap((document) => (document.sourceId ? [document.sourceId] : []))
  )
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

async function withContractStatuses(documents: ScmSalesDocument[]): Promise<ScmSalesDocument[]> {
  const contractIds = documents
    .filter((document) => document.kind === 'sales_contract')
    .map((document) => document.id)
  if (!contractIds.length) return documents
  const { data } = await responseHandle<
    Array<{
      contractId: string
      contractStatus: ScmSalesContractStatus
      receivedAmount: number
    }>
  >(() => supabase.rpc('scm_get_contract_statuses', { p_contract_ids: contractIds }), {
    breakReturn: true,
    showErrorMessage: false
  })
  const statuses = new Map((data ?? []).map((status) => [status.contractId, status]))
  return documents.map((document) => ({ ...document, ...statuses.get(document.id) }))
}

async function withOrderStatuses(documents: ScmSalesDocument[]): Promise<ScmSalesDocument[]> {
  const orderIds = documents
    .filter((document) => document.kind === 'sales_order')
    .map((document) => document.id)
  if (!orderIds.length) return documents
  const { data } = await responseHandle<
    Array<{ orderId: string; orderStatus: ScmSalesOrderStatus }>
  >(() => supabase.rpc('scm_get_order_statuses', { p_order_ids: orderIds }), {
    breakReturn: true,
    showErrorMessage: false
  })
  const statuses = new Map((data ?? []).map((status) => [status.orderId, status.orderStatus]))
  return documents.map((document) => ({ ...document, orderStatus: statuses.get(document.id) }))
}

async function withSalesWorkflowStatuses(
  documents: ScmSalesDocument[]
): Promise<ScmSalesDocument[]> {
  const workflowDocuments = documents.filter((document) =>
    ['sales_quotation', 'sales_contract', 'sales_order'].includes(document.kind)
  )
  if (!workflowDocuments.length) return documents
  const { data } = await responseHandle<
    Array<{ id: string; businessId: string; status: ScmSalesDocument['workflowStatus'] }>
  >(
    () =>
      supabase
        .from('wf_instance')
        .select('id,business_id,status')
        .in('business_type', ['scm_sales_quotation', 'scm_sales_contract', 'scm_sales_order'])
        .in(
          'business_id',
          workflowDocuments.map((document) => document.id)
        )
        .order('create_time', { ascending: false }),
    { breakReturn: true, showErrorMessage: false }
  )
  const latest = new Map<string, { id: string; status: ScmSalesDocument['workflowStatus'] }>()
  for (const instance of data ?? []) {
    if (!latest.has(instance.businessId)) {
      latest.set(instance.businessId, instance)
    }
  }
  return documents.map((document) => ({
    ...document,
    workflowStatus: latest.get(document.id)?.status,
    workflowInstanceId: latest.get(document.id)?.id
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
  if (result.data?.length)
    result.data = await withSalesWorkflowStatuses(
      await withOrderStatuses(await withContractStatuses(await withSourceDocuments(result.data)))
    )
  return result
}

export async function fetchScmSalesDocument(id: string) {
  const result = await responseHandle<ScmSalesDocument>(
    () => supabase.from('scm_sales_document').select(documentSelect).eq('id', id).single(),
    { breakReturn: true, showErrorMessage: true, errorMessage: '单据详情加载失败，请稍后重试' }
  )
  if (result.data)
    result.data = (
      await withSalesWorkflowStatuses(
        await withOrderStatuses(
          await withContractStatuses(await withSourceDocuments([result.data]))
        )
      )
    )[0]
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

export async function importScmSalesOrders(inputs: ScmSalesDocumentWrite[]) {
  return responseHandle<ScmSalesDocument[]>(
    () =>
      supabase.rpc('scm_import_sales_orders', {
        p_documents: inputs.map((input) =>
          keysToSnakeDeep({ ...writePayload(input), tenantId: input.tenantId })
        )
      }),
    {
      breakReturn: true,
      showMessage: true,
      message: `已导入 ${inputs.length} 份销售订单`,
      errorMessage: '导入失败，请检查租户、项目、客户和订单明细'
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
      showErrorMessage: false,
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

export async function convertScmStandardQuotation(
  quotationId: string,
  targetKind: ScmQuotationConversionTarget,
  supplierId?: string | null
) {
  return responseHandle<ScmQuotationConversionResult>(
    () =>
      targetKind === 'sales_contract'
        ? supabase.rpc('scm_convert_standard_quotation_to_contract', {
            p_quotation_id: quotationId
          })
        : supabase.rpc('scm_convert_standard_quotation', {
            quotation_id: quotationId,
            target_kind: targetKind,
            supplier_id: supplierId ?? null
          }),
    {
      showMessage: true,
      breakReturn: true,
      message: '下游单据草稿已生成',
      errorMessage: '转单失败，请检查报价状态、物料编码和下游单据权限'
    }
  )
}

export async function generateScmQuotationMaterials(
  quotationId: string,
  lineIds: string[],
  config: ScmQuotationMaterialConfig
) {
  return responseHandle<ScmGeneratedQuotationMaterial[]>(
    () =>
      supabase.rpc('scm_generate_quotation_materials', {
        p_quotation_id: quotationId,
        p_line_ids: lineIds,
        p_config: keysToSnakeDeep(config)
      }),
    {
      breakReturn: true,
      showMessage: true,
      message: `已生成 ${lineIds.length} 个物料编码`,
      errorMessage: '物料编码生成失败，请检查物料配置、报价状态和当前权限'
    }
  )
}

export async function convertScmQuotationLinesToWorkOrders(
  quotationId: string,
  lineIds: string[],
  config: ScmQuotationWorkOrderConfig
) {
  return responseHandle<ScmQuotationWorkOrderResult[]>(
    () =>
      supabase.rpc('scm_convert_quotation_lines_to_work_orders', {
        p_quotation_id: quotationId,
        p_line_ids: lineIds,
        p_work_order_type_id: config.workOrderTypeId || null,
        p_construction_no: normalizeNullableText(config.constructionNo),
        p_planned_start_date: config.plannedStartDate,
        p_planned_end_date: config.plannedEndDate
      }),
    {
      breakReturn: true,
      showMessage: true,
      message: `已生成 ${lineIds.length} 张生产工单`,
      errorMessage: '生产工单生成失败，请检查报价状态、物料编码、工单类型和当前权限'
    }
  )
}

export async function convertScmQuotationToBom(quotationId: string, parentMaterialId: string) {
  return responseHandle<{ id: string; bomCode: string; reused: boolean }>(
    () =>
      supabase.rpc('scm_convert_quotation_to_bom', {
        p_quotation_id: quotationId,
        p_parent_material_id: parentMaterialId
      }),
    {
      breakReturn: true,
      showMessage: true,
      message: '报价 BOM 草稿已生成',
      errorMessage: '转报价 BOM 失败，请检查父件、报价明细和 BOM 权限'
    }
  )
}

export async function activateScmProjectQuotation(projectQuotationId: string) {
  return responseHandle<ScmProjectQuotationAutomationResult>(
    () =>
      supabase.rpc('scm_activate_project_quotation', {
        project_quotation_id: projectQuotationId
      }),
    {
      showMessage: true,
      breakReturn: true,
      message: '工程报价已提交并生效',
      errorMessage: '提交失败，请检查自动建档配置、主数据权限和报价明细'
    }
  )
}

export async function fetchScmEngineeringReferenceOptions(tenantId: string) {
  const [categories, materialTypes, units, codeRules] = await Promise.all([
    fetchAllRangePages(({ from, to }) =>
      responseHandle<
        Array<{ id: string; tenantId: string; categoryCode: string; categoryName: string }>
      >(
        () =>
          supabase
            .from('mdm_material_category')
            .select('id,tenant_id,category_code,category_name')
            .eq('tenant_id', tenantId)
            .eq('status', 'enabled')
            .order('sort')
            .order('category_name')
            .order('id')
            .range(from, to),
        { breakReturn: true, showErrorMessage: false }
      )
    ),
    fetchAllRangePages(({ from, to }) =>
      responseHandle<Array<{ id: string; tenantId: string; typeCode: string; typeName: string }>>(
        () =>
          supabase
            .from('mdm_material_type')
            .select('id,tenant_id,type_code,type_name')
            .eq('tenant_id', tenantId)
            .eq('status', 'enabled')
            .order('sort')
            .order('type_name')
            .order('id')
            .range(from, to),
        { breakReturn: true, showErrorMessage: false }
      )
    ),
    fetchAllRangePages(({ from, to }) =>
      responseHandle<Array<{ id: string; tenantId: string; unitCode: string; unitName: string }>>(
        () =>
          supabase
            .from('mdm_unit_of_measure')
            .select('id,tenant_id,unit_code,unit_name')
            .eq('tenant_id', tenantId)
            .eq('status', 'enabled')
            .order('sort')
            .order('unit_name')
            .order('id')
            .range(from, to),
        { breakReturn: true, showErrorMessage: false }
      )
    ),
    fetchAllRangePages(({ from, to }) =>
      responseHandle<Array<{ id: string; tenantId: string; ruleCode: string; ruleName: string }>>(
        () =>
          supabase
            .from('mdm_material_code_rule')
            .select('id,tenant_id,rule_code,rule_name')
            .eq('tenant_id', tenantId)
            .eq('status', 'enabled')
            .order('sort')
            .order('rule_name')
            .order('id')
            .range(from, to),
        { breakReturn: true, showErrorMessage: false }
      )
    )
  ])

  for (const result of [categories, materialTypes, units, codeRules]) {
    if (result.error) throw result.error
  }

  const data: ScmEngineeringReferenceOptions = {
    categories: (categories.data ?? []).map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      code: item.categoryCode,
      name: item.categoryName
    })),
    materialTypes: (materialTypes.data ?? []).map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      code: item.typeCode,
      name: item.typeName
    })),
    units: (units.data ?? []).map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      code: item.unitCode,
      name: item.unitName
    })),
    codeRules: (codeRules.data ?? []).map((item) => ({
      id: item.id,
      tenantId: item.tenantId,
      code: item.ruleCode,
      name: item.ruleName
    }))
  }
  return { data }
}

export async function fetchScmCustomerOptions(tenantId?: string, keyword?: string) {
  const result = await fetchAllRangePages<ScmCustomerOption>(({ from, to }) => {
    let request = supabase
      .from('mdm_customer')
      .select('id,tenant_id,customer_code,customer_name')
      .eq('enabled', true)
      .order('customer_name')
      .order('id')
      .range(from, to)
    if (tenantId) request = request.eq('tenant_id', tenantId)
    if (keyword)
      request = request.or(buildOrIlikeFilter(['customer_code', 'customer_name'], keyword))
    return responseHandle<ScmCustomerOption[]>(() => request, {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '客户列表加载失败，请稍后重试'
    })
  })
  if (result.error) throw result.error
  return result
}

export async function fetchScmMaterialOptions(tenantId?: string, materialIds?: string[]) {
  const response = await fetchAllRangePages(({ from, to }) => {
    let request = supabase
      .from('mdm_material')
      .select(
        'id,tenant_id,material_code,material_name,description,specification_model,basic_unit,material_source,brand,manufacturer,base_unit_id,purchase_unit_id,sales_unit_id,inventory_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,batch_management_enabled,serial_management_enabled,batch_rule_id,materialCategory:mdm_material_category!smis_material_category_fkey(category_name),materialType:mdm_material_type!mdm_material_type_fkey(type_name),baseUnitRecord:mdm_unit_of_measure!mdm_material_base_unit_fkey(unit_name),purchaseUnit:mdm_unit_of_measure!mdm_material_purchase_unit_id_fkey(unit_name),salesUnit:mdm_unit_of_measure!mdm_material_sales_unit_id_fkey(unit_name),inventoryUnit:mdm_unit_of_measure!mdm_material_inventory_unit_id_fkey(unit_name),auxiliaryUnit:mdm_unit_of_measure!mdm_material_aux_unit_fkey(unit_name),auxiliaryUnit2:mdm_unit_of_measure!mdm_material_aux_unit_2_fkey(unit_name)'
      )
      .order('material_name')
      .order('id')
      .range(from, to)
    if (tenantId) request = request.eq('tenant_id', tenantId)
    if (materialIds?.length) request = request.in('id', materialIds)
    return responseHandle<
      Array<{
        id: string
        tenantId: string
        materialCode: string
        materialName: string
        description: string | null
        specificationModel: string | null
        brand: string | null
        manufacturer: string | null
        materialCategory: { categoryName: string } | null
        materialType: { typeName: string } | null
        basicUnit: string | null
        baseUnitRecord: { unitName: string } | null
        baseUnitId: string | null
        purchaseUnitId: string | null
        salesUnitId: string | null
        salesUnit: { unitName: string } | null
        inventoryUnitId: string | null
        batchManagementEnabled: boolean
        serialManagementEnabled: boolean
        batchRuleId: string | null
        inventoryUnit: { unitName: string } | null
        purchaseUnit: { unitName: string } | null
        materialSource: string | null
        auxiliaryUnitId: string | null
        auxiliaryUnit2Id: string | null
        unitConversions: Array<{
          sourceUnitId: string
          baseFactor: number
          sourceFactor: number
        }> | null
        auxiliaryUnit: { unitName: string } | null
        auxiliaryUnit2: { unitName: string } | null
      }>
    >(() => request, {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '物料列表加载失败，请稍后重试'
    })
  })
  if (response.error) throw response.error
  const data: ScmMaterialOption[] = (response.data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    materialCode: row.materialCode,
    materialDescription: row.description || row.materialName,
    specification: row.specificationModel,
    brand: row.brand,
    manufacturer: row.manufacturer,
    materialCategory: row.materialCategory?.categoryName,
    materialType: row.materialType?.typeName,
    unit: row.basicUnit,
    baseUnitName: row.baseUnitRecord?.unitName,
    baseUnitId: row.baseUnitId,
    purchaseUnitId: row.purchaseUnitId,
    salesUnitId: row.salesUnitId,
    salesUnit: row.salesUnit?.unitName,
    inventoryUnitId: row.inventoryUnitId,
    stockUnit: row.inventoryUnit?.unitName,
    purchaseUnit: row.purchaseUnit?.unitName,
    batchManagementEnabled: row.batchManagementEnabled,
    serialManagementEnabled: row.serialManagementEnabled,
    batchRuleId: row.batchRuleId,
    materialSource: row.materialSource,
    auxiliaryUnit: row.auxiliaryUnit?.unitName,
    auxiliaryUnit2: row.auxiliaryUnit2?.unitName,
    auxiliaryUnitId: row.auxiliaryUnitId,
    auxiliaryUnit2Id: row.auxiliaryUnit2Id,
    unitConversions: row.unitConversions ?? []
  }))
  return { ...response, data }
}

export async function fetchScmDocumentTypeOptions(tenantId?: string, menuName?: string) {
  let menuId: string | undefined
  if (menuName) {
    const menu = await responseHandle<{ id: string }>(
      () => supabase.from('sys_menu').select('id').eq('name', menuName).eq('type', 'menu').single(),
      { breakReturn: true, showErrorMessage: false }
    )
    if (!menu.data) return { data: [] as ScmDocumentTypeOption[] }
    menuId = menu.data.id
  }
  const result = await fetchAllRangePages<ScmDocumentTypeOption>(({ from, to }) => {
    let request = supabase
      .from('mdm_document_type')
      .select('id,tenant_id,menu_id,menu_ids,document_type_code,document_type_name,is_default')
      .eq('enabled', true)
      .order('sort_order')
      .order('id')
      .range(from, to)
    if (tenantId) request = request.eq('tenant_id', tenantId)
    if (menuId) request = request.contains('menu_ids', [menuId])
    return responseHandle<ScmDocumentTypeOption[]>(() => request, {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '单据类型加载失败，请稍后重试'
    })
  })
  if (result.error) throw result.error
  return result
}

export async function fetchScmSourceOptions(
  kind: ScmDocumentKind,
  tenantId: string,
  projectId?: string | null,
  customerId?: string | null
) {
  const result = await fetchAllRangePages<ScmSalesDocument>(({ from, to }) => {
    let request = supabase
      .from('scm_sales_document')
      .select('*')
      .eq('kind', kind)
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .order('id')
      .range(from, to)
    if (projectId) request = request.eq('project_id', projectId)
    if (customerId) request = request.eq('customer_id', customerId)
    return responseHandle<ScmSalesDocument[]>(() => request, {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '来源单据加载失败，请稍后重试'
    })
  })
  if (result.error) throw result.error
  return result
}

export async function fetchScmRemainingSourceLines(
  source: Pick<ScmSalesDocument, 'id' | 'tenantId' | 'kind' | 'lines'>
) {
  if (source.kind !== 'sales_order' && source.kind !== 'shipping_notice') return source.lines
  const childKind: ScmDocumentKind = source.kind === 'sales_order' ? 'shipping_notice' : 'loading'
  const response = await fetchAllRangePages<Pick<ScmSalesDocument, 'status' | 'lines'>>(
    ({ from, to }) =>
      responseHandle<Array<Pick<ScmSalesDocument, 'status' | 'lines'>>>(
        () =>
          supabase
            .from('scm_sales_document')
            .select('id,kind,status,lines')
            .eq('source_id', source.id)
            .eq('tenant_id', source.tenantId)
            .eq('kind', childKind)
            .order('id')
            .range(from, to),
        { breakReturn: true, showErrorMessage: true, errorMessage: '剩余数量加载失败，请稍后重试' }
      )
  )
  if (response.error) throw response.error
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

export interface ScmLoadingChoice {
  key: string
  noticeId: string
  noticeNo: string
  noticeLineId: string
  noticeLineNo: number
  line: ScmSalesDocument['lines'][number]
  noticeQuantity: number
  availableQuantity: number
  loadedQuantity: number
  availableStock: number
  stockBatchId: string
  warehouseId: string
  warehouseName: string
  zoneName: string
  binName: string
  batchNo: string
}

export interface ScmOutboundStockBatch {
  id: string
  materialId: string
  warehouseId: string
  warehouseName: string
  zoneName: string
  binName: string
  batchNo: string
  availableQuantity: number
  serialManagementEnabled: boolean
  serials: Array<{ id: string; serialNo: string }>
}

export async function fetchScmOutboundStocks(
  tenantId: string,
  projectId: string,
  materialId?: string
): Promise<ScmOutboundStockBatch[]> {
  let stockQuery = supabase
    .from('wms_inventory_batch')
    .select(
      'id,material_id,warehouse_id,zone_id,bin_id,batch_no,quantity,project_id,construction_no,organization_id,warehouse:mdm_warehouse!wms_inventory_batch_warehouse_fk(warehouse_name),bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_name),material:mdm_material!wms_inventory_batch_material_fk(serial_management_enabled)'
    )
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('status', 'normal')
    .gt('quantity', 0)
    .order('id')
  let reservationQuery = supabase
    .from('wms_inventory_reservation')
    .select(
      'batch_id,warehouse_id,bin_id,material_id,project_id,construction_no,organization_id,reserved_quantity'
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('id')
  if (materialId) {
    stockQuery = stockQuery.eq('material_id', materialId)
    reservationQuery = reservationQuery.eq('material_id', materialId)
  }
  type StockRow = {
    id: string
    materialId: string
    warehouseId: string
    zoneId: string | null
    binId: string | null
    batchNo: string
    quantity: number
    projectId: string | null
    constructionNo: string | null
    organizationId: string | null
    warehouse?: { warehouseName: string } | null
    bin?: { binName: string } | null
    material?: { serialManagementEnabled: boolean } | null
  }
  type ReservationRow = {
    batchId: string | null
    warehouseId: string
    binId: string | null
    materialId: string
    projectId: string | null
    constructionNo: string | null
    organizationId: string | null
    reservedQuantity: number
  }
  const stocks: StockRow[] = []
  const reservations: ReservationRow[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await responseHandle<StockRow[]>(() => stockQuery.range(offset, offset + 499), {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '可用库存加载失败'
    })
    const page = result.data ?? []
    stocks.push(...page)
    if (page.length < 500) break
  }
  for (let offset = 0; ; offset += 500) {
    const result = await responseHandle<ReservationRow[]>(
      () => reservationQuery.range(offset, offset + 499),
      { breakReturn: true, showErrorMessage: true, errorMessage: '库存预留加载失败' }
    )
    const page = result.data ?? []
    reservations.push(...page)
    if (page.length < 500) break
  }
  const zoneIds = uniq(stocks.flatMap((stock) => (stock.zoneId ? [stock.zoneId] : [])))
  const zones = new Map<string, string>()
  for (let offset = 0; offset < zoneIds.length; offset += 100) {
    const result = await responseHandle<Array<{ id: string; zoneName: string }>>(
      () =>
        supabase
          .from('mdm_warehouse_zone')
          .select('id,zone_name')
          .in('id', zoneIds.slice(offset, offset + 100)),
      { breakReturn: true, showErrorMessage: true, errorMessage: '库存库区加载失败' }
    )
    for (const zone of result.data ?? []) zones.set(zone.id, zone.zoneName)
  }
  const batchIds = stocks.map((stock) => stock.id)
  const serials = new Map<string, Array<{ id: string; serialNo: string }>>()
  for (let offset = 0; offset < batchIds.length; offset += 100) {
    for (let pageOffset = 0; ; pageOffset += 500) {
      const result = await responseHandle<Array<{ id: string; batchId: string; serialNo: string }>>(
        () =>
          supabase
            .from('wms_serial_number')
            .select('id,batch_id,serial_no')
            .in('batch_id', batchIds.slice(offset, offset + 100))
            .eq('status', 'in_stock')
            .order('id')
            .range(pageOffset, pageOffset + 499),
        { breakReturn: true, showErrorMessage: true, errorMessage: '库存序列号加载失败' }
      )
      const page = result.data ?? []
      for (const serial of page) {
        const bucket = serials.get(serial.batchId) ?? []
        bucket.push({ id: serial.id, serialNo: serial.serialNo })
        serials.set(serial.batchId, bucket)
      }
      if (page.length < 500) break
    }
  }
  return stocks
    .map((stock) => {
      const reserved = reservations
        .filter(
          (reservation) =>
            reservation.organizationId === stock.organizationId &&
            reservation.warehouseId === stock.warehouseId &&
            reservation.materialId === stock.materialId &&
            reservation.binId === stock.binId &&
            (reservation.batchId === stock.id ||
              (!reservation.batchId &&
                (!stock.projectId ||
                  (reservation.projectId === stock.projectId &&
                    reservation.constructionNo === stock.constructionNo))))
        )
        .reduce((sum, reservation) => sum + Number(reservation.reservedQuantity), 0)
      return {
        id: stock.id,
        materialId: stock.materialId,
        warehouseId: stock.warehouseId,
        warehouseName: stock.warehouse?.warehouseName ?? '',
        zoneName: zones.get(stock.zoneId ?? '') ?? '',
        binName: stock.bin?.binName ?? '',
        batchNo: stock.batchNo,
        availableQuantity: Math.max(0, Number(stock.quantity) - reserved),
        serialManagementEnabled: Boolean(stock.material?.serialManagementEnabled),
        serials: serials.get(stock.id) ?? []
      }
    })
    .filter((stock) => stock.availableQuantity > 0)
}

/** The server guard rechecks every source line and quantity when a loading document is saved. */
export async function fetchScmLoadingChoices(
  tenantId: string,
  projectId: string,
  customerId: string,
  excludeLoadingId?: string
): Promise<ScmLoadingChoice[]> {
  const notices: ScmSalesDocument[] = []
  const loadings: Array<Pick<ScmSalesDocument, 'id' | 'status' | 'lines'>> = []
  for (let offset = 0; ; offset += 500) {
    const result = await responseHandle<ScmSalesDocument[]>(
      () =>
        supabase
          .from('scm_sales_document')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('kind', 'shipping_notice')
          .eq('project_id', projectId)
          .eq('customer_id', customerId)
          .eq('status', 'submitted')
          .order('id')
          .range(offset, offset + 499),
      { breakReturn: true, showErrorMessage: true, errorMessage: '待装车通知单加载失败' }
    )
    const page = result.data ?? []
    notices.push(...page)
    if (page.length < 500) break
  }
  for (let offset = 0; ; offset += 500) {
    const result = await responseHandle<Array<Pick<ScmSalesDocument, 'id' | 'status' | 'lines'>>>(
      () =>
        supabase
          .from('scm_sales_document')
          .select('id,status,lines')
          .eq('tenant_id', tenantId)
          .eq('kind', 'loading')
          .eq('project_id', projectId)
          .eq('customer_id', customerId)
          .order('id')
          .range(offset, offset + 499),
      { breakReturn: true, showErrorMessage: true, errorMessage: '已装车数量加载失败' }
    )
    const page = result.data ?? []
    loadings.push(...page)
    if (page.length < 500) break
  }
  const stockBatches = await fetchScmOutboundStocks(tenantId, projectId)
  const allocated = new Map<string, number>()
  for (const loading of loadings) {
    if (
      loading.id === excludeLoadingId ||
      ['cancelled', 'closed', 'terminated'].includes(loading.status)
    )
      continue
    for (const line of loading.lines) {
      if (!line.sourceDocumentId || !line.sourceLineId) continue
      const key = `${line.sourceDocumentId}:${line.sourceLineId}`
      allocated.set(key, (allocated.get(key) ?? 0) + Number(line.quantity || 0))
    }
  }
  const choices: ScmLoadingChoice[] = []
  for (const notice of notices) {
    for (const line of notice.lines) {
      const key = `${notice.id}:${line.lineId}`
      const loadedQuantity = allocated.get(key) ?? 0
      const availableQuantity = Math.max(0, Number(line.quantity) - loadedQuantity)
      if (availableQuantity <= 0 || !line.materialId) continue
      const batches = stockBatches.filter((stock) => stock.materialId === line.materialId)
      for (const stock of batches) {
        choices.push({
          key: `${key}:${stock.id}`,
          noticeId: notice.id,
          noticeNo: notice.documentNo,
          noticeLineId: line.lineId,
          noticeLineNo: line.lineNo ?? 0,
          line,
          noticeQuantity: Number(line.quantity),
          availableQuantity,
          loadedQuantity,
          availableStock: stock.availableQuantity,
          stockBatchId: stock.id,
          warehouseId: stock.warehouseId,
          warehouseName: stock.warehouseName,
          zoneName: stock.zoneName,
          binName: stock.binName,
          batchNo: stock.batchNo
        })
      }
    }
  }
  return choices
}

export interface ScmLoadingOutboundRow {
  id: string
  tenantId: string
  loadingId: string
  loadingLineId: string
  loadingNo: string
  projectId: string | null
  projectName: string
  customerName: string
  contractNo: string
  materialId: string
  materialCode: string
  materialDescription: string
  specification: string
  baseUnit: string
  loadedQuantity: number
  deliveredQuantity: number
  outboundStatus: 'pending' | 'partial' | 'complete'
  warehouseName: string
  zoneName: string
  binName: string
  batchNo: string
  serialNos: string
  sourceDocumentNo: string
  sourceLineNo: number
  remark: string
}

interface ScmLoadingAllocation {
  loadingId: string
  loadingLineId: string
  quantity: number
  serialIds: string[]
  batchId: string
}

export async function fetchScmLoadingOutboundRows(
  tenantId?: string
): Promise<ScmLoadingOutboundRow[]> {
  const documents: ScmSalesDocument[] = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from('scm_sales_document')
      .select(documentSelect)
      .eq('kind', 'loading')
      .in('status', ['loaded', 'completed'])
      .order('id')
      .range(offset, offset + 499)
    if (tenantId) query = query.eq('tenant_id', tenantId)
    const result = await responseHandle<ScmSalesDocument[]>(() => query, {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '装车单加载失败'
    })
    const page = result.data ?? []
    documents.push(...page)
    if (page.length < 500) break
  }
  if (!documents.length) return []
  const allocations: ScmLoadingAllocation[] = []
  for (let offset = 0; offset < documents.length; offset += 100) {
    const ids = documents.slice(offset, offset + 100).map((doc) => doc.id)
    for (let pageOffset = 0; ; pageOffset += 500) {
      const result = await responseHandle<ScmLoadingAllocation[]>(
        () =>
          supabase
            .from('scm_loading_outbound_allocation')
            .select('loading_id,loading_line_id,quantity,serial_ids,batch_id')
            .in('loading_id', ids)
            .order('id')
            .range(pageOffset, pageOffset + 499),
        { breakReturn: true, showErrorMessage: true, errorMessage: '装车出库数量加载失败' }
      )
      const page = result.data ?? []
      allocations.push(...page)
      if (page.length < 500) break
    }
  }
  const posted = new Map<string, number>()
  const allocationsByLine = groupBy(
    allocations,
    (allocation) => `${allocation.loadingId}:${allocation.loadingLineId}`
  )
  for (const allocation of allocations) {
    const key = `${allocation.loadingId}:${allocation.loadingLineId}`
    posted.set(key, (posted.get(key) ?? 0) + Number(allocation.quantity))
  }
  const serialIds = uniq(allocations.flatMap((allocation) => allocation.serialIds ?? []))
  const serials = new Map<string, string>()
  for (let offset = 0; offset < serialIds.length; offset += 100) {
    const result = await responseHandle<Array<{ id: string; serialNo: string }>>(
      () =>
        supabase
          .from('wms_serial_number')
          .select('id,serial_no')
          .in('id', serialIds.slice(offset, offset + 100)),
      { breakReturn: true, showErrorMessage: false }
    )
    for (const serial of result.data ?? []) serials.set(serial.id, serial.serialNo)
  }
  const batchIds = uniq(allocations.map((allocation) => allocation.batchId))
  const batches = new Map<
    string,
    { warehouseName: string; zoneId: string | null; binName: string; batchNo: string }
  >()
  for (let offset = 0; offset < batchIds.length; offset += 100) {
    const result = await responseHandle<
      Array<{
        id: string
        zoneId: string | null
        batchNo: string
        warehouse?: { warehouseName: string } | null
        bin?: { binName: string } | null
      }>
    >(
      () =>
        supabase
          .from('wms_inventory_batch')
          .select(
            'id,zone_id,batch_no,warehouse:mdm_warehouse!wms_inventory_batch_warehouse_fk(warehouse_name),bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_name)'
          )
          .in('id', batchIds.slice(offset, offset + 100)),
      { breakReturn: true, showErrorMessage: true, errorMessage: '出库库位加载失败' }
    )
    for (const batch of result.data ?? []) {
      batches.set(batch.id, {
        warehouseName: batch.warehouse?.warehouseName ?? '',
        zoneId: batch.zoneId,
        binName: batch.bin?.binName ?? '',
        batchNo: batch.batchNo
      })
    }
  }
  const zoneIds = uniq(
    [...batches.values()].flatMap((batch) => (batch.zoneId ? [batch.zoneId] : []))
  )
  const zones = new Map<string, string>()
  for (let offset = 0; offset < zoneIds.length; offset += 100) {
    const result = await responseHandle<Array<{ id: string; zoneName: string }>>(
      () =>
        supabase
          .from('mdm_warehouse_zone')
          .select('id,zone_name')
          .in('id', zoneIds.slice(offset, offset + 100)),
      { breakReturn: true, showErrorMessage: true, errorMessage: '出库库区加载失败' }
    )
    for (const zone of result.data ?? []) zones.set(zone.id, zone.zoneName)
  }
  const noticeIds = uniq(
    documents.flatMap((doc) =>
      doc.lines.flatMap((line) => (line.sourceDocumentId ? [line.sourceDocumentId] : []))
    )
  )
  const notices = new Map<string, ScmSalesDocument>()
  for (let offset = 0; offset < noticeIds.length; offset += 100) {
    const result = await responseHandle<ScmSalesDocument[]>(
      () =>
        supabase
          .from('scm_sales_document')
          .select('id,lines')
          .in('id', noticeIds.slice(offset, offset + 100)),
      { breakReturn: true, showErrorMessage: false }
    )
    for (const notice of result.data ?? []) notices.set(notice.id, notice)
  }
  const orderIds = uniq(
    [...notices.values()].flatMap((notice) =>
      notice.lines.flatMap((line) => (line.sourceDocumentId ? [line.sourceDocumentId] : []))
    )
  )
  const orders = new Map<string, ScmSalesDocument>()
  for (let offset = 0; offset < orderIds.length; offset += 100) {
    const result = await responseHandle<ScmSalesDocument[]>(
      () =>
        supabase
          .from('scm_sales_document')
          .select('id,lines')
          .in('id', orderIds.slice(offset, offset + 100)),
      { breakReturn: true, showErrorMessage: false }
    )
    for (const order of result.data ?? []) orders.set(order.id, order)
  }
  return documents.flatMap((document) =>
    document.lines
      .filter((line) => line.sourceDocumentId && line.sourceLineId)
      .map((line) => {
        const quantity = Number(line.quantity)
        const deliveredQuantity = posted.get(`${document.id}:${line.lineId}`) ?? 0
        const noticeLine = notices
          .get(line.sourceDocumentId ?? '')
          ?.lines.find((item) => item.lineId === line.sourceLineId)
        const orderLine = orders
          .get(noticeLine?.sourceDocumentId ?? '')
          ?.lines.find((item) => item.lineId === noticeLine?.sourceLineId)
        const rowAllocations = allocationsByLine[`${document.id}:${line.lineId}`] ?? []
        const usedBatches = rowAllocations.flatMap((allocation) => {
          const batch = batches.get(allocation.batchId)
          return batch ? [batch] : []
        })
        const joinedLocations = (values: string[]) => uniq(values.filter(Boolean)).join('、')
        return {
          id: `${document.id}:${line.lineId}`,
          tenantId: document.tenantId,
          loadingId: document.id,
          loadingLineId: line.lineId,
          loadingNo: document.documentNo,
          projectId: document.projectId,
          projectName: document.project?.projectName ?? '',
          customerName: document.customer?.customerName ?? '',
          contractNo: orderLine?.sourceDocumentNo ?? '',
          materialId: line.materialId,
          materialCode: line.materialCode,
          materialDescription: line.materialDescription,
          specification: line.specification ?? '',
          baseUnit: line.baseUnit ?? '',
          loadedQuantity: quantity,
          deliveredQuantity,
          outboundStatus:
            deliveredQuantity <= 0
              ? ('pending' as const)
              : deliveredQuantity < quantity
                ? ('partial' as const)
                : ('complete' as const),
          warehouseName: joinedLocations(usedBatches.map((batch) => batch.warehouseName)),
          zoneName: joinedLocations(
            usedBatches.map((batch) => zones.get(batch.zoneId ?? '') ?? '')
          ),
          binName: joinedLocations(usedBatches.map((batch) => batch.binName)),
          batchNo: joinedLocations(usedBatches.map((batch) => batch.batchNo)),
          serialNos: rowAllocations
            .flatMap((allocation) =>
              (allocation.serialIds ?? []).map((id) => serials.get(id) ?? '')
            )
            .filter(Boolean)
            .join('、'),
          sourceDocumentNo: line.sourceDocumentNo ?? '',
          sourceLineNo: line.sourceLineNo ?? 0,
          remark: line.remark ?? ''
        }
      })
  )
}

export interface ScmLoadingOutboundWrite {
  loadingId: string
  loadingLineId: string
  batchId: string
  quantity: number
  serialIds: string[]
  remark: string
  requestKey: string
}

export async function postScmLoadingOutbound(items: ScmLoadingOutboundWrite[]): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('scm_post_loading_outbound_secure', {
        p_items: keysToSnakeDeep(items)
      }),
    {
      breakReturn: true,
      showErrorMessage: true,
      errorMessage: '装车出库失败，请核对库存和剩余数量后重试'
    }
  )
}

export async function fetchScmOrderSourceAllocations(
  tenantId: string,
  projectId: string,
  customerId: string,
  excludeOrderId?: string
): Promise<Map<string, number>> {
  const allocated = new Map<string, number>()
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const response = await responseHandle<Array<Pick<ScmSalesDocument, 'id' | 'status' | 'lines'>>>(
      () =>
        supabase
          .from('scm_sales_document')
          .select('id,status,lines')
          .eq('kind', 'sales_order')
          .eq('tenant_id', tenantId)
          .eq('project_id', projectId)
          .eq('customer_id', customerId)
          .order('id')
          .range(offset, offset + pageSize - 1),
      {
        breakReturn: true,
        showErrorMessage: true,
        errorMessage: '合同可开单数量加载失败，请稍后重试'
      }
    )
    const orders = response.data ?? []
    for (const order of orders) {
      if (order.id === excludeOrderId) continue
      if (['cancelled', 'closed', 'terminated'].includes(order.status)) continue
      for (const line of order.lines) {
        if (!line.sourceDocumentId || !line.sourceLineId) continue
        const key = `${line.sourceDocumentId}:${line.sourceLineId}`
        allocated.set(key, (allocated.get(key) ?? 0) + Number(line.quantity || 0))
      }
    }
    if (orders.length < pageSize) break
  }
  return allocated
}
