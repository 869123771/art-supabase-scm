import { useSupabase } from '@/hooks'
import { normalizeNonNullableText, normalizeNullableText } from '@/utils/form/normalize'
import { buildOrIlikeFilter } from '@/utils/supabase/search'

export interface ScmQuoteExpense {
  id: string
  tenantId: string
  expenseCode: string
  expenseName: string
  enabled: boolean
  remark: string | null
  sortOrder: number
  textColor: string
  tagStyle: 'plain' | 'light' | 'dark'
  createdAt: string
  updatedAt: string
  tenant?: { tenantName: string; tenantCode: string } | null
}

export interface QuoteExpenseQuery {
  keyword?: string
  enabled?: boolean
  tenantId?: string
  from?: number
  to?: number
}

export interface QuoteExpenseWrite {
  tenantId: string
  expenseCode: string
  expenseName: string
  enabled: boolean
  remark: string
  sortOrder: number
  textColor: string
  tagStyle: ScmQuoteExpense['tagStyle']
}

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()

function writePayload(input: QuoteExpenseWrite) {
  return {
    expenseCode: normalizeNonNullableText(input.expenseCode),
    expenseName: normalizeNonNullableText(input.expenseName),
    enabled: input.enabled,
    remark: normalizeNullableText(input.remark),
    sortOrder: input.sortOrder,
    textColor: input.textColor,
    tagStyle: input.tagStyle
  }
}

export async function fetchQuoteExpenses(query: QuoteExpenseQuery = {}) {
  const { keyword, enabled, tenantId, from = 0, to = 999 } = query
  let request = supabase
    .from('scm_quote_expense')
    .select('*, tenant:sys_tenant!scm_quote_expense_tenant_id_fkey(tenant_name, tenant_code)', {
      count: 'exact'
    })
    .order('sort_order')
    .order('expense_name')
    .range(from, to)
  if (keyword?.trim()) {
    request = request.or(buildOrIlikeFilter(['expense_code', 'expense_name'], keyword.trim()))
  }
  if (enabled !== undefined) request = request.eq('enabled', enabled)
  if (tenantId) request = request.eq('tenant_id', tenantId)
  return responseHandle<ScmQuoteExpense[]>(() => request, { showErrorMessage: true })
}

export async function createQuoteExpense(input: QuoteExpenseWrite) {
  return responseHandle<ScmQuoteExpense>(
    () =>
      supabase
        .from('scm_quote_expense')
        .insert(keysToSnakeDeep({ ...writePayload(input), tenantId: input.tenantId }))
        .select('*')
        .single(),
    { showMessage: true, breakReturn: true, message: '报价费用已创建' }
  )
}

export async function importQuoteExpenses(inputs: QuoteExpenseWrite[]) {
  return responseHandle<ScmQuoteExpense[]>(
    () =>
      supabase
        .from('scm_quote_expense')
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
      message: `已导入 ${inputs.length} 条报价费用`
    }
  )
}

export async function updateQuoteExpense(id: string, input: QuoteExpenseWrite) {
  return responseHandle<ScmQuoteExpense>(
    () =>
      supabase
        .from('scm_quote_expense')
        .update(keysToSnakeDeep(writePayload(input)), { count: 'exact' })
        .eq('id', id)
        .select('*')
        .single(),
    { showMessage: true, breakReturn: true, requireAffected: true, message: '报价费用已更新' }
  )
}

export async function deleteQuoteExpense(id: string) {
  return responseHandle(
    () => supabase.from('scm_quote_expense').delete({ count: 'exact' }).eq('id', id),
    { showMessage: true, breakReturn: true, requireAffected: true, message: '报价费用已删除' }
  )
}
