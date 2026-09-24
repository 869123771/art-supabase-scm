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
        :selection-actions="selectionActions"
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
      <ArtTableMultipleSelect
        v-if="kind === 'receipt_notice' || kind === 'purchase_order'"
        ref="pushLineSelectRef"
        v-model="selectedPushLineIds"
        :data="pushLineChoices"
        :columns="pushLineColumns"
        row-key="lineId"
        label-key="materialDescription"
        title="选择下推明细"
        :subtitle="
          kind === 'purchase_order'
            ? '只下推勾选的订单明细；已下推到当前目标的明细不再显示。'
            : '只下推勾选的收料明细；已下推过的明细不再显示。'
        "
        :show-pagination="false"
        reset-draft-on-open
        :empty-text="pushChoicesLoading ? '正在加载可下推明细…' : '暂无可下推明细'"
        :empty-description="
          pushChoicesLoading
            ? '正在核对单据状态和剩余可下推数量。'
            : '此通知单的明细已经全部下推到该目标。'
        "
        dialog-width="xl"
        @confirm="handlePushConfirm"
      >
        <template #trigger><span class="sr-only">选择下推明细</span></template>
      </ArtTableMultipleSelect>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { storeToRefs } from 'pinia'
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type { DataSelectColumn } from '@/components/core/forms/art-data-select/types'
  import {
    fetchPushedReceiptLineIds,
    pushScmReceiptLines,
    type ScmReceiptTargetKind
  } from '@/api/scm-receipt-target'
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
  import { fetchEmployeeSelectorList } from '@/api/integration/employees'
  import type { ColumnOption } from '@/types'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    deleteScmPurchaseDocument,
    createScmPurchaseDocument,
    fetchScmMaterialOptions,
    fetchScmPurchaseDocument,
    fetchScmPurchaseProjectOptions,
    fetchScmPurchaseWarehouseOptions,
    fetchScmPurchaseBinOptions,
    fetchScmReceiptOrderLineChoices,
    fetchScmSupplierOptions,
    fetchScmPurchaseDocuments,
    fetchPushedOrderLineIds,
    pushScmOrderLines,
    transitionScmPurchaseDocument,
    type ScmOrderTargetKind,
    type ScmPurchaseDocument,
    type ScmPurchaseKind,
    type ScmPurchaseLine,
    type ScmPurchaseQuery
  } from '@scm/api'
  import { purchaseConfigs, type PurchaseTransition } from './purchase-config'
  import PurchaseDialog from './modules/purchase-dialog.vue'
  import PurchaseDetailDrawer from './modules/purchase-detail-drawer.vue'

  defineOptions({ name: 'ScmPurchaseWorkspace' })
  const props = defineProps<{ kind: ScmPurchaseKind }>()
  const config = computed(() => purchaseConfigs[props.kind])
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
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
      initialSource?: ScmPurchaseDocument
      initialSourceId?: string
      openLineSelector?: boolean
      tenantOptions: Array<{ label: string; value: string }>
      effectiveTenantId: string | null
    }) => Promise<void>
  }>()
  const drawerRef = ref<{ handleOpen: (record: ScmPurchaseDocument) => Promise<void> }>()
  const pushLineSelectRef = ref<{
    open: () => Promise<void>
    close: () => void
    reload: () => Promise<void>
  }>()
  const pushChoicesLoading = ref(false)
  let pushLoadRevision = 0
  const selectedPushLineIds = ref<string[]>([])
  const pushLineChoices = ref<ScmPurchaseLine[]>([])
  const pushReceiptId = ref('')
  const pushTargetKind = ref<ScmReceiptTargetKind>('inbound')
  const pushOrderId = ref('')
  const pushOrderTargetKind = ref<ScmOrderTargetKind>('purchase_inbound')
  const orderPushTargets: Array<{ kind: ScmOrderTargetKind; label: string; permission: string }> = [
    { kind: 'purchase_inbound', label: '下推采购入库', permission: 'ScmPurchaseInbound:Add' },
    { kind: 'return_request', label: '下推退料申请', permission: 'ScmPurchaseReturnRequest:Add' },
    { kind: 'outsource_receipt', label: '下推委外收货', permission: 'ScmOutsourceReceipt:Add' },
    { kind: 'outsource_inbound', label: '下推委外入库', permission: 'ScmOutsourceInbound:Add' }
  ]
  const pushLineColumns = computed<DataSelectColumn[]>(() => [
    { prop: 'lineNo', label: '行号', width: 75 },
    { prop: 'materialCode', label: '物料编码', minWidth: 130 },
    { prop: 'materialDescription', label: '物料名称', minWidth: 190 },
    {
      prop: 'quantity',
      label: props.kind === 'purchase_order' ? '采购数量' : '收料数量',
      minWidth: 105
    },
    {
      prop: props.kind === 'purchase_order' ? 'unit' : 'stockUnit',
      label: props.kind === 'purchase_order' ? '采购单位' : '库存单位',
      minWidth: 95
    },
    { prop: 'warehouse', label: '仓库', minWidth: 120 }
  ])
  const search = ref<ScmPurchaseQuery>({ keyword: '' })
  const importTenantId = computed(() => effectiveTenantId.value || search.value.tenantId || '')
  const requestImportColumns = [
    { key: 'requestKey', title: '导入分组号', required: true },
    { key: 'projectCode', title: '项目编码', required: true },
    { key: 'documentDate', title: '申请日期（YYYY-MM-DD）', required: true },
    { key: 'materialCode', title: '物料编码', required: true },
    { key: 'quantity', title: '数量', required: true },
    { key: 'unitPrice', title: '单价（元）' },
    { key: 'taxRate', title: '税率（%）' },
    { key: 'gift', title: '赠品（是/否）' },
    { key: 'reason', title: '需求原因' },
    { key: 'suggestedSupplierCode', title: '建议供应商编码' },
    { key: 'remark', title: '备注' }
  ]
  const receiptImportColumns = [
    { key: 'receiptKey', title: '导入分组号', required: true },
    { key: 'projectCode', title: '项目编码', required: true },
    { key: 'supplierCode', title: '供应商编码', required: true },
    { key: 'documentDate', title: '收料日期（YYYY-MM-DD）', required: true },
    { key: 'purchaseOrderNo', title: '采购订单号' },
    { key: 'sourceLineNo', title: '采购订单行号' },
    { key: 'materialCode', title: '物料编码', required: true },
    { key: 'quantity', title: '数量', required: true },
    { key: 'unitPrice', title: '单价（元）' },
    { key: 'taxRate', title: '税率（%）' },
    { key: 'warehouseCode', title: '仓库编码' },
    { key: 'binCode', title: '仓位编码' },
    { key: 'gift', title: '赠品（是/否）' },
    { key: 'remark', title: '备注' }
  ]
  const orderImportColumns = [
    { key: 'orderKey', title: '导入分组号', required: true },
    { key: 'projectCode', title: '项目编码', required: true },
    { key: 'supplierCode', title: '供应商编码', required: true },
    { key: 'buyerEmployeeNo', title: '采购员工号', required: true },
    { key: 'documentDate', title: '订单日期（YYYY-MM-DD）', required: true },
    { key: 'materialCode', title: '物料编码', required: true },
    { key: 'quantity', title: '采购数量', required: true },
    { key: 'unitPrice', title: '不含税单价（元）' },
    { key: 'taxRate', title: '税率（%）', required: true },
    { key: 'warehouseCode', title: '仓库编码' },
    { key: 'binCode', title: '仓位编码' },
    { key: 'gift', title: '赠品（是/否）' },
    { key: 'remark', title: '备注' }
  ]
  onMounted(() => {
    void userStore.ensureDictLoaded('scmPurchaseStatus')
    if (props.kind === 'purchase_contract')
      void userStore.ensureDictLoaded('scmPurchaseContractStatus')
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
      permission: config.value.permissions.Import,
      type: 'import',
      label: importTenantId.value ? '导入' : '请先选择所属租户',
      hidden: !['purchase_request', 'purchase_order', 'receipt_notice'].includes(props.kind),
      disabled: !importTenantId.value || !hasAuth(config.value.permissions.Add),
      importColumns:
        props.kind === 'receipt_notice'
          ? receiptImportColumns
          : props.kind === 'purchase_order'
            ? orderImportColumns
            : requestImportColumns,
      importApi:
        props.kind === 'receipt_notice'
          ? importReceipts
          : props.kind === 'purchase_order'
            ? importOrders
            : importRequests,
      onImportError: (error: Error) => {
        ElMessage.error(error.message)
      }
    },
    {
      permission: config.value.permissions.Select,
      key: 'select-request-lines',
      label: '选单',
      icon: 'ri:file-list-3-line',
      hidden: !['purchase_request', 'purchase_order', 'receipt_notice'].includes(props.kind),
      disabled: !hasAuth(config.value.permissions.Add),
      onClick: () => openDialog(undefined, false, undefined, true)
    },
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

  const selectionActions = computed<ArtTableQueryHeaderAction[]>(() =>
    props.kind === 'purchase_request'
      ? [
          {
            permission: config.value.permissions.Push,
            key: 'push-purchase-order',
            label: '下推采购订单',
            icon: 'ri:arrow-right-line',
            selectionRequired: true,
            disabled: (ctx) => ctx.selectedRows.length !== 1 || !hasAuth('ScmPurchaseOrder:Add'),
            onClick: (ctx) => void pushRequest(String(ctx.selectedRows[0]?.id ?? ''))
          }
        ]
      : props.kind === 'purchase_order'
        ? [
            {
              permission: config.value.permissions.Push,
              key: 'push-receipt-notice',
              label: '下推收料通知单',
              icon: 'ri:inbox-line',
              selectionRequired: true,
              disabled: (ctx) =>
                ctx.selectedRows.length !== 1 ||
                !['approved', 'completed'].includes(String(ctx.selectedRows[0]?.status)) ||
                !hasAuth('ScmReceiptNotice:Add'),
              onClick: (ctx) => void pushOrderToReceipt(String(ctx.selectedRows[0]?.id ?? ''))
            },
            ...orderPushTargets.map((target): ArtTableQueryHeaderAction => ({
              permission: config.value.permissions.Push,
              key: `push-${target.kind}`,
              label: target.label,
              icon: 'ri:arrow-right-line',
              selectionRequired: true,
              disabled: (ctx) =>
                ctx.selectedRows.length !== 1 ||
                !['approved', 'completed'].includes(String(ctx.selectedRows[0]?.status)) ||
                !hasAuth(target.permission),
              onClick: (ctx) =>
                void openPushOrderLines(String(ctx.selectedRows[0]?.id ?? ''), target.kind)
            }))
          ]
        : props.kind === 'receipt_notice'
          ? [
              {
                permission: config.value.permissions.Push,
                key: 'push-inbound',
                label: '下推收料入库',
                icon: 'ri:inbox-line',
                selectionRequired: true,
                disabled: (ctx) =>
                  ctx.selectedRows.length !== 1 ||
                  ctx.selectedRows[0]?.status !== 'completed' ||
                  !hasAuth('WmsReceiptInbound:Add'),
                onClick: (ctx) =>
                  void openPushLines(String(ctx.selectedRows[0]?.id ?? ''), 'inbound')
              },
              {
                permission: config.value.permissions.Push,
                key: 'push-asset-payable',
                label: '下推资产应付',
                icon: 'ri:bill-line',
                selectionRequired: true,
                disabled: (ctx) =>
                  ctx.selectedRows.length !== 1 ||
                  ctx.selectedRows[0]?.status !== 'completed' ||
                  !hasAuth('FinanceAssetPayable:Add'),
                onClick: (ctx) =>
                  void openPushLines(String(ctx.selectedRows[0]?.id ?? ''), 'asset_payable')
              }
            ]
          : []
  )

  async function openPushOrderLines(id: string, kind: ScmOrderTargetKind) {
    if (!id) return
    const revision = ++pushLoadRevision
    pushOrderId.value = id
    pushOrderTargetKind.value = kind
    selectedPushLineIds.value = []
    pushLineChoices.value = []
    pushChoicesLoading.value = true
    await nextTick()
    await pushLineSelectRef.value?.open()
    try {
      const [{ data }, pushedIds] = await Promise.all([
        fetchScmPurchaseDocument(id),
        fetchPushedOrderLineIds(id, kind)
      ])
      if (revision !== pushLoadRevision) return
      if (
        !data ||
        data.kind !== 'purchase_order' ||
        !['approved', 'completed'].includes(data.status)
      ) {
        ElMessage.warning('请选择已审核的采购订单')
        pushLineSelectRef.value?.close()
        return
      }
      pushLineChoices.value = data.lines.filter((line) => !pushedIds.has(line.lineId))
      if (!pushLineChoices.value.length) {
        ElMessage.warning('所选订单已无可下推到该目标的明细')
        pushLineSelectRef.value?.close()
        return
      }
      await nextTick()
      await pushLineSelectRef.value?.reload()
    } catch {
      // API 层已提示加载错误。
    } finally {
      if (revision === pushLoadRevision) pushChoicesLoading.value = false
    }
  }
  async function openPushLines(id: string, kind: ScmReceiptTargetKind) {
    if (!id) return
    const revision = ++pushLoadRevision
    pushReceiptId.value = id
    pushTargetKind.value = kind
    selectedPushLineIds.value = []
    pushLineChoices.value = []
    pushChoicesLoading.value = true
    await nextTick()
    await pushLineSelectRef.value?.open()
    try {
      const [{ data }, pushedIds] = await Promise.all([
        fetchScmPurchaseDocument(id),
        fetchPushedReceiptLineIds(id, kind)
      ])
      if (revision !== pushLoadRevision) return
      if (!data || data.kind !== 'receipt_notice' || data.status !== 'completed') {
        ElMessage.warning('请选择已确认的收料通知单')
        pushLineSelectRef.value?.close()
        return
      }
      pushLineChoices.value = data.lines.filter((line) => !pushedIds.has(line.lineId))
      if (!pushLineChoices.value.length) {
        ElMessage.warning('所选通知单已无可下推明细')
        pushLineSelectRef.value?.close()
        return
      }
      await nextTick()
      await pushLineSelectRef.value?.reload()
    } catch {
      /* API 层已提示加载错误。 */
    } finally {
      if (revision === pushLoadRevision) pushChoicesLoading.value = false
    }
  }
  async function handlePushConfirm(value: string | number | Array<string | number> | undefined) {
    if (pushChoicesLoading.value) return
    const ids = Array.isArray(value) ? value.map(String) : []
    if (props.kind === 'purchase_order') {
      if (!ids.length || !pushOrderId.value) {
        ElMessage.warning('请勾选至少一行订单明细')
        return
      }
      try {
        await pushScmOrderLines(pushOrderId.value, ids, pushOrderTargetKind.value)
        await tableRef.value?.refreshUpdate()
      } catch {
        // API 层已提示下推错误。
      }
      return
    }
    if (!ids.length || !pushReceiptId.value) {
      ElMessage.warning('请勾选至少一行收料明细')
      return
    }
    try {
      await pushScmReceiptLines(pushReceiptId.value, ids, pushTargetKind.value)
      await tableRef.value?.refreshUpdate()
    } catch {
      /* API 层已提示下推错误。 */
    }
  }

  const columnsFactory = (): ColumnOption<ScmPurchaseDocument>[] => [
    ...(props.kind === 'purchase_request' ||
    props.kind === 'purchase_order' ||
    props.kind === 'receipt_notice'
      ? [{ type: 'selection' as const, width: 48, fixed: 'left' as const }]
      : []),
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
    ...(config.value.sourceKind &&
    props.kind !== 'receipt_notice' &&
    props.kind !== 'purchase_order'
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
      label: props.kind === 'purchase_contract' ? '合同状态' : '状态',
      width: props.kind === 'purchase_contract' ? 128 : 110,
      ...(props.kind === 'purchase_contract'
        ? {
            formatter: (row: ScmPurchaseDocument) => {
              const code =
                row.details.contractStatus ??
                (row.status === 'submitted'
                  ? 'SUBM'
                  : ['approved', 'effective'].includes(row.status)
                    ? 'APRV'
                    : ['expired', 'cancelled'].includes(row.status)
                      ? 'CNCL'
                      : 'DRFT')
              return (
                userStore.getDictMap?.scmPurchaseContractStatus?.find((item) => item.value === code)
                  ?.label ?? code
              )
            }
          }
        : { dict: { code: 'scmPurchaseStatus', display: 'tag' as const } })
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
              label={
                props.kind === 'purchase_request' || props.kind === 'receipt_notice'
                  ? '编制'
                  : '编辑'
              }
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
  function openDialog(
    record?: ScmPurchaseDocument,
    copy = false,
    generate?: 'batch' | 'serial',
    openLineSelector = false
  ) {
    void dialogRef.value?.handleOpen({
      kind: props.kind,
      record,
      copy,
      generate,
      openLineSelector,
      tenantOptions: tenantOptions.value,
      effectiveTenantId: effectiveTenantId.value
    })
  }
  async function pushRequest(id: string) {
    if (!id || !hasAuth('ScmPurchaseOrder:Add')) return
    await dialogRef.value?.handleOpen({
      kind: 'purchase_order',
      initialSourceId: id,
      openLineSelector: true,
      tenantOptions: tenantOptions.value,
      effectiveTenantId: effectiveTenantId.value
    })
  }
  async function pushOrderToReceipt(id: string) {
    if (!id || !hasAuth('ScmReceiptNotice:Add')) return
    await dialogRef.value?.handleOpen({
      kind: 'receipt_notice',
      initialSourceId: id,
      openLineSelector: true,
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
  async function importReceipts(rows: Array<Record<string, unknown>>): Promise<void> {
    const tenantId = importTenantId.value
    if (!tenantId || !hasAuth('ScmReceiptNotice:Add')) throw new Error('请选择有新增权限的业务租户')
    if (!rows.length || rows.length > 2000) throw new Error('每次可导入 1–2000 行收料明细')
    const [projects, supplierResult, materialResult, warehouses, bins] = await Promise.all([
      fetchScmPurchaseProjectOptions(tenantId),
      fetchScmSupplierOptions(tenantId),
      fetchScmMaterialOptions(tenantId),
      fetchScmPurchaseWarehouseOptions(tenantId),
      fetchScmPurchaseBinOptions(tenantId)
    ])
    const projectByCode = new Map(projects.map((item) => [item.projectCode, item]))
    const supplierByCode = new Map(
      (supplierResult.data ?? []).map((item) => [item.supplierCode, item])
    )
    const materialByCode = new Map(
      (materialResult.data ?? []).map((item) => [item.materialCode, item])
    )
    const warehouseByCode = new Map(warehouses.map((item) => [item.warehouseCode, item]))
    const binByCode = new Map(bins.map((item) => [`${item.warehouseId}:${item.binCode}`, item]))
    const groups = new Map<
      string,
      {
        projectId: string
        supplierId: string
        documentDate: string
        lines: ScmPurchaseLine[]
        remark: string
      }
    >()
    const sourceChoices = new Map<
      string,
      Awaited<ReturnType<typeof fetchScmReceiptOrderLineChoices>>
    >()
    const used = new Map<string, number>()
    for (const [index, row] of rows.entries()) {
      const at = `第 ${index + 2} 行`
      const key = String(row.receiptKey ?? '').trim()
      const project = projectByCode.get(String(row.projectCode ?? '').trim())
      const supplier = supplierByCode.get(String(row.supplierCode ?? '').trim())
      const material = materialByCode.get(String(row.materialCode ?? '').trim())
      const documentDate = String(row.documentDate ?? '').trim()
      const quantity = Number(row.quantity)
      if (!key || !project || !supplier || !material)
        throw new Error(`${at}分组、项目、供应商或物料编码无效`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || !dayjs(documentDate).isValid())
        throw new Error(`${at}收料日期无效`)
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        Math.round(quantity * 1000) !== quantity * 1000
      )
        throw new Error(`${at}数量须为最多三位小数的正数`)
      const orderNo = String(row.purchaseOrderNo ?? '').trim()
      const sourceLineNo = Number(row.sourceLineNo)
      if (orderNo && (!Number.isInteger(sourceLineNo) || sourceLineNo <= 0))
        throw new Error(`${at}请填写有效的采购订单行号`)
      let source: Awaited<ReturnType<typeof fetchScmReceiptOrderLineChoices>>[number] | undefined
      if (orderNo) {
        const sourceKey = `${supplier.id}:${project.id}`
        if (!sourceChoices.has(sourceKey))
          sourceChoices.set(
            sourceKey,
            await fetchScmReceiptOrderLineChoices(tenantId, supplier.id, project.id)
          )
        source = sourceChoices
          .get(sourceKey)
          ?.find(
            (item) =>
              item.sourceDocumentNo === orderNo &&
              item.sourceLineNo === sourceLineNo &&
              item.materialId === material.id
          )
        if (!source) throw new Error(`${at}采购订单明细不存在或已经交完`)
        const allocated = used.get(source.choiceId) ?? 0
        if (allocated + quantity > source.quantity) throw new Error(`${at}数量超过采购订单未交数量`)
        used.set(source.choiceId, allocated + quantity)
      }
      const warehouseCode = String(row.warehouseCode ?? '').trim()
      const binCode = String(row.binCode ?? '').trim()
      const warehouse = warehouseCode ? warehouseByCode.get(warehouseCode) : undefined
      const bin = binCode && warehouse ? binByCode.get(`${warehouse.id}:${binCode}`) : undefined
      if ((warehouseCode && !warehouse) || (binCode && !bin))
        throw new Error(`${at}仓库或仓位编码无效`)
      const unitPrice =
        row.unitPrice == null || row.unitPrice === ''
          ? Number(source?.unitPrice ?? 0)
          : Number(row.unitPrice)
      const taxRate =
        row.taxRate == null || row.taxRate === ''
          ? Number(source?.taxRate ?? 0)
          : Number(row.taxRate)
      if (
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        !Number.isFinite(taxRate) ||
        taxRate < 0 ||
        taxRate > 100
      )
        throw new Error(`${at}单价或税率无效`)
      const factor =
        material.purchaseUnitId && material.purchaseUnitId !== material.baseUnitId
          ? material.unitConversions?.find((item) => item.sourceUnitId === material.purchaseUnitId)
          : null
      if (factor && (factor.sourceFactor <= 0 || factor.baseFactor <= 0))
        throw new Error(`${at}物料单位换算关系无效`)
      if (material.purchaseUnitId && material.purchaseUnitId !== material.baseUnitId && !factor)
        throw new Error(`${at}物料缺少采购单位换算关系`)
      const baseQuantity =
        Math.round(quantity * (factor ? factor.baseFactor / factor.sourceFactor : 1) * 1000) / 1000
      const unitFactor = (unitId?: string | null): number | null => {
        if (!unitId || unitId === material.baseUnitId) return 1
        const conversion = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
        if (!conversion || conversion.sourceFactor <= 0 || conversion.baseFactor <= 0) return null
        return conversion.baseFactor / conversion.sourceFactor
      }
      const stockFactor = unitFactor(material.inventoryUnitId)
      if (!stockFactor) throw new Error(`${at}物料缺少库存单位换算关系`)
      const stockQuantity = Math.round((baseQuantity / stockFactor) * 1000) / 1000
      const auxiliaryFactor = unitFactor(material.auxiliaryUnitId)
      const auxiliaryFactor2 = unitFactor(material.auxiliaryUnit2Id)
      if (material.auxiliaryUnitId && !auxiliaryFactor)
        throw new Error(`${at}物料缺少辅助单位换算关系`)
      if (material.auxiliaryUnit2Id && !auxiliaryFactor2)
        throw new Error(`${at}物料缺少辅助单位2换算关系`)
      const group = groups.get(key) ?? {
        projectId: project.id,
        supplierId: supplier.id,
        documentDate,
        lines: [],
        remark: String(row.remark ?? '').trim()
      }
      if (
        group.projectId !== project.id ||
        group.supplierId !== supplier.id ||
        group.documentDate !== documentDate
      )
        throw new Error(`${at}同一分组的项目、供应商和日期须一致`)
      if (group.lines.length >= 200) throw new Error(`分组 ${key} 超过 200 行`)
      group.lines.push({
        lineId: crypto.randomUUID(),
        lineNo: (group.lines.length + 1) * 10,
        materialId: material.id,
        materialCode: material.materialCode,
        materialDescription: material.materialDescription,
        specification: material.specification || '',
        unit: material.purchaseUnit || material.unit || '',
        baseUnit: material.unit || '',
        stockUnit: material.stockUnit || material.unit || '',
        baseQuantity,
        stockQuantity,
        auxiliaryUnit: material.auxiliaryUnit || '',
        auxiliaryQuantity: auxiliaryFactor
          ? Math.round((baseQuantity / auxiliaryFactor) * 1000) / 1000
          : 0,
        auxiliaryUnit2: material.auxiliaryUnit2 || '',
        auxiliaryQuantity2: auxiliaryFactor2
          ? Math.round((baseQuantity / auxiliaryFactor2) * 1000) / 1000
          : 0,
        quantity,
        unitPrice,
        taxRate,
        discountMode: 'none',
        discountRate: 0,
        gift: ['是', 'true', '1', 'yes'].includes(
          String(row.gift ?? '')
            .trim()
            .toLowerCase()
        ),
        warehouseId: warehouse?.id,
        warehouse: warehouse?.warehouseName || '',
        binId: bin?.id,
        location: bin?.binName || '',
        ownerType: 'self',
        sourcePurchaseDocumentId: source?.sourcePurchaseDocumentId,
        sourceLineId: source?.sourceLineId,
        sourceDocumentNo: source?.sourceDocumentNo,
        sourceLineNo: source?.sourceLineNo
      })
      groups.set(key, group)
    }
    for (const group of groups.values())
      await createScmPurchaseDocument({
        tenantId,
        kind: 'receipt_notice',
        documentNo: '',
        documentTypeId: null,
        projectId: group.projectId,
        supplierId: group.supplierId,
        sourceId: null,
        documentDate: group.documentDate,
        deliveryDate: null,
        details: {},
        lines: group.lines,
        paymentPlans: [],
        deliveryPlans: [],
        clauses: [],
        remark: group.remark
      })
  }
  async function importRequests(rows: Array<Record<string, unknown>>): Promise<void> {
    const tenantId = importTenantId.value
    if (!tenantId || !hasAuth('ScmPurchaseRequest:Add'))
      throw new Error('请选择有新增权限的业务租户')
    if (!rows.length) throw new Error('导入文件没有采购申请明细')
    const [projects, materialResult, supplierResult] = await Promise.all([
      fetchScmPurchaseProjectOptions(tenantId),
      fetchScmMaterialOptions(tenantId),
      fetchScmSupplierOptions(tenantId)
    ])
    const projectByCode = new Map(projects.map((item) => [item.projectCode, item]))
    const materialByCode = new Map(
      (materialResult.data ?? []).map((item) => [item.materialCode, item])
    )
    const supplierByCode = new Map(
      (supplierResult.data ?? []).map((item) => [item.supplierCode, item])
    )
    const groups = new Map<
      string,
      { projectCode: string; documentDate: string; lines: ScmPurchaseLine[]; remark: string }
    >()
    rows.forEach((row, index) => {
      const sourceRow = index + 2
      const requestKey = String(row.requestKey ?? '').trim()
      const projectCode = String(row.projectCode ?? '').trim()
      const materialCode = String(row.materialCode ?? '').trim()
      const documentDate = String(row.documentDate ?? '').trim()
      const quantity = Number(row.quantity)
      const unitPrice = row.unitPrice == null || row.unitPrice === '' ? 0 : Number(row.unitPrice)
      const taxRate = row.taxRate == null || row.taxRate === '' ? 0 : Number(row.taxRate)
      const gift = ['是', 'true', '1', 'yes'].includes(
        String(row.gift ?? '')
          .trim()
          .toLowerCase()
      )
      const supplierCode = String(row.suggestedSupplierCode ?? '').trim()
      const project = projectByCode.get(projectCode)
      const material = materialByCode.get(materialCode)
      if (!requestKey || !project || !material)
        throw new Error(`第 ${sourceRow} 行的分组号、项目编码或物料编码无效`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || !dayjs(documentDate).isValid())
        throw new Error(`第 ${sourceRow} 行申请日期无效`)
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        !Number.isFinite(taxRate) ||
        taxRate < 0 ||
        taxRate > 100
      )
        throw new Error(`第 ${sourceRow} 行数量、单价或税率无效`)
      if (supplierCode && !supplierByCode.has(supplierCode))
        throw new Error(`第 ${sourceRow} 行建议供应商编码不存在`)
      const group = groups.get(requestKey) ?? {
        projectCode,
        documentDate,
        lines: [],
        remark: String(row.remark ?? '').trim()
      }
      if (group.projectCode !== projectCode || group.documentDate !== documentDate)
        throw new Error(`分组 ${requestKey} 的项目与申请日期必须一致`)
      if (group.lines.length >= 200) throw new Error(`分组 ${requestKey} 超过 200 行`)
      group.lines.push({
        lineId: crypto.randomUUID(),
        lineNo: (group.lines.length + 1) * 10,
        materialId: material.id,
        materialCode: material.materialCode,
        materialDescription: material.materialDescription,
        specification: material.specification ?? '',
        unit: material.baseUnitName || material.unit || '',
        quantity,
        unitPrice,
        taxRate,
        discountRate: 0,
        discountMode: 'none',
        gift,
        reason: String(row.reason ?? '').trim(),
        suggestedSupplierId: supplierCode ? supplierByCode.get(supplierCode)?.id : undefined
      })
      groups.set(requestKey, group)
    })
    for (const [requestKey, group] of groups) {
      const project = projectByCode.get(group.projectCode)!
      await createScmPurchaseDocument({
        tenantId,
        kind: 'purchase_request',
        documentNo: '',
        documentTypeId: null,
        projectId: project.id,
        supplierId: null,
        sourceId: null,
        documentDate: group.documentDate,
        deliveryDate: null,
        details: { department: '' },
        lines: group.lines,
        paymentPlans: [],
        deliveryPlans: [],
        clauses: [],
        remark: group.remark || `导入分组 ${requestKey}`
      })
    }
  }
  async function importOrders(rows: Array<Record<string, unknown>>): Promise<void> {
    const tenantId = importTenantId.value
    if (!tenantId || !hasAuth('ScmPurchaseOrder:Add'))
      throw new Error('请选择有新增采购订单权限的业务租户')
    if (!rows.length) throw new Error('导入文件没有采购订单明细')
    await userStore.ensureDictLoaded('scmTaxRate')
    const [projects, materialResult, supplierResult, warehouses, bins] = await Promise.all([
      fetchScmPurchaseProjectOptions(tenantId),
      fetchScmMaterialOptions(tenantId),
      fetchScmSupplierOptions(tenantId),
      fetchScmPurchaseWarehouseOptions(tenantId),
      fetchScmPurchaseBinOptions(tenantId)
    ])
    const employees: Array<{ id: string; employeeNo: string }> = []
    for (let from = 0; ; from += 200) {
      const page = await fetchEmployeeSelectorList({ tenantId, from, to: from + 199 })
      if (page.error) throw new Error('采购员花名册加载失败')
      employees.push(...page.data)
      if (employees.length >= page.total || !page.data.length) break
    }
    const projectByCode = new Map(projects.map((item) => [item.projectCode, item]))
    const supplierByCode = new Map(
      (supplierResult.data ?? []).map((item) => [item.supplierCode, item])
    )
    const materialByCode = new Map(
      (materialResult.data ?? []).map((item) => [item.materialCode, item])
    )
    const employeeByNo = new Map(employees.map((item) => [item.employeeNo, item]))
    const warehouseByCode = new Map(warehouses.map((item) => [item.warehouseCode, item]))
    const taxRates = new Set(
      (userStore.getDictMap?.scmTaxRate ?? []).map((item) => Number(item.value))
    )
    const unitFactor = (
      material: NonNullable<ReturnType<typeof materialByCode.get>>,
      unitId?: string | null
    ) => {
      if (!unitId || unitId === material.baseUnitId) return 1
      const relation = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
      return relation?.sourceFactor && relation.baseFactor > 0
        ? relation.baseFactor / relation.sourceFactor
        : null
    }
    const groups = new Map<
      string,
      {
        projectId: string
        supplierId: string
        buyerId: string
        documentDate: string
        lines: ScmPurchaseLine[]
        remark: string
      }
    >()
    rows.forEach((row, index) => {
      const at = `第 ${index + 2} 行`
      const key = String(row.orderKey ?? '').trim()
      const project = projectByCode.get(String(row.projectCode ?? '').trim())
      const supplier = supplierByCode.get(String(row.supplierCode ?? '').trim())
      const buyer = employeeByNo.get(String(row.buyerEmployeeNo ?? '').trim())
      const material = materialByCode.get(String(row.materialCode ?? '').trim())
      const documentDate = String(row.documentDate ?? '').trim()
      const quantity = Number(row.quantity)
      const unitPrice = row.unitPrice == null || row.unitPrice === '' ? 0 : Number(row.unitPrice)
      const taxRate = Number(row.taxRate)
      if (!key || !project || !supplier || !buyer || !material)
        throw new Error(`${at}分组号、项目、供应商、采购员或物料无效`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || !dayjs(documentDate).isValid())
        throw new Error(`${at}订单日期无效`)
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        Math.abs(unitPrice * 10000 - Math.round(unitPrice * 10000)) > 0.000001 ||
        !taxRates.has(taxRate)
      )
        throw new Error(`${at}数量、四位单价或税率无效`)
      const purchaseFactor = unitFactor(material, material.purchaseUnitId)
      const auxiliaryFactor = unitFactor(material, material.auxiliaryUnitId)
      const auxiliaryFactor2 = unitFactor(material, material.auxiliaryUnit2Id)
      if (
        !purchaseFactor ||
        (material.auxiliaryUnitId && !auxiliaryFactor) ||
        (material.auxiliaryUnit2Id && !auxiliaryFactor2)
      )
        throw new Error(`${at}物料单位换算关系不完整`)
      const baseQuantity = Math.round(quantity * purchaseFactor * 1000) / 1000
      const warehouseCode = String(row.warehouseCode ?? '').trim()
      const binCode = String(row.binCode ?? '').trim()
      const warehouse = warehouseCode ? warehouseByCode.get(warehouseCode) : undefined
      const bin = binCode
        ? bins.find((item) => item.binCode === binCode && item.warehouseId === warehouse?.id)
        : undefined
      if (warehouseCode && !warehouse) throw new Error(`${at}仓库编码不存在`)
      if (binCode && !bin) throw new Error(`${at}仓位不属于所选仓库`)
      const group = groups.get(key) ?? {
        projectId: project.id,
        supplierId: supplier.id,
        buyerId: buyer.id,
        documentDate,
        lines: [],
        remark: String(row.remark ?? '').trim()
      }
      if (
        group.projectId !== project.id ||
        group.supplierId !== supplier.id ||
        group.buyerId !== buyer.id ||
        group.documentDate !== documentDate
      )
        throw new Error(`分组 ${key} 的项目、供应商、采购员和日期须一致`)
      if (group.lines.length >= 200) throw new Error(`分组 ${key} 超过 200 行`)
      group.lines.push({
        lineId: crypto.randomUUID(),
        lineNo: (group.lines.length + 1) * 10,
        materialId: material.id,
        materialCode: material.materialCode,
        materialDescription: material.materialDescription,
        specification: material.specification || '',
        unit: material.purchaseUnit || material.baseUnitName || material.unit || '',
        baseUnit: material.baseUnitName || material.unit || '',
        quantity,
        baseQuantity,
        unitPrice,
        taxRate,
        taxInclusiveUnitPrice: Math.round(unitPrice * (1 + taxRate / 100) * 10000) / 10000,
        auxiliaryUnit: material.auxiliaryUnit || '',
        auxiliaryQuantity:
          material.auxiliaryUnitId && auxiliaryFactor
            ? Math.round((baseQuantity / auxiliaryFactor) * 1000) / 1000
            : 0,
        auxiliaryUnit2: material.auxiliaryUnit2 || '',
        auxiliaryQuantity2:
          material.auxiliaryUnit2Id && auxiliaryFactor2
            ? Math.round((baseQuantity / auxiliaryFactor2) * 1000) / 1000
            : 0,
        warehouseId: warehouse?.id,
        warehouse: warehouse?.warehouseName || '',
        binId: bin?.id,
        location: bin?.binName || '',
        discountMode: 'none',
        discountRate: 0,
        gift: ['是', 'true', '1', 'yes'].includes(
          String(row.gift ?? '')
            .trim()
            .toLowerCase()
        )
      })
      groups.set(key, group)
    })
    for (const [key, group] of groups)
      await createScmPurchaseDocument({
        tenantId,
        kind: 'purchase_order',
        documentNo: '',
        documentTypeId: null,
        projectId: group.projectId,
        supplierId: group.supplierId,
        sourceId: null,
        documentDate: group.documentDate,
        deliveryDate: null,
        details: { buyer: group.buyerId, ownerType: 'self', paymentMode: 'amount' },
        lines: group.lines,
        paymentPlans: [],
        deliveryPlans: [],
        clauses: [],
        remark: group.remark || `导入分组 ${key}`
      })
  }
</script>
