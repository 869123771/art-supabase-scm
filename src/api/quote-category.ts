import { useSupabase } from '@/hooks'
import { normalizeNonNullableText, normalizeNullableText } from '@/utils/form/normalize'
import { buildOrIlikeFilter } from '@/utils/supabase/search'

export interface QuoteCategoryFee {
  expenseId: string
  amount: number
}

export interface ScmQuoteCategory {
  id: string
  tenantId: string
  projectId: string
  categoryName: string
  quantity: number
  unitPrice: number
  feeItems: QuoteCategoryFee[]
  feeTotal: number
  totalAmount: number
  remark: string | null
  createdAt: string
  updatedAt: string
  project?: { projectCode: string; projectName: string } | null
}

export interface QuoteCategoryQuery {
  keyword?: string
  projectId?: string
  tenantId?: string
  from?: number
  to?: number
}

export interface QuoteCategoryWrite {
  tenantId: string
  projectId: string
  categoryName: string
  quantity: number
  unitPrice: number
  feeItems: QuoteCategoryFee[]
  remark: string
}

export interface ScmProjectOption {
  id: string
  tenantId: string
  projectCode: string
  projectName: string
  customerId: string | null
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

export async function fetchQuoteCategories(query: QuoteCategoryQuery = {}) {
  const { keyword, projectId, tenantId, from = 0, to = 999 } = query
  let request = supabase
    .from('scm_quote_category')
    .select(
      '*, project:mdm_project!scm_quote_category_project_id_fkey(project_code,project_name)',
      {
        count: 'exact'
      }
    )
    .order('updated_at', { ascending: false })
    .range(from, to)
  if (keyword?.trim()) {
    const { data: projects } = await fetchScmProjectOptions(tenantId, keyword.trim())
    const categorySearch = buildOrIlikeFilter(['category_name'], keyword.trim())
    const projectSearch = projects?.length
      ? `,project_id.in.(${projects.map((project) => project.id).join(',')})`
      : ''
    request = request.or(`${categorySearch}${projectSearch}`)
  }
  if (projectId) request = request.eq('project_id', projectId)
  if (tenantId) request = request.eq('tenant_id', tenantId)
  return responseHandle<ScmQuoteCategory[]>(() => request, { showErrorMessage: true })
}

export async function fetchScmProjectOptions(tenantId?: string, keyword?: string) {
  let request = supabase
    .from('mdm_project')
    .select('id,tenant_id,project_code,project_name,customer_id')
    .eq('enabled', true)
    .order('project_name')
    .range(0, 999)
  if (tenantId) request = request.eq('tenant_id', tenantId)
  if (keyword) {
    request = request.or(buildOrIlikeFilter(['project_code', 'project_name'], keyword))
  }
  return responseHandle<ScmProjectOption[]>(() => request, {
    breakReturn: true,
    showErrorMessage: true,
    errorMessage: '项目列表加载失败，请稍后重试'
  })
}

function writePayload(input: QuoteCategoryWrite) {
  return {
    projectId: input.projectId,
    categoryName: normalizeNonNullableText(input.categoryName),
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    feeItems: input.feeItems,
    remark: normalizeNullableText(input.remark)
  }
}

export async function createQuoteCategory(input: QuoteCategoryWrite) {
  return responseHandle<ScmQuoteCategory>(
    () =>
      supabase
        .from('scm_quote_category')
        .insert(keysToSnakeDeep({ ...writePayload(input), tenantId: input.tenantId }))
        .select('*')
        .single(),
    { showMessage: true, breakReturn: true, message: '报价项分类已创建' }
  )
}

export async function importQuoteCategories(inputs: QuoteCategoryWrite[]) {
  return responseHandle<ScmQuoteCategory[]>(
    () =>
      supabase
        .from('scm_quote_category')
        .insert(
          inputs.map((input) =>
            keysToSnakeDeep({ ...writePayload(input), tenantId: input.tenantId })
          )
        )
        .select('*'),
    {
      showMessage: true,
      showErrorMessage: false,
      breakReturn: true,
      message: `已导入 ${inputs.length} 条报价项分类`
    }
  )
}

export async function updateQuoteCategory(id: string, input: QuoteCategoryWrite) {
  return responseHandle<ScmQuoteCategory>(
    () =>
      supabase
        .from('scm_quote_category')
        .update(keysToSnakeDeep(writePayload(input)), { count: 'exact' })
        .eq('id', id)
        .select('*')
        .single(),
    { showMessage: true, breakReturn: true, requireAffected: true, message: '报价项分类已更新' }
  )
}

export async function deleteQuoteCategory(id: string) {
  return responseHandle(
    () => supabase.from('scm_quote_category').delete({ count: 'exact' }).eq('id', id),
    { showMessage: true, breakReturn: true, requireAffected: true, message: '报价项分类已删除' }
  )
}
