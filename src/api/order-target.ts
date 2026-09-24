import { useSupabase } from '@/hooks'

export type ScmOrderTargetKind =
  'purchase_inbound' | 'return_request' | 'outsource_receipt' | 'outsource_inbound'

export interface ScmOrderTargetDocument {
  id: string
  tenantId: string
  targetKind: ScmOrderTargetKind
  documentNo: string
  sourceOrderId: string
  projectId: string
  supplierId: string
  status: 'draft'
  totalAmount: number
  createdAt: string
  source?: { documentNo: string } | null
}

export interface ScmOrderTargetLine {
  id: string
  sourceLineId: string
  amount: number
  lineSnapshot: {
    lineNo?: number
    materialCode?: string
    materialDescription?: string
    unit?: string
    quantity?: number
    warehouse?: string
    location?: string
    sourceDocumentNo?: string
    gift?: boolean
  }
}

const { supabase, responseHandle } = useSupabase()

export async function fetchScmOrderTargets(
  kind: ScmOrderTargetKind,
  query: { tenantId?: string; keyword?: string; from?: number; to?: number } = {}
) {
  let request = supabase
    .from('scm_order_target_document')
    .select(
      '*,source:scm_purchase_document!scm_order_target_document_source_order_id_fkey(document_no)',
      {
        count: 'exact'
      }
    )
    .eq('target_kind', kind)
    .order('created_at', { ascending: false })
    .range(query.from ?? 0, query.to ?? 999)
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.keyword?.trim()) request = request.ilike('document_no', `%${query.keyword.trim()}%`)
  return responseHandle<ScmOrderTargetDocument[]>(() => request, {
    showErrorMessage: true,
    errorMessage: '目标单据加载失败，请稍后重试'
  })
}

export async function fetchScmOrderTargetLines(targetId: string) {
  return responseHandle<ScmOrderTargetLine[]>(
    () =>
      supabase
        .from('scm_order_target_line')
        .select('id,source_line_id,amount,line_snapshot')
        .eq('target_document_id', targetId)
        .order('created_at'),
    { breakReturn: true, showErrorMessage: true, errorMessage: '目标单据明细加载失败' }
  )
}

export async function fetchPushedOrderLineIds(orderId: string, kind: ScmOrderTargetKind) {
  const { data } = await responseHandle<Array<{ sourceLineId: string }>>(
    () =>
      supabase
        .from('scm_order_target_line')
        .select('source_line_id')
        .eq('source_order_id', orderId)
        .eq('target_kind', kind),
    { breakReturn: true, showErrorMessage: true, errorMessage: '已下推明细加载失败' }
  )
  return new Set((data ?? []).map((row) => row.sourceLineId))
}

export async function pushScmOrderLines(
  orderId: string,
  lineIds: string[],
  kind: ScmOrderTargetKind
) {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('scm_push_purchase_order_lines_secure', {
        p_order_id: orderId,
        p_line_ids: lineIds,
        p_target_kind: kind
      }),
    {
      breakReturn: true,
      showMessage: true,
      message: '目标单据草稿已生成',
      errorMessage: '下推失败，请检查订单状态、已下推明细及目标权限'
    }
  )
  return data
}
