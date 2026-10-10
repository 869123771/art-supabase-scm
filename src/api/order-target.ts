import { useSupabase } from '@/hooks/core/useSupabase'
import type { ScmPurchaseSelection } from './purchase-document'

const { supabase, responseHandle } = useSupabase()

export interface ScmPurchaseInboundTarget {
  targetId: string
  sourceLineIds: string[]
}

export async function prepareScmPurchaseInbound(
  selections: ScmPurchaseSelection[]
): Promise<ScmPurchaseInboundTarget[]> {
  const { data } = await responseHandle<ScmPurchaseInboundTarget[]>(
    () =>
      supabase.rpc('scm_prepare_purchase_inbound_secure', {
        p_selections: selections.map((selection) => ({
          document_id: selection.documentId,
          line_ids: selection.lineIds
        }))
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '采购入库来源加载失败，请刷新后重试'
    }
  )
  if (!data?.length) throw new Error('所选记录已无可入库数量，请刷新后重试')
  return data
}
