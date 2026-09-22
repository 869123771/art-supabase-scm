<template>
  <ArtPermissionGuard :permission="config.permissions.View" :resource-name="config.title">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        :eyebrow="config.eyebrow"
        :title="config.title"
        :description="config.description"
        :icon="config.icon"
        :tags="[
          { label: '采购管理', type: 'primary' },
          { label: '单据流转', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :search-items="searchItems"
        :api-fn="fetchPage"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 82, showExpand: true }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${config.title}`,
          emptyDescription: effectiveTenantId
            ? `当前租户暂无${config.title}。可新建单据，或在页头切换到其他业务租户。`
            : `暂无${config.title}。创建单据后可继续维护物料与状态。`
        }"
        focusable
      />
      <PurchaseDialog ref="dialogRef" @success="handleSaved" />
      <PurchaseDetailDrawer ref="drawerRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { storeToRefs } from 'pinia'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useUserStore } from '@/store/modules/user'
  import type { ColumnOption } from '@/types'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    deleteScmPurchaseDocument,
    fetchScmPurchaseDocuments,
    transitionScmPurchaseDocument,
    type ScmPurchaseDocument,
    type ScmPurchaseKind,
    type ScmPurchaseQuery
  } from '@scm/api'
  import { purchaseConfigs, type PurchaseTransition } from './purchase-config'
  import PurchaseDialog from './modules/purchase-dialog.vue'
  import PurchaseDetailDrawer from './modules/purchase-detail-drawer.vue'

  defineOptions({ name: 'ScmPurchaseWorkspace' })
  const props = defineProps<{ kind: ScmPurchaseKind }>()
  const config = computed(() => purchaseConfigs[props.kind])
  const { confirmAction } = useArtFeedback()
  const userStore = useUserStore()
  const { isPlatformSuper } = storeToRefs(userStore)
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions: availableTenants } = storeToRefs(tenantScopeStore)
  const tenantOptions = computed(() =>
    availableTenants.value.map((tenant) => ({
      label: `${tenant.tenantName}（${tenant.tenantCode}）`,
      value: tenant.id
    }))
  )
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<{
    handleOpen: (options: {
      kind: ScmPurchaseKind
      record?: ScmPurchaseDocument
      copy?: boolean
      generate?: 'batch' | 'serial'
      tenantOptions: Array<{ label: string; value: string }>
      effectiveTenantId: string | null
    }) => Promise<void>
  }>()
  const drawerRef = ref<{ handleOpen: (record: ScmPurchaseDocument) => Promise<void> }>()
  const search = ref<ScmPurchaseQuery>({ keyword: '' })
  onMounted(() => {
    void userStore.ensureDictLoaded('scmPurchaseStatus')
  })

  const searchItems = computed<SearchFormItem[]>(() => [
    ...(isPlatformSuper.value && !effectiveTenantId.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select' as const,
            props: {
              options: tenantOptions.value,
              filterable: true,
              clearable: true,
              placeholder: '全部租户'
            }
          }
        ]
      : []),
    {
      label: '组合查询',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: `${config.value.numberLabel}、项目、供应商或人员` }
    },
    {
      label: '单据状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        options: (userStore.getDictMap?.scmPurchaseStatus ?? []).filter((option) =>
          [
            'draft',
            'submitted',
            'approved',
            'effective',
            'expired',
            'purchasing',
            'completed',
            'cancelled'
          ].includes(option.value)
        )
      }
    }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: config.value.permissions.Add,
      type: 'add',
      label: `新增${config.value.title}`,
      onClick: () => openDialog()
    },
    {
      permission: config.value.permissions.Export,
      type: 'export',
      exportFilename: config.value.title,
      exportSheetName: config.value.title,
      exportColumns: [
        { key: 'documentNo', title: config.value.numberLabel },
        { key: 'projectName', title: '项目名称' },
        { key: 'projectCode', title: '项目编码' },
        { key: 'supplierName', title: '供应商全称' },
        { key: 'documentDate', title: '单据日期' },
        { key: 'deliveryDate', title: '交货日期' },
        { key: 'status', title: '单据状态' },
        { key: 'lineCount', title: '明细行数' },
        { key: 'totalAmount', title: '价税合计（元）' },
        { key: 'remark', title: '备注' }
      ],
      exportData: exportDocuments
    }
  ])

  const columnsFactory = (): ColumnOption<ScmPurchaseDocument>[] => [
    {
      prop: 'documentNo',
      label: config.value.numberLabel,
      minWidth: 190,
      fixed: 'left',
      formatter: (row) => (
        <button
          type="button"
          class="max-w-full truncate text-left font-semibold text-[var(--el-color-primary)] hover:underline focus-visible:outline-2"
          title={row.documentNo}
          onClick={() => void drawerRef.value?.handleOpen(row)}
        >
          {row.documentNo}
        </button>
      )
    },
    {
      prop: 'documentTypeId',
      label: '单据类型',
      minWidth: 130,
      formatter: (row) => row.documentType?.documentTypeName || '--'
    },
    {
      prop: 'projectId',
      label: '项目名称',
      minWidth: 170,
      formatter: (row) => row.project?.projectName || '--'
    },
    {
      prop: 'projectCode',
      label: '项目编码',
      minWidth: 130,
      formatter: (row) => row.project?.projectCode || '--'
    },
    ...(props.kind !== 'purchase_request'
      ? [
          {
            prop: 'supplierId',
            label: '供应商全称',
            minWidth: 180,
            formatter: (row: ScmPurchaseDocument) => row.supplier?.supplierName || '--'
          }
        ]
      : []),
    ...(config.value.sourceKind
      ? [
          {
            prop: 'sourceId',
            label: '来源单据',
            minWidth: 160,
            formatter: (row: ScmPurchaseDocument) => row.source?.documentNo || '--'
          }
        ]
      : []),
    ...(props.kind === 'purchase_contract'
      ? [
          {
            prop: 'title',
            label: '合同名称',
            minWidth: 180,
            formatter: (row: ScmPurchaseDocument) => row.details.title || '--'
          }
        ]
      : []),
    ...(props.kind === 'purchase_request' || props.kind === 'purchase_order'
      ? [
          {
            prop: 'applicant',
            label: '申请人',
            minWidth: 120,
            formatter: (row: ScmPurchaseDocument) => row.details.applicantName || '--'
          }
        ]
      : []),
    ...(props.kind === 'purchase_contract' ||
    props.kind === 'purchase_order' ||
    props.kind === 'receipt_notice'
      ? [
          {
            prop: 'buyer',
            label: '采购员',
            minWidth: 120,
            formatter: (row: ScmPurchaseDocument) => row.details.buyerName || '--'
          }
        ]
      : []),
    ...(props.kind === 'receipt_notice'
      ? [
          {
            prop: 'contractNo',
            label: '采购合同号',
            minWidth: 155,
            formatter: (row: ScmPurchaseDocument) => row.details.contractNo || '--'
          }
        ]
      : []),
    {
      prop: 'materialDescription',
      label: '首项物料',
      minWidth: 180,
      formatter: (row) => row.lines[0]?.materialDescription || '--'
    },
    {
      prop: 'lineCount',
      label: '明细',
      width: 76,
      align: 'right',
      formatter: (row) => row.lines.length
    },
    ...(props.kind === 'purchase_request'
      ? [
          {
            prop: 'purchased',
            label: '已采购数量',
            width: 120,
            align: 'right' as const,
            formatter: (row: ScmPurchaseDocument) =>
              row.lines.reduce((sum, line) => sum + Number(line.purchasedQuantity ?? 0), 0)
          },
          {
            prop: 'remaining',
            label: '未采购数量',
            width: 120,
            align: 'right' as const,
            formatter: (row: ScmPurchaseDocument) =>
              row.lines.reduce(
                (sum, line) => sum + Number(line.remainingQuantity ?? line.quantity),
                0
              )
          }
        ]
      : []),
    { prop: 'documentDate', label: '单据日期', width: 120 },
    { prop: 'deliveryDate', label: '交货日期', width: 120 },
    {
      prop: 'status',
      label: '状态',
      width: 110,
      dict: { code: 'scmPurchaseStatus', display: 'tag' }
    },
    {
      prop: 'totalAmount',
      label: '价税合计',
      width: 150,
      align: 'right',
      formatter: (row) => (
        <strong class="font-semibold text-[var(--el-color-primary)]">
          {formatCurrencyValue(row.totalAmount)}
        </strong>
      )
    },
    { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
    {
      prop: 'operation',
      label: '操作',
      width: 168,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission={config.value.permissions.View}
            onClick={() => void drawerRef.value?.handleOpen(row)}
          />
          {row.status === 'draft' && (
            <ArtButtonTable
              type="edit"
              permission={config.value.permissions.Edit}
              onClick={() => openDialog(row)}
            />
          )}
          <ArtButtonMore
            list={moreActions(row)}
            onClick={(item: ButtonMoreItem) => void handleMoreAction(row, String(item.key))}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  function moreActions(row: ScmPurchaseDocument): ButtonMoreItem[] {
    const actions: ButtonMoreItem[] = [
      { auth: config.value.permissions.Copy, key: 'copy', label: '复制', icon: 'ri:file-copy-line' }
    ]
    if (row.status === 'draft')
      actions.push({
        auth: config.value.permissions.Delete,
        key: 'delete',
        label: '删除',
        icon: 'ri:delete-bin-line',
        color: 'var(--el-color-danger)'
      })
    for (const transition of config.value.transitions[row.status] ?? [])
      actions.push({
        auth: config.value.permissions[transition.action],
        key: `status:${transition.status}`,
        label: transition.label,
        icon: 'ri:arrow-right-circle-line'
      })
    if (props.kind === 'receipt_notice' && row.status === 'draft')
      actions.push(
        {
          auth: config.value.permissions.GenerateBatch,
          key: 'batch',
          label: '生成批号',
          icon: 'ri:barcode-line'
        },
        {
          auth: config.value.permissions.GenerateSerial,
          key: 'serial',
          label: '生成序列号',
          icon: 'ri:hashtag'
        }
      )
    return actions
  }
  function openDialog(record?: ScmPurchaseDocument, copy = false, generate?: 'batch' | 'serial') {
    void dialogRef.value?.handleOpen({
      kind: props.kind,
      record,
      copy,
      generate,
      tenantOptions: tenantOptions.value,
      effectiveTenantId: effectiveTenantId.value
    })
  }
  async function handleMoreAction(row: ScmPurchaseDocument, key: string) {
    if (key === 'copy') return openDialog(row, true)
    if (key === 'delete') return handleDelete(row)
    if (key === 'batch' || key === 'serial') {
      return openDialog(row, false, key)
    }
    const transition = (config.value.transitions[row.status] ?? []).find(
      (item) => `status:${item.status}` === key
    )
    if (transition) await handleTransition(row, transition)
  }
  async function handleDelete(row: ScmPurchaseDocument) {
    try {
      await confirmAction(
        `确定删除“${row.documentNo}”吗？已被下游引用的单据无法删除。`,
        `删除${config.value.title}`,
        {
          type: 'warning',
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
      await deleteScmPurchaseDocument(row.id)
      await tableRef.value?.refreshRemove()
    } catch {
      /* 用户取消或 API 已提示。 */
    }
  }
  async function handleTransition(row: ScmPurchaseDocument, transition: PurchaseTransition) {
    try {
      await confirmAction(
        `确定将“${row.documentNo}”变更为“${transition.label}”吗？`,
        `${transition.label} · ${config.value.title}`,
        { type: 'warning', confirmButtonText: transition.label, cancelButtonText: '取消' }
      )
      await transitionScmPurchaseDocument(row.id, transition.status)
      await tableRef.value?.refreshUpdate()
    } catch {
      /* 用户取消或 API 已提示。 */
    }
  }
  function handleSaved(mode: 'add' | 'edit') {
    void (mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate())
  }
  function fetchPage(query: ScmPurchaseQuery) {
    return fetchScmPurchaseDocuments(props.kind, query)
  }
  async function exportDocuments() {
    const { data } = await fetchScmPurchaseDocuments(props.kind, {
      ...search.value,
      from: 0,
      to: 9999
    })
    return (data ?? []).map((row) => ({
      documentNo: row.documentNo,
      projectName: row.project?.projectName,
      projectCode: row.project?.projectCode,
      supplierName: row.supplier?.supplierName,
      documentDate: row.documentDate,
      deliveryDate: row.deliveryDate,
      status: row.status,
      lineCount: row.lines.length,
      totalAmount: row.totalAmount,
      remark: row.remark
    }))
  }
</script>
