import { useSupabase } from '@/hooks'

export type ScmOrderTargetKind = 'purchase_inbound'

const { supabase, responseHandle } = useSupabase()

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
