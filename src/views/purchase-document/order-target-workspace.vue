<template>
  <ArtPermissionGuard :permission="config.viewPermission" :resource-name="config.title">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        :eyebrow="config.eyebrow"
        :title="config.title"
        description="查看由采购订单明细下推生成的目标单据与执行进度。"
        :icon="config.icon"
        :tags="[
          { label: '采购管理', type: 'primary' },
          { label: '订单下推', type: 'info' }
        ]"
      />
      <ArtTableQuery
        v-model="search"
        :search-items="searchItems"
        :api-fn="fetchPage"
        :columns-factory="columnsFactory"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${config.title}目标单据`,
          emptyDescription: '在采购订单列表勾选已审核订单，通过“下推”选择目标和明细。'
        }"
        focusable
      />
      <ArtDialog ref="detailDialogRef" size="xl">
        <div v-if="selected" class="flex min-w-0 flex-col gap-4">
          <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
            <template #title>目标明细加载失败</template>
            <ElButton link type="primary" @click="loadLines">重新加载</ElButton>
          </ElAlert>
          <ArtSectionCard title="单据信息" subtitle="记录来源采购订单及下推时间。">
            <ElDescriptions :column="2" border class="w-full" size="small">
              <ElDescriptionsItem label="目标单号">{{ selected.documentNo }}</ElDescriptionsItem>
              <ElDescriptionsItem label="来源采购订单">{{
                selected.source?.documentNo || '—'
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="状态">{{
                statusLabel(selected.status)
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="下推时间">{{
                formatDateTime(selected.createdAt)
              }}</ElDescriptionsItem>
              <ElDescriptionsItem label="价税合计">{{
                formatCurrencyValue(selected.totalAmount)
              }}</ElDescriptionsItem>
            </ElDescriptions>
          </ArtSectionCard>
          <ArtSectionCard title="目标明细" subtitle="保留下推时的物料、数量和来源行号。">
            <ArtTable
              :data="selectedLines"
              :columns="lineColumns"
              :pagination="false"
              row-key="id"
              table-layout="fixed"
              border
              :max-height="480"
              scrollbar-always-on
              empty-text="暂无目标明细"
            />
          </ArtSectionCard>
        </div>
      </ArtDialog>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { storeToRefs } from 'pinia'
  import dayjs from 'dayjs'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import type { ColumnOption } from '@/types'
  import {
    fetchScmOrderTargetLines,
    fetchScmOrderTargets,
    type ScmOrderTargetDocument,
    type ScmOrderTargetKind,
    type ScmOrderTargetLine
  } from '@scm/api'

  defineOptions({ name: 'ScmOrderTargetWorkspace' })
  const props = defineProps<{ kind: ScmOrderTargetKind }>()
  const configs = {
    purchase_inbound: {
      title: '采购入库',
      eyebrow: 'PURCHASE INBOUND',
      icon: 'ri:inbox-line',
      viewPermission: 'ScmPurchaseInbound:View'
    },
    return_request: {
      title: '退料申请',
      eyebrow: 'PURCHASE RETURNS',
      icon: 'ri:arrow-go-back-line',
      viewPermission: 'ScmPurchaseReturnRequest:View'
    },
    outsource_receipt: {
      title: '委外收货',
      eyebrow: 'OUTSOURCE RECEIPTS',
      icon: 'ri:truck-line',
      viewPermission: 'ScmOutsourceReceipt:View'
    },
    outsource_inbound: {
      title: '委外入库',
      eyebrow: 'OUTSOURCE INBOUND',
      icon: 'ri:warehouse-line',
      viewPermission: 'ScmOutsourceInbound:View'
    }
  } as const
  const config = computed(() => configs[props.kind])
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const search = ref<{ keyword: string }>({ keyword: '' })
  const selected = ref<ScmOrderTargetDocument>()
  const selectedLines = ref<ScmOrderTargetLine[]>([])
  const loadError = ref(false)
  const detailDialogRef = ref<ArtDialogExpose<ScmOrderTargetDocument>>()
  const searchItems: SearchFormItem[] = [
    {
      label: '目标单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '搜索目标单号' }
    }
  ]
  const formatDateTime = (value: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—')
  const statusLabel = (status: ScmOrderTargetDocument['status']) =>
    ({ draft: '待处理', partial: '部分入库', completed: '已完成' })[status]
  const columnsFactory = (): ColumnOption<ScmOrderTargetDocument>[] => [
    {
      prop: 'documentNo',
      label: '目标单号',
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => (
        <button
          type="button"
          class="max-w-full truncate text-left font-semibold text-[var(--el-color-primary)] hover:underline focus-visible:outline-2"
          title={row.documentNo}
          onClick={() => void openDetail(row)}
        >
          {row.documentNo}
        </button>
      )
    },
    {
      prop: 'sourceOrderId',
      label: '来源采购订单',
      minWidth: 175,
      formatter: (row) => row.source?.documentNo || '—'
    },
    {
      prop: 'status',
      label: '状态',
      width: 120,
      formatter: (row) => <span class="text-[var(--art-gray-600)]">{statusLabel(row.status)}</span>
    },
    {
      prop: 'totalAmount',
      label: '价税合计（元）',
      minWidth: 150,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.totalAmount)
    },
    {
      prop: 'createdAt',
      label: '下推时间',
      minWidth: 180,
      formatter: (row) => formatDateTime(row.createdAt)
    }
  ]
  const lineColumns: ColumnOption<ScmOrderTargetLine>[] = [
    {
      prop: 'lineNo',
      label: '行号',
      width: 80,
      formatter: (row) => row.lineSnapshot.lineNo || '—'
    },
    {
      prop: 'materialCode',
      label: '物料编码',
      minWidth: 150,
      formatter: (row) => row.lineSnapshot.materialCode || '—'
    },
    {
      prop: 'materialDescription',
      label: '物料描述',
      minWidth: 240,
      formatter: (row) => row.lineSnapshot.materialDescription || '—'
    },
    {
      prop: 'quantity',
      label: '数量',
      width: 120,
      align: 'right',
      formatter: (row) => row.lineSnapshot.quantity || 0
    },
    {
      prop: 'unit',
      label: '采购单位',
      width: 100,
      formatter: (row) => row.lineSnapshot.unit || '—'
    },
    {
      prop: 'warehouse',
      label: '仓库 / 仓位',
      minWidth: 165,
      formatter: (row) =>
        [row.lineSnapshot.warehouse, row.lineSnapshot.location].filter(Boolean).join(' / ') || '—'
    },
    {
      prop: 'amount',
      label: '价税合计（元）',
      width: 150,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.amount)
    }
  ]
  const fetchPage = (query: { keyword?: string; from?: number; to?: number }) =>
    fetchScmOrderTargets(props.kind, { ...query, tenantId: effectiveTenantId.value || undefined })
  async function loadLines(): Promise<void> {
    if (!selected.value) return
    loadError.value = false
    detailDialogRef.value?.setLoading(true)
    try {
      const { data } = await fetchScmOrderTargetLines(selected.value.id)
      selectedLines.value = data ?? []
    } catch {
      loadError.value = true
    } finally {
      detailDialogRef.value?.setLoading(false)
    }
  }
  async function openDetail(row: ScmOrderTargetDocument) {
    selected.value = row
    selectedLines.value = []
    loadError.value = false
    await detailDialogRef.value?.handleOpen(row, {
      title: `${config.value.title} · ${row.documentNo}`,
      confirmText: '关闭',
      loading: true,
      loadingText: '正在加载目标明细…',
      onOpen: loadLines,
      onConfirm: () => true
    })
  }
</script>
