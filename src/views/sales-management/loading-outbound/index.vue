<template>
  <ArtPermissionGuard permission="ScmLoadingOutbound:View" resource-name="装车出库">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        eyebrow="LOADING OUTBOUND"
        title="装车出库"
        description="按装车明细核对库存批次并办理销售出库。"
        icon="ri:logout-box-r-line"
        :tags="[
          { label: '销售业务', type: 'primary' },
          { label: '库存出库', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>

      <ArtTableQuery
        ref="tableRef"
        v-model="query"
        :search-items="searchItems"
        :api-fn="fetchPage"
        :columns-factory="columnsFactory"
        :search-bar-props="{ span: 6, labelWidth: 82, showExpand: true }"
        :table-props="{
          rowKey: displayMode === 'document' ? 'loadingId' : 'id',
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          emptyText: '暂无符合条件的装车明细',
          emptyDescription: '请调整状态或查询条件，或先确认装车单。'
        }"
        focusable
      >
        <template #search-displayMode>
          <ElRadioGroup
            v-model="displayMode"
            aria-label="单据列表展示方式"
            @change="tableRef?.refreshContext()"
          >
            <ElRadioButton label="document" value="document">按单据</ElRadioButton>
            <ElRadioButton label="line" value="line">按明细</ElRadioButton>
          </ElRadioGroup>
        </template>
      </ArtTableQuery>

      <ArtDialog ref="outboundDialogRef" size="xl">
        <div class="flex min-w-0 flex-col gap-3">
          <p class="text-sm text-[var(--art-gray-700)]">
            {{ activeRow?.loadingNo }} · {{ activeRow?.materialDescription }}：待出库
            <strong class="tabular-nums">{{ remainingQuantity }}</strong>
            {{ activeRow?.baseUnit }}。选择库存批次后可修改各批次出库数量。
          </p>
          <ElAlert v-if="stockError" type="error" :title="stockError" show-icon :closable="false" />
          <ArtTable
            :data="stockChoices"
            :columns="stockColumns"
            :loading="stockLoading"
            :pagination="false"
            :max-height="430"
            row-key="id"
            border
            scrollbar-always-on
            empty-text="暂无可用库存"
            empty-description="请检查项目库存、库位预留及物料批次。"
            @selection-change="onStockSelection"
          />
          <p class="text-xs text-[var(--art-gray-600)]">
            已选 {{ selectedStocks.length }} 个批次 · 本次出库
            {{
              selectedStocks.reduce((sum, stock) => sum + Number(stock.outboundQuantity || 0), 0)
            }}
            {{ activeRow?.baseUnit }}
          </p>
        </div>
      </ArtDialog>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { computed, ref, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useRoute } from 'vue-router'
  import {
    ElAlert,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElOption,
    ElSelect,
    ElTag
  } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import type { ColumnOption } from '@/types'
  import { documentGroupSpan, groupDocumentLines } from '@/utils/business/document-detail-list'
  import {
    fetchScmLoadingOutboundRows,
    fetchScmOutboundStocks,
    postScmLoadingOutbound,
    type ScmLoadingOutboundRow,
    type ScmOutboundStockBatch
  } from '@scm/api'

  defineOptions({ name: 'ScmLoadingOutbound' })

  interface StockChoice extends ScmOutboundStockBatch {
    outboundQuantity: number
    selectedSerialIds: string[]
    remark: string
  }

  const route = useRoute()
  const { hasAuth } = useAuth()
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId } = storeToRefs(tenantScopeStore)
  const tableRef = ref<ArtTableQueryExpose>()
  type LoadingListRow = ScmLoadingOutboundRow & { detailCount?: number }
  const displayMode = ref<'document' | 'line'>('document')
  const visibleRows = ref<LoadingListRow[]>([])
  const lineProperties = new Set([
    'materialCode',
    'materialDescription',
    'specification',
    'baseUnit',
    'loadedQuantity',
    'deliveredQuantity',
    'warehouseName',
    'zoneName',
    'binName',
    'batchNo',
    'serialNos',
    'sourceDocumentNo',
    'sourceLineNo',
    'outboundStatus',
    'operation'
  ])
  function mergeDocumentCells({
    rowIndex,
    column
  }: {
    rowIndex: number
    column: { property?: string }
  }) {
    return displayMode.value === 'line'
      ? documentGroupSpan(
          visibleRows.value,
          rowIndex,
          column.property,
          lineProperties,
          (row) => row.loadingId
        )
      : ([1, 1] as [number, number])
  }
  const query = ref({
    status: 'pending' as 'pending' | 'partial' | 'complete' | 'all',
    loadingNo: '',
    materialDescription: '',
    projectName: '',
    customerName: ''
  })
  const targetLoadingId = computed(() => String(route.query.loadingId ?? ''))
  const searchItems: SearchFormItem[] = [
    { label: '展示方式', key: 'displayMode', type: 'text' },
    {
      label: '出库状态',
      key: 'status',
      type: 'select',
      props: {
        options: [
          { label: '未出库', value: 'pending' },
          { label: '部分出库', value: 'partial' },
          { label: '已全出库', value: 'complete' },
          { label: '全部状态', value: 'all' }
        ]
      }
    },
    { label: '装车单号', key: 'loadingNo', type: 'input', props: { clearable: true } },
    { label: '物料描述', key: 'materialDescription', type: 'input', props: { clearable: true } },
    { label: '项目名称', key: 'projectName', type: 'input', props: { clearable: true } },
    { label: '客户全称', key: 'customerName', type: 'input', props: { clearable: true } }
  ]
  const activeRow = ref<ScmLoadingOutboundRow>()
  const remainingQuantity = computed(() =>
    Math.max(0, (activeRow.value?.loadedQuantity ?? 0) - (activeRow.value?.deliveredQuantity ?? 0))
  )
  const outboundDialogRef = ref<ArtDialogExpose>()
  const stockChoices = ref<StockChoice[]>([])
  const selectedStocks = ref<StockChoice[]>([])
  const stockLoading = ref(false)
  const stockError = ref('')

  async function fetchPage(params: typeof query.value & { current?: number; size?: number }) {
    const rows = await fetchScmLoadingOutboundRows(effectiveTenantId.value || undefined)
    const contains = (value: string, term?: string) =>
      value.toLocaleLowerCase().includes((term ?? '').trim().toLocaleLowerCase())
    const baseRows = rows.filter((row) => {
      if (targetLoadingId.value && row.loadingId !== targetLoadingId.value) return false
      if (params.status !== 'all' && row.outboundStatus !== (params.status ?? 'pending'))
        return false
      return (
        contains(row.loadingNo, params.loadingNo) &&
        contains(row.projectName, params.projectName) &&
        contains(row.customerName, params.customerName)
      )
    })
    const filtered = baseRows.filter((row) =>
      contains(row.materialDescription, params.materialDescription)
    )
    const matchingLoadingIds = new Set(filtered.map((row) => row.loadingId))
    const displayRows =
      displayMode.value === 'line'
        ? filtered
        : groupDocumentLines(
            baseRows.filter((row) => matchingLoadingIds.has(row.loadingId)),
            (row) => row.loadingId
          ).map(({ first, lines }) => ({
            ...first,
            materialDescription: `共 ${lines.length} 项物料`,
            detailCount: lines.length,
            outboundStatus: lines.every((line) => line.outboundStatus === 'complete')
              ? ('complete' as const)
              : lines.some((line) => line.outboundStatus !== 'pending')
                ? ('partial' as const)
                : ('pending' as const)
          }))
    const current = Math.max(1, Number(params.current) || 1)
    const size = Math.max(1, Number(params.size) || 20)
    const pageRows = displayRows.slice((current - 1) * size, current * size)
    visibleRows.value = displayMode.value === 'line' ? pageRows : []
    return {
      records: pageRows,
      total: displayRows.length,
      current,
      size
    }
  }

  const columnsFactory = (): ColumnOption<LoadingListRow>[] => [
    { prop: 'loadingNo', label: '装车单号', minWidth: 170, fixed: 'left' },
    { prop: 'projectName', label: '项目名称', minWidth: 180, showOverflowTooltip: true },
    { prop: 'customerName', label: '客户全称', minWidth: 180, showOverflowTooltip: true },
    { prop: 'contractNo', label: '合同号', minWidth: 160 },
    ...(displayMode.value === 'line'
      ? [{ prop: 'materialCode', label: '物料编码', minWidth: 150 }]
      : []),
    { prop: 'materialDescription', label: '物料描述', minWidth: 210, showOverflowTooltip: true },
    ...(displayMode.value === 'document'
      ? [{ prop: 'detailCount', label: '明细', width: 85 }]
      : []),
    ...(displayMode.value === 'line'
      ? [
          { prop: 'specification', label: '规格型号', minWidth: 140 },
          { prop: 'baseUnit', label: '基本单位', width: 100 },
          { prop: 'loadedQuantity', label: '装车数量', width: 110, align: 'right' },
          { prop: 'deliveredQuantity', label: '已交货数量', width: 120, align: 'right' },
          { prop: 'warehouseName', label: '仓库', minWidth: 130 },
          { prop: 'zoneName', label: '库区', minWidth: 110 },
          { prop: 'binName', label: '库位', minWidth: 110 },
          { prop: 'batchNo', label: '批次', minWidth: 120 },
          { prop: 'serialNos', label: '序列号', minWidth: 150, showOverflowTooltip: true },
          { prop: 'sourceDocumentNo', label: '来源单据', minWidth: 170 },
          { prop: 'sourceLineNo', label: '源行号', width: 95 }
        ]
      : []),
    {
      prop: 'outboundStatus',
      label: '出库状态',
      width: 110,
      formatter: (row: LoadingListRow) => (
        <ElTag
          type={
            row.outboundStatus === 'complete'
              ? 'success'
              : row.outboundStatus === 'partial'
                ? 'warning'
                : 'info'
          }
        >
          {{ pending: '未出库', partial: '部分出库', complete: '已全出库' }[row.outboundStatus]}
        </ElTag>
      )
    },
    ...(displayMode.value === 'line'
      ? [
          {
            prop: 'operation',
            label: '操作',
            width: 110,
            fixed: 'right' as const,
            formatter: (row: LoadingListRow) => (
              <ArtButtonTable
                permission="ScmLoadingOutbound:Issue"
                label="出库"
                icon="ri:logout-box-r-line"
                showLabel
                disabled={
                  row.outboundStatus === 'complete' ||
                  !row.materialId ||
                  !row.projectId ||
                  !hasAuth('ScmLoadingOutbound:Issue') ||
                  !hasAuth('WmsStockOperation:Issue')
                }
                onClick={() => void openOutbound(row)}
              />
            )
          }
        ]
      : [])
  ]

  const stockColumns: ColumnOption<StockChoice>[] = [
    { type: 'selection', width: 48 },
    {
      prop: 'loadingNo',
      label: '装车单号',
      minWidth: 155,
      formatter: () => activeRow.value?.loadingNo ?? ''
    },
    {
      prop: 'projectName',
      label: '项目名称',
      minWidth: 155,
      formatter: () => activeRow.value?.projectName ?? ''
    },
    {
      prop: 'customerName',
      label: '客户全称',
      minWidth: 160,
      formatter: () => activeRow.value?.customerName ?? ''
    },
    {
      prop: 'contractNo',
      label: '合同号',
      minWidth: 145,
      formatter: () => activeRow.value?.contractNo ?? ''
    },
    {
      prop: 'materialCode',
      label: '物料编码',
      minWidth: 145,
      formatter: () => activeRow.value?.materialCode ?? ''
    },
    {
      prop: 'materialDescription',
      label: '物料描述',
      minWidth: 190,
      formatter: () => activeRow.value?.materialDescription ?? ''
    },
    {
      prop: 'specification',
      label: '规格型号',
      minWidth: 135,
      formatter: () => activeRow.value?.specification ?? ''
    },
    {
      prop: 'baseUnit',
      label: '基本单位',
      width: 95,
      formatter: () => activeRow.value?.baseUnit ?? ''
    },
    {
      prop: 'outboundQuantity',
      label: '出库数量',
      width: 140,
      formatter: (row) => (
        <ElInputNumber
          v-model={row.outboundQuantity}
          min={0.001}
          max={Math.min(row.availableQuantity, remainingQuantity.value)}
          precision={3}
          controls={false}
          class="w-full!"
          aria-label="出库数量"
        />
      )
    },
    {
      prop: 'loadedQuantity',
      label: '装车数量',
      width: 100,
      formatter: () => activeRow.value?.loadedQuantity ?? 0
    },
    {
      prop: 'deliveredQuantity',
      label: '已交货数量',
      width: 120,
      formatter: () => activeRow.value?.deliveredQuantity ?? 0
    },
    { prop: 'availableQuantity', label: '可用库存', width: 100 },
    {
      prop: 'remark',
      label: '备注',
      minWidth: 160,
      formatter: (row) => <ElInput v-model={row.remark} maxlength={300} aria-label="出库备注" />
    },
    { prop: 'warehouseName', label: '仓库', minWidth: 120 },
    { prop: 'zoneName', label: '库区', minWidth: 100 },
    { prop: 'binName', label: '库位', minWidth: 100 },
    { prop: 'batchNo', label: '批次号', minWidth: 120 },
    {
      prop: 'selectedSerialIds',
      label: '序列号',
      minWidth: 230,
      formatter: (row) =>
        row.serialManagementEnabled ? (
          <ElSelect
            v-model={row.selectedSerialIds}
            multiple
            filterable
            collapse-tags
            class="w-full!"
            placeholder="逐件参选 SN"
            aria-label="出库序列号"
          >
            {row.serials.map((serial) => (
              <ElOption key={serial.id} value={serial.id} label={serial.serialNo} />
            ))}
          </ElSelect>
        ) : (
          '—'
        )
    }
  ]

  function onStockSelection(selected: StockChoice[]): void {
    selectedStocks.value = selected
    let remaining = remainingQuantity.value
    for (const stock of selected) {
      stock.outboundQuantity = Math.min(stock.availableQuantity, remaining)
      remaining = Math.max(0, remaining - stock.outboundQuantity)
    }
  }

  async function openOutbound(row: ScmLoadingOutboundRow): Promise<void> {
    if (!row.projectId || !row.materialId || row.outboundStatus === 'complete') return
    activeRow.value = row
    stockChoices.value = []
    selectedStocks.value = []
    stockError.value = ''
    await outboundDialogRef.value?.handleOpen(undefined, {
      title: `销售出库 · ${row.loadingNo}`,
      confirmText: '执行出库',
      loading: true,
      loadingText: '正在加载现有库存…',
      onOpen: async (_data, api) => {
        stockLoading.value = true
        try {
          const stocks = await fetchScmOutboundStocks(row.tenantId, row.projectId!, row.materialId)
          stockChoices.value = stocks.map((stock) => ({
            ...stock,
            outboundQuantity: Math.min(stock.availableQuantity, remainingQuantity.value),
            selectedSerialIds: [],
            remark: ''
          }))
        } catch {
          stockError.value = '现有库存加载失败，请关闭弹窗后重试。'
        } finally {
          stockLoading.value = false
          api.setLoading(false)
        }
      },
      onConfirm: async () => {
        const selected = selectedStocks.value.filter((stock) => stock.outboundQuantity > 0)
        if (!selected.length) {
          ElMessage.warning('请选择至少一个库存批次并填写出库数量')
          return false
        }
        const sum = selected.reduce((total, stock) => total + stock.outboundQuantity, 0)
        if (sum > remainingQuantity.value) {
          ElMessage.warning('本次出库数量不能超过装车明细剩余数量')
          return false
        }
        if (
          selected.some(
            (stock) =>
              stock.outboundQuantity > stock.availableQuantity ||
              (stock.serialManagementEnabled &&
                stock.selectedSerialIds.length !== stock.outboundQuantity)
          )
        ) {
          ElMessage.warning('请核对可用库存与序列号数量')
          return false
        }
        try {
          await postScmLoadingOutbound(
            selected.map((stock) => ({
              loadingId: row.loadingId,
              loadingLineId: row.loadingLineId,
              batchId: stock.id,
              quantity: stock.outboundQuantity,
              serialIds: stock.selectedSerialIds,
              remark: stock.remark,
              requestKey: crypto.randomUUID()
            }))
          )
          ElMessage.success('销售出库流水已生成')
          await tableRef.value?.refreshUpdate()
          return true
        } catch (error) {
          notifyFriendlyError(error, '销售出库失败，请核对库存和装车剩余数量')
          return false
        }
      }
    })
  }

  watch([effectiveTenantId, targetLoadingId], () => void tableRef.value?.refreshContext())
</script>
