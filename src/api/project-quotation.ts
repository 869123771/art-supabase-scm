import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { normalizeNullableText } from '@/utils/form/normalize'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'

export interface ProjectQuotationSummary {
  id: string
  tenantId: string
  projectCode: string
  projectName: string
  customerName: string | null
  projectStatus: string | null
  quotationCount: number
  latestQuotationNo: string | null
  latestQuotationDate: string | null
}

export interface ProjectQuotationProfile extends ProjectQuotationSummary {
  ownerName: string | null
  salespersonName: string | null
  contactName: string | null
  contactPhone: string | null
  addressDetail: string | null
  projectStage: string | null
  remark: string | null
}

export type ProjectQuotationTab =
  | 'categories'
  | 'quotation_lines'
  | 'contracts'
  | 'purchase_requests'
  | 'purchase_orders'
  | 'stock'
  | 'movements'

export interface ProjectQuotationRow {
  id: string
  documentId?: string | null
  documentNo?: string | null
  documentDate?: string | null
  status?: string | null
  categoryName?: string | null
  lineNo?: number | null
  materialCode?: string | null
  materialDescription?: string | null
  specification?: string | null
  brand?: string | null
  quantity?: number | null
  unit?: string | null
  unitPrice?: number | null
  feeTotal?: number | null
  amount?: number | null
  currency?: string | null
  supplierName?: string | null
  warehouseName?: string | null
  sourceWarehouseName?: string | null
  targetWarehouseName?: string | null
  binName?: string | null
  batchNo?: string | null
  constructionNo?: string | null
  movementType?: string | null
  occurredAt?: string | null
  remark?: string | null
}

export interface ProjectQuotationQuery {
  current: number
  size: number
  keyword?: string
  tenantId?: string
}

const { supabase, responseHandle } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '项目报价加载失败，请重试'
}

function isSummary(value: unknown): value is ProjectQuotationSummary {
  return (
    isPlainObjectRecord(value) &&
    ['id', 'tenantId', 'projectCode', 'projectName'].every(
      (key) => typeof value[key] === 'string'
    ) &&
    typeof value.quotationCount === 'number' &&
    Number.isSafeInteger(value.quotationCount) &&
    value.quotationCount >= 0 &&
    ['customerName', 'projectStatus', 'latestQuotationNo', 'latestQuotationDate'].every(
      (key) => value[key] === null || typeof value[key] === 'string'
    )
  )
}

function isProfile(value: unknown): value is ProjectQuotationProfile {
  return (
    isSummary(value) &&
    isPlainObjectRecord(value) &&
    [
      'ownerName',
      'salespersonName',
      'contactName',
      'contactPhone',
      'addressDetail',
      'projectStage',
      'remark'
    ].every((key) => value[key] === null || typeof value[key] === 'string')
  )
}

function isRow(value: unknown): value is ProjectQuotationRow {
  return (
    isPlainObjectRecord(value) &&
    typeof value.id === 'string' &&
    [
      'documentId',
      'documentNo',
      'documentDate',
      'status',
      'categoryName',
      'materialCode',
      'materialDescription',
      'specification',
      'brand',
      'unit',
      'currency',
      'supplierName',
      'warehouseName',
      'sourceWarehouseName',
      'targetWarehouseName',
      'binName',
      'batchNo',
      'constructionNo',
      'movementType',
      'occurredAt',
      'remark'
    ].every((key) => value[key] == null || typeof value[key] === 'string') &&
    ['lineNo', 'quantity', 'unitPrice', 'feeTotal', 'amount'].every(
      (key) => value[key] == null || (typeof value[key] === 'number' && Number.isFinite(value[key]))
    )
  )
}

function page<T>(
  value: unknown,
  validate: (row: unknown) => row is T
): { data: T[]; total: number; error: null } {
  if (
    !isPlainObjectRecord(value) ||
    !Array.isArray(value.records) ||
    !value.records.every(validate) ||
    typeof value.total !== 'number' ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0
  )
    throw new Error('项目报价响应格式异常，请刷新后重试')
  return { data: value.records, total: value.total, error: null }
}

export async function fetchProjectQuotationProjects(query: ProjectQuotationQuery) {
  const range = buildSupabasePageRange(query)
  const { data } = await responseHandle<unknown>(
    () =>
      supabase.rpc('scm_project_quotation_projects', {
        p_keyword: normalizeNullableText(query.keyword),
        p_tenant_id: query.tenantId || null,
        p_limit: query.size,
        p_offset: range.from
      }),
    readOptions
  )
  return page(data, isSummary)
}

export async function fetchProjectQuotationProfile(
  projectId: string
): Promise<ProjectQuotationProfile> {
  const { data } = await responseHandle<unknown>(
    () => supabase.rpc('scm_project_quotation_profile', { p_project_id: projectId }),
    readOptions
  )
  if (!isProfile(data)) throw new Error('项目资料响应格式异常，请刷新后重试')
  return data
}

export async function fetchProjectQuotationTab(
  projectId: string,
  tab: ProjectQuotationTab,
  query: ProjectQuotationQuery
) {
  const range = buildSupabasePageRange(query)
  const { data } = await responseHandle<unknown>(
    () =>
      supabase.rpc('scm_project_quotation_tab', {
        p_project_id: projectId,
        p_tab: tab,
        p_keyword: normalizeNullableText(query.keyword),
        p_limit: query.size,
        p_offset: range.from
      }),
    readOptions
  )
  return page(data, isRow)
}
