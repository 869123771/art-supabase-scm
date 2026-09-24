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
          { label: '销售业务', type: 'primary' },
          { label: '单据流转', type: 'info' }
        ]"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableRef" />
        </template>
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
          emptyDescription: `创建${config.title}后，可继续维护明细与单据状态。`
        }"
        focusable
      />

      <ScmDocumentDialog ref="dialogRef" @success="handleSaved" />
      <ScmDocumentDialog ref="shippingDialogRef" @success="handleShippingSaved" />
      <ArtTableMultipleSelect
        ref="shippingLinePickerRef"
        v-model="shippingSelectedLineIds"
        title="选取下推发货明细"
        subtitle="只显示该订单尚未下推的数量；选择后可在发货通知单中继续填写。"
        row-key="id"
        label-key="materialDescription"
        description-key="materialCode"
        :data="shippingLineChoices"
        :columns="shippingLineColumns"
        :show-pagination="false"
        :empty-text="shippingPickerLoading ? '正在加载可发明细…' : '暂无可发明细'"
        :empty-description="
          shippingPickerLoading
            ? '正在核对订单状态和剩余可发数量。'
            : '当前订单已无可下推的发货数量。'
        "
        @confirm="confirmShippingLines"
      >
        <template #trigger><span class="hidden" /></template>
      </ArtTableMultipleSelect>
      <ScmDocumentDetailDrawer ref="detailDrawerRef" />
      <QuotationConversionDialog ref="conversionDialogRef" @success="handleConverted" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElMessage } from 'element-plus'
  import { storeToRefs } from 'pinia'
  import { useRouter } from 'vue-router'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectColumn,
    DataSelectKey
  } from '@/components/core/forms/art-data-select/types'
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
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useUserStore } from '@/store/modules/user'
  import type { ColumnOption } from '@/types'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    activateScmProjectQuotation,
    deleteScmSalesDocument,
    fetchScmCustomerOptions,
    fetchScmEngineeringReferenceOptions,
    fetchScmMaterialOptions,
    fetchScmProjectOptions,
    fetchScmSalesDocument,
    fetchScmSalesDocuments,
    fetchScmRemainingSourceLines,
    generateScmSalesContract,
    importScmSalesOrders,
    importScmSalesQuotations,
    transitionScmSalesDocument,
    type ScmDocumentKind,
    type ScmDocumentLine,
    type ScmQuotationConversionResult,
    type ScmQuotationConversionTarget,
    type ScmSalesDocument,
    type ScmSalesDocumentQuery,
    type ScmSalesDocumentWrite
  } from '@scm/api'
  import { scmDocumentConfigs, type ScmDocumentTransition } from './document-config'
  import ScmDocumentDialog from './modules/scm-document-dialog.vue'
  import ScmDocumentDetailDrawer from './modules/scm-document-detail-drawer.vue'
  import QuotationConversionDialog from './modules/quotation-conversion-dialog.vue'

  defineOptions({ name: 'ScmDocumentWorkspace' })

  const props = defineProps<{ kind: ScmDocumentKind }>()
  const config = computed(() => scmDocumentConfigs[props.kind])
  const router = useRouter()
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const userStore = useUserStore()
  const { isPlatformSuper, getDictMap } = storeToRefs(userStore)
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
      kind: ScmDocumentKind
      record?: ScmSalesDocument
      copy?: boolean
      tenantOptions: Array<{ label: string; value: string }>
      effectiveTenantId: string | null
      initialSource?: ScmSalesDocument
      sourceLines?: ScmDocumentLine[]
      openSourcePicker?: boolean
    }) => Promise<void>
  }>()
  const shippingDialogRef = ref<InstanceType<typeof ScmDocumentDialog>>()
  const shippingLinePickerRef = ref<ArtDataSelectExpose>()
  const shippingSource = ref<ScmSalesDocument>()
  const shippingSelectedLineIds = ref<DataSelectKey[]>([])
  const shippingLineChoices = ref<Array<ScmDocumentLine & { id: string }>>([])
  const shippingPickerLoading = ref(false)
  let shippingPickerRevision = 0
  const shippingLineColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 220 },
    { prop: 'quantity', label: '可发数量', width: 110, align: 'right' }
  ]
  const detailDrawerRef = ref<{ handleOpen: (record: ScmSalesDocument) => Promise<void> }>()
  const conversionDialogRef = ref<{
    handleOpen: (options: {
      quotation: ScmSalesDocument
      targets: ScmQuotationConversionTarget[]
    }) => Promise<void>
  }>()
  const search = ref<ScmSalesDocumentQuery>({ keyword: '' })
  const importTenantId = computed(() => effectiveTenantId.value || search.value.tenantId || '')
  const importColumns = [
    { key: 'documentNo', title: '报价单号', required: true },
    { key: 'quotationScene', title: '报价场景（标准/工程）', required: true },
    { key: 'projectCode', title: '已有项目编码' },
    { key: 'plannedProjectName', title: '项目名称' },
    { key: 'projectAddress', title: '项目地址' },
    { key: 'constructionNo', title: '施工号' },
    { key: 'customerCode', title: '客户编码', required: true },
    { key: 'documentDate', title: '报价日期（YYYY-MM-DD）', required: true },
    { key: 'autoCreateProject', title: '自动建项目（是/否）' },
    { key: 'autoCreateMaterials', title: '自动建物料（是/否）' },
    { key: 'autoBuildBom', title: '自动建BOM（是/否）' },
    { key: 'materialCategoryCode', title: '物料分类编码' },
    { key: 'baseUnitCode', title: '基本单位编码' },
    { key: 'materialCodeRuleCode', title: '物料编码规则' },
    { key: 'materialCode', title: '物料编码' },
    { key: 'lineNo', title: '行号' },
    { key: 'materialDescription', title: '物料描述', required: true },
    { key: 'specification', title: '规格型号' },
    { key: 'brand', title: '品牌' },
    { key: 'division', title: '分部工程' },
    { key: 'salesUnit', title: '销售单位' },
    { key: 'quantity', title: '数量', required: true },
    { key: 'unitPrice', title: '单价（元）', required: true },
    { key: 'taxRate', title: '税率（%）' },
    { key: 'costUnitPrice', title: '成本单价（元）' },
    { key: 'remark', title: '备注' }
  ]
  const orderImportColumns = [
    { key: 'orderKey', title: '导入分组号', required: true },
    { key: 'projectCode', title: '项目编码', required: true },
    { key: 'customerCode', title: '客户编码', required: true },
    { key: 'documentDate', title: '订单日期（YYYY-MM-DD）', required: true },
    { key: 'materialCode', title: '物料编码' },
    { key: 'materialDescription', title: '物料描述', required: true },
    { key: 'quantity', title: '数量', required: true },
    { key: 'unitPrice', title: '未税单价（元）', required: true },
    { key: 'taxRate', title: '税率（%）', required: true },
    { key: 'gift', title: '赠品（是/否）' },
    { key: 'remark', title: '订单备注' }
  ]

  const statusOptions = computed(() =>
    (getDictMap.value?.scmDocumentStatus ?? []).filter((option) =>
      config.value.statusValues.includes(option.value as ScmSalesDocument['status'])
    )
  )

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
      props: { clearable: true, placeholder: `${config.value.numberLabel}、项目或客户` }
    },
    {
      label: '单据状态',
      key: 'status',
      type: 'select',
      props: { clearable: true, options: statusOptions.value }
    }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'ScmSalesOrder:Import',
      type: 'import',
      label: importTenantId.value ? '导入订单' : '请先选择所属租户',
      disabled:
        props.kind !== 'sales_order' || !importTenantId.value || !hasAuth('ScmSalesOrder:Add'),
      hidden: props.kind !== 'sales_order',
      importColumns: orderImportColumns,
      importApi: importOrders,
      onImportError: handleImportError
    },
    {
      permission: 'ScmSalesQuotationDoc:Import',
      type: 'import',
      label: importTenantId.value ? '导入' : '请先选择所属租户',
      disabled: props.kind !== 'sales_quotation' || !importTenantId.value,
      hidden: props.kind !== 'sales_quotation',
      importColumns,
      importApi: importQuotations,
      onImportError: handleImportError
    },
    {
      permission: 'ScmSalesOrder:Select',
      key: 'select-order-lines',
      label: '选单',
      icon: 'ri:file-list-3-line',
      hidden: props.kind !== 'sales_order',
      disabled: !hasAuth('ScmSalesOrder:Add'),
      onClick: () => openDialog(undefined, false, true)
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
        ...(props.kind === 'sales_quotation' ? [{ key: 'quotationScene', title: '报价场景' }] : []),
        { key: 'projectName', title: '项目名称' },
        { key: 'customerName', title: '客户全称' },
        { key: 'documentDate', title: '单据日期' },
        { key: 'deliveryDate', title: '交货日期' },
        { key: 'status', title: '单据状态' },
        ...(props.kind === 'sales_order'
          ? [
              { key: 'orderStatus', title: '订单状态' },
              { key: 'salesperson', title: '销售员' },
              { key: 'salesDepartment', title: '销售部门' }
            ]
          : []),
        { key: 'subtotal', title: '金额(元)' },
        { key: 'taxAmount', title: '税金(元)' },
        { key: 'totalAmount', title: '总价(元)' },
        { key: 'remark', title: '备注' }
      ],
      exportData: exportDocuments
    }
  ])

  const selectionActions = computed<ArtTableQueryHeaderAction[]>(() =>
    props.kind === 'sales_order'
      ? [
          {
            permission: 'ScmSalesOrder:Push',
            key: 'push-shipping',
            label: '下推发货单',
            icon: 'ri:truck-line',
            selectionRequired: true,
            disabled: (ctx) => ctx.selectedRows.length !== 1 || !hasAuth('ScmShippingNotice:Add'),
            onClick: (ctx) => openDownpush(String(ctx.selectedRows[0]?.id ?? ''))
          }
        ]
      : []
  )

  const columnsFactory = (): ColumnOption<ScmSalesDocument>[] => [
    ...(props.kind === 'sales_order'
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
          onClick={() => void detailDrawerRef.value?.handleOpen(row)}
        >
          {row.documentNo}
        </button>
      )
    },
    {
      prop: 'documentTypeId',
      label: '单据类型',
      minWidth: 140,
      formatter: (row) => row.documentType?.documentTypeName || '--'
    },
    ...(props.kind === 'sales_quotation'
      ? [
          {
            prop: 'quotationScene',
            label: '报价场景',
            minWidth: 125,
            formatter: (row: ScmSalesDocument) =>
              row.details.quotationScene === 'project' ? '项目工程' : '标准产品'
          } as ColumnOption<ScmSalesDocument>
        ]
      : []),
    {
      prop: 'projectId',
      label: '项目名称',
      minWidth: 190,
      formatter: (row) => row.project?.projectName || row.details.plannedProjectName || '--'
    },
    {
      prop: 'projectCode',
      label: '项目编码',
      minWidth: 140,
      formatter: (row) => row.project?.projectCode || '--'
    },
    {
      prop: 'customerId',
      label: '客户全称',
      minWidth: 190,
      formatter: (row) => row.customer?.customerName || '--'
    },
    ...(config.value.sourceKind
      ? [
          {
            prop: 'sourceId',
            label: '来源单据',
            minWidth: 170,
            formatter: (row: ScmSalesDocument) => row.source?.documentNo || '--'
          }
        ]
      : []),
    ...detailColumns(),
    ...(props.kind === 'sales_quotation' ||
    props.kind === 'sales_contract' ||
    props.kind === 'sales_order'
      ? [
          {
            prop: 'materialDescription',
            label: '物料描述',
            minWidth: 180,
            formatter: (row: ScmSalesDocument) => row.lines[0]?.materialDescription || '--'
          },
          {
            prop: 'quantity',
            label: '报价/销售数量',
            minWidth: 130,
            align: 'right' as const,
            formatter: (row: ScmSalesDocument) =>
              row.lines.reduce((sum, line) => sum + line.quantity, 0)
          }
        ]
      : []),
    { prop: 'documentDate', label: '单据日期', width: 120 },
    { prop: 'deliveryDate', label: '交货日期', width: 120 },
    {
      prop: 'status',
      label: '状态',
      width: 110,
      dict: { code: 'scmDocumentStatus', display: 'tag' }
    },
    ...(props.kind === 'sales_contract'
      ? [
          {
            prop: 'contractStatus',
            label: '合同状态',
            width: 125,
            dict: { code: 'scmSalesContractStatus', display: 'tag' as const }
          }
        ]
      : []),
    ...(props.kind === 'sales_order'
      ? [
          {
            prop: 'orderStatus',
            label: '订单状态',
            width: 120,
            dict: { code: 'scmSalesOrderStatus', display: 'tag' as const }
          }
        ]
      : []),
    {
      prop: 'totalAmount',
      label: '总价',
      width: 150,
      align: 'right',
      formatter: (row) => (
        <strong class="font-semibold text-[var(--el-color-primary)]">
          {formatCurrencyValue(row.totalAmount)}
        </strong>
      )
    },
    { prop: 'remark', label: '备注', minWidth: 200, showOverflowTooltip: true },
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
            onClick={() => void detailDrawerRef.value?.handleOpen(row)}
          />
          {canEdit(row) && props.kind !== 'project_quotation' && (
            <ArtButtonTable
              type="edit"
              label={props.kind === 'sales_order' ? '编制' : '编辑'}
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

  function detailColumns(): ColumnOption<ScmSalesDocument>[] {
    const visibleFields =
      props.kind === 'sales_quotation'
        ? ['productCategory']
        : props.kind === 'project_quotation'
          ? ['projectOwner', 'projectDepartment', 'contactName', 'contactPhone']
          : props.kind === 'sales_contract'
            ? ['title', 'paperContractNo', 'signedDate']
            : props.kind === 'sales_order'
              ? ['salespersonId', 'salesDepartment', 'deliveryAddress']
              : props.kind === 'shipping_notice'
                ? [
                    'terminalCustomer',
                    'shippingAddress',
                    'receivingAddress',
                    'receiverName',
                    'transportMode'
                  ]
                : ['terminalCustomer', 'vehiclePlate', 'carrierName', 'driverName', 'freightCost']
    return config.value.fields
      .filter((field) => visibleFields.includes(field.key))
      .map((field) => ({
        prop: field.key,
        label: field.label,
        minWidth: 140,
        showOverflowTooltip: true,
        formatter: (row: ScmSalesDocument) =>
          field.key === 'salespersonId'
            ? row.details.salesperson || '--'
            : String(row.details[field.key] ?? '--')
      }))
  }

  function canEdit(row: ScmSalesDocument): boolean {
    return row.status === 'draft' || row.status === 'created'
  }

  function moreActions(row: ScmSalesDocument): ButtonMoreItem[] {
    const actions: ButtonMoreItem[] =
      props.kind === 'project_quotation'
        ? []
        : [
            {
              auth: config.value.permissions.Copy,
              key: 'copy',
              label: '复制',
              icon: 'ri:file-copy-line'
            }
          ]
    if (canEdit(row)) {
      actions.push({
        auth: config.value.permissions.Delete,
        key: 'delete',
        label: '删除',
        icon: 'ri:delete-bin-line',
        color: 'var(--el-color-danger)'
      })
    }
    for (const transition of config.value.transitions[row.status] ?? []) {
      if (
        props.kind === 'sales_order' &&
        transition.status === 'completed' &&
        row.orderStatus !== 'FDEL'
      )
        continue
      actions.push({
        auth: config.value.permissions[transition.action],
        key: `status:${transition.status}`,
        label: transition.label,
        icon: 'ri:arrow-right-circle-line'
      })
    }
    if (props.kind === 'project_quotation' && row.status === 'effective') {
      actions.push({
        auth: config.value.permissions.GenerateContract,
        key: 'generate-contract',
        label: '生成合同',
        icon: 'ri:file-add-line'
      })
    }
    if (
      props.kind === 'sales_quotation' &&
      row.status === 'effective' &&
      row.details.quotationScene !== 'project'
    ) {
      actions.push({
        auth: config.value.permissions.Convert,
        key: 'convert',
        label: '报价转单',
        icon: 'ri:git-branch-line'
      })
    }
    if (
      props.kind === 'sales_order' &&
      hasAuth('ScmShippingNotice:Add') &&
      ['approved', 'fulfilling'].includes(row.status)
    ) {
      actions.push({
        auth: 'ScmSalesOrder:Push',
        key: 'push-shipping',
        label: '下推发货单',
        icon: 'ri:truck-line'
      })
    }
    return actions
  }

  async function handleMoreAction(row: ScmSalesDocument, key: string): Promise<void> {
    if (key === 'copy') return openDialog(row, true)
    if (key === 'delete') return handleDelete(row)
    if (key === 'generate-contract') return handleGenerateContract(row)
    if (key === 'convert') return openConversionDialog(row)
    if (key === 'push-shipping') return openDownpush(row.id)
    if (key.startsWith('status:')) {
      const transition = (config.value.transitions[row.status] ?? []).find(
        (item) => `status:${item.status}` === key
      )
      if (transition) await handleTransition(row, transition)
    }
  }

  function openDialog(record?: ScmSalesDocument, copy = false, openSourcePicker = false): void {
    void dialogRef.value?.handleOpen({
      kind: props.kind,
      record,
      copy,
      openSourcePicker,
      tenantOptions: tenantOptions.value,
      effectiveTenantId: effectiveTenantId.value
    })
  }

  async function openDownpush(orderId: string): Promise<void> {
    if (!orderId || !hasAuth('ScmShippingNotice:Add')) return
    const revision = ++shippingPickerRevision
    shippingSource.value = undefined
    shippingSelectedLineIds.value = []
    shippingLineChoices.value = []
    shippingPickerLoading.value = true
    await shippingLinePickerRef.value?.open()
    try {
      const response = await fetchScmSalesDocument(orderId)
      if (revision !== shippingPickerRevision) return
      const order = response.data
      if (
        !order ||
        order.kind !== 'sales_order' ||
        !['approved', 'fulfilling'].includes(order.status)
      ) {
        ElMessage.warning('请选一份已审核或执行中的销售订单')
        shippingLinePickerRef.value?.close()
        return
      }
      const available = await fetchScmRemainingSourceLines(order)
      if (revision !== shippingPickerRevision) return
      if (!available.length) {
        ElMessage.warning('此订单已无可下推的发货数量')
        shippingLinePickerRef.value?.close()
        return
      }
      shippingSource.value = order
      shippingLineChoices.value = available.map((line) => ({ ...line, id: line.lineId }))
      await nextTick()
      await shippingLinePickerRef.value?.reload()
    } catch {
      ElMessage.warning('订单明细加载失败，请稍后重试')
    } finally {
      if (revision === shippingPickerRevision) shippingPickerLoading.value = false
    }
  }

  function confirmShippingLines(keys: DataSelectKey[] | DataSelectKey | undefined): void {
    if (shippingPickerLoading.value) return
    const order = shippingSource.value
    if (!order) return
    const selectedKeys = Array.isArray(keys) ? keys : keys == null ? [] : [keys]
    const selected = shippingLineChoices.value.filter((line) => selectedKeys.includes(line.id))
    if (!selected.length) return
    void shippingDialogRef.value?.handleOpen({
      kind: 'shipping_notice',
      initialSource: order,
      sourceLines: selected,
      tenantOptions: tenantOptions.value,
      effectiveTenantId: effectiveTenantId.value
    })
  }

  function handleShippingSaved(): void {
    void router.push('/scm/sales-management/shipping-notice')
  }

  async function handleDelete(row: ScmSalesDocument): Promise<void> {
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
      await deleteScmSalesDocument(row.id)
      await tableRef.value?.refreshRemove()
    } catch {
      // 用户取消或 API 已提示业务错误。
    }
  }

  async function handleTransition(
    row: ScmSalesDocument,
    transition: ScmDocumentTransition
  ): Promise<void> {
    try {
      await confirmAction(
        transition.confirm || `确定将“${row.documentNo}”变更为“${transition.label}”吗？`,
        `${transition.label} · ${config.value.title}`,
        { type: 'warning', confirmButtonText: transition.label, cancelButtonText: '取消' }
      )
      if (
        row.kind === 'project_quotation' &&
        row.status === 'created' &&
        transition.status === 'effective'
      ) {
        await activateScmProjectQuotation(row.id)
      } else {
        await transitionScmSalesDocument(row.id, transition.status)
      }
      await tableRef.value?.refreshUpdate()
    } catch {
      // 用户取消或 API 已提示业务错误。
    }
  }

  function openConversionDialog(row: ScmSalesDocument): void {
    const targets: ScmQuotationConversionTarget[] = []
    if (hasAuth('ScmSalesOrder:Add')) targets.push('sales_order')
    if (hasAuth('ScmPurchaseRequest:Add')) targets.push('purchase_request')
    if (hasAuth('ScmPurchaseOrder:Add')) targets.push('purchase_order')
    void conversionDialogRef.value?.handleOpen({ quotation: row, targets })
  }

  function handleConverted(result: ScmQuotationConversionResult): void {
    const routes: Record<ScmQuotationConversionTarget, string> = {
      sales_order: '/scm/sales-management/sales-order',
      purchase_request: '/scm/purchase-management/purchase-request',
      purchase_order: '/scm/purchase-management/purchase-order'
    }
    void router.push(routes[result.targetKind])
  }

  async function handleGenerateContract(row: ScmSalesDocument): Promise<void> {
    try {
      await confirmAction(`从项目报价“${row.documentNo}”生成一份销售合同草稿？`, '生成销售合同', {
        type: 'warning',
        confirmButtonText: '生成合同',
        cancelButtonText: '取消'
      })
      await generateScmSalesContract(row.id)
      await router.push('/scm/sales-management/sales-contract')
    } catch {
      // 用户取消或 API 已提示业务错误。
    }
  }

  function handleSaved(mode: 'add' | 'edit'): void {
    void (mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate())
  }

  async function fetchPage(query: ScmSalesDocumentQuery) {
    return fetchScmSalesDocuments(props.kind, query)
  }

  async function exportDocuments(): Promise<Array<Record<string, unknown>>> {
    const { data } = await fetchScmSalesDocuments(props.kind, {
      ...search.value,
      from: 0,
      to: 9999
    })
    return (data ?? []).map((row) => ({
      documentNo: row.documentNo,
      quotationScene: row.details.quotationScene === 'project' ? '工程' : '标准',
      projectName: row.project?.projectName || row.details.plannedProjectName || '',
      customerName: row.customer?.customerName || '',
      documentDate: row.documentDate,
      deliveryDate: row.deliveryDate || '',
      status:
        (getDictMap.value?.scmDocumentStatus ?? []).find((item) => item.value === row.status)
          ?.label || row.status,
      orderStatus:
        (getDictMap.value?.scmSalesOrderStatus ?? []).find((item) => item.value === row.orderStatus)
          ?.label ||
        row.orderStatus ||
        '',
      salesperson: row.details.salesperson || '',
      salesDepartment: row.details.salesDepartment || '',
      subtotal: row.subtotal,
      taxAmount: row.taxAmount,
      totalAmount: row.totalAmount,
      remark: row.remark || ''
    }))
  }

  function readImportBoolean(value: unknown, rowLabel: string, fieldLabel: string): boolean {
    const text = String(value ?? '').trim()
    if (!text || text === '否' || text === '0' || text.toLowerCase() === 'false') return false
    if (text === '是' || text === '1' || text.toLowerCase() === 'true') return true
    throw new Error(`${rowLabel}：${fieldLabel}只能填写“是”或“否”`)
  }

  async function importOrders(rows: Array<Record<string, unknown>>): Promise<void> {
    const tenantId = importTenantId.value
    if (!tenantId) throw new Error('请先选择所属租户')
    if (!rows.length || rows.length > 2000) throw new Error('每次可导入 1–2000 行明细')
    const [projectResponse, customerResponse, materialResponse] = await Promise.all([
      fetchScmProjectOptions(tenantId),
      fetchScmCustomerOptions(tenantId),
      fetchScmMaterialOptions(tenantId)
    ])
    const projects = new Map((projectResponse.data ?? []).map((item) => [item.projectCode, item]))
    const customers = new Map(
      (customerResponse.data ?? []).map((item) => [item.customerCode, item])
    )
    const materials = new Map(
      (materialResponse.data ?? []).map((item) => [item.materialCode, item])
    )
    const documents = new Map<string, ScmSalesDocumentWrite>()
    rows.forEach((row, index) => {
      const rowLabel = `第 ${index + 2} 行`
      const orderKey = String(row.orderKey ?? '').trim()
      const project = projects.get(String(row.projectCode ?? '').trim())
      const customer = customers.get(String(row.customerCode ?? '').trim())
      const materialCode = String(row.materialCode ?? '').trim()
      const material = materialCode ? materials.get(materialCode) : undefined
      const description = String(row.materialDescription ?? '').trim()
      const documentDate = String(row.documentDate ?? '').trim()
      const quantityText = String(row.quantity ?? '').trim()
      const priceText = String(row.unitPrice ?? '').trim()
      const taxText = String(row.taxRate ?? '').trim()
      if (
        !orderKey ||
        !project ||
        !customer ||
        (project.customerId && project.customerId !== customer.id)
      )
        throw new Error(`${rowLabel}：分组号、项目编码或客户编码无效`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || Number.isNaN(Date.parse(documentDate)))
        throw new Error(`${rowLabel}：订单日期格式无效`)
      if (materialCode && !material) throw new Error(`${rowLabel}：物料编码不存在`)
      if (!description || description.length > 200) throw new Error(`${rowLabel}：物料描述无效`)
      if (
        !/^\d+(\.\d{1,3})?$/.test(quantityText) ||
        Number(quantityText) <= 0 ||
        !/^\d+(\.\d{1,4})?$/.test(priceText) ||
        !/^\d+(\.\d{1,2})?$/.test(taxText) ||
        Number(taxText) > 100
      )
        throw new Error(`${rowLabel}：数量、单价或税率格式无效`)
      const previous = documents.get(orderKey)
      if (
        previous &&
        (previous.projectId !== project.id ||
          previous.customerId !== customer.id ||
          previous.documentDate !== documentDate)
      )
        throw new Error(`${rowLabel}：同一分组号的项目、客户和日期须一致`)
      const input: ScmSalesDocumentWrite = previous ?? {
        tenantId,
        kind: 'sales_order',
        documentNo: '',
        documentTypeId: null,
        projectId: project.id,
        customerId: customer.id,
        sourceId: null,
        documentDate,
        deliveryDate: null,
        currency: 'CNY',
        details: { paymentPlanMode: 'amount' },
        lines: [],
        fees: [],
        paymentPlans: [],
        deliveryPlans: [],
        clauses: [],
        remark: String(row.remark ?? '').trim()
      }
      input.lines.push({
        lineId: crypto.randomUUID(),
        materialId: material?.id ?? '',
        materialCode,
        materialDescription: description,
        quantity: Number(quantityText),
        unitPrice: Number(priceText),
        taxRate: Number(taxText),
        gift: readImportBoolean(row.gift, rowLabel, '赠品'),
        discountMode: 'none',
        discountRate: 0
      })
      if (input.lines.length > 200) throw new Error(`${rowLabel}：一份订单最多 200 行明细`)
      documents.set(orderKey, input)
    })
    await importScmSalesOrders([...documents.values()])
  }

  async function importQuotations(rows: Array<Record<string, unknown>>): Promise<void> {
    const tenantId = importTenantId.value
    if (!tenantId) throw new Error('请先选择所属租户')
    if (!rows.length || rows.length > 2000) throw new Error('每次可导入 1–2000 行明细')
    const [projectResponse, customerResponse, materialResponse, engineeringResponse] =
      await Promise.all([
        fetchScmProjectOptions(tenantId),
        fetchScmCustomerOptions(tenantId),
        fetchScmMaterialOptions(tenantId),
        fetchScmEngineeringReferenceOptions(tenantId)
      ])
    const projects = new Map((projectResponse.data ?? []).map((item) => [item.projectCode, item]))
    const customers = new Map(
      (customerResponse.data ?? []).map((item) => [item.customerCode, item])
    )
    const materials = new Map(
      (materialResponse.data ?? []).map((item) => [item.materialCode, item])
    )
    const categories = new Map(
      (engineeringResponse.data?.categories ?? []).map((item) => [item.code, item.id])
    )
    const units = new Map(
      (engineeringResponse.data?.units ?? []).map((item) => [item.code, item.id])
    )
    const codeRules = new Map(
      (engineeringResponse.data?.codeRules ?? []).map((item) => [item.code, item.id])
    )
    const documents = new Map<string, ScmSalesDocumentWrite>()
    rows.forEach((row, index) => {
      const prefix = `第 ${index + 2} 行`
      const documentNo = String(row.documentNo ?? '').trim()
      const sceneText = String(row.quotationScene ?? '').trim()
      const quotationScene =
        sceneText === '工程' ? 'project' : sceneText === '标准' ? 'standard' : ''
      const projectCode = String(row.projectCode ?? '').trim()
      const project = projectCode ? projects.get(projectCode) : undefined
      const customer = customers.get(String(row.customerCode ?? '').trim())
      const documentDate = String(row.documentDate ?? '').trim()
      const materialCode = String(row.materialCode ?? '').trim()
      const material = materialCode ? materials.get(materialCode) : undefined
      const materialDescription = String(row.materialDescription ?? '').trim()
      const quantityText = String(row.quantity ?? '').trim()
      const unitPriceText = String(row.unitPrice ?? '').trim()
      const taxRateText = String(row.taxRate ?? '0').trim() || '0'
      const costText = String(row.costUnitPrice ?? '0').trim() || '0'
      if (
        !documentNo ||
        documentNo.length > 60 ||
        !quotationScene ||
        !customer ||
        (projectCode && !project)
      ) {
        throw new Error(`${prefix}：报价单号、报价场景、项目编码或客户编码无效`)
      }
      const autoCreateProject = readImportBoolean(row.autoCreateProject, prefix, '自动建项目')
      const autoCreateMaterials = readImportBoolean(row.autoCreateMaterials, prefix, '自动建物料')
      const autoBuildBom = readImportBoolean(row.autoBuildBom, prefix, '自动建BOM')
      const plannedProjectName = String(row.plannedProjectName ?? '').trim()
      const constructionNo = String(row.constructionNo ?? '').trim()
      if (quotationScene === 'standard' && !project)
        throw new Error(`${prefix}：标准报价必须填写已有项目编码`)
      if (quotationScene === 'project' && !project && (!autoCreateProject || !plannedProjectName))
        throw new Error(`${prefix}：工程报价未选已有项目时，须启用自动建项目并填写项目名称`)
      if (quotationScene === 'project' && !constructionNo)
        throw new Error(`${prefix}：工程报价必须填写施工号`)
      if (
        quotationScene === 'project' &&
        autoBuildBom &&
        !autoCreateMaterials &&
        !String(row.materialCode ?? '').trim()
      )
        throw new Error(`${prefix}：自动建BOM的未编码子目须启用自动建物料`)
      const categoryCode = String(row.materialCategoryCode ?? '').trim()
      const unitCode = String(row.baseUnitCode ?? '').trim()
      const ruleCode = String(row.materialCodeRuleCode ?? '').trim()
      const materialCategoryId = categories.get(categoryCode)
      const baseUnitId = units.get(unitCode)
      const materialCodeRuleId = codeRules.get(ruleCode)
      if (
        quotationScene === 'project' &&
        (autoCreateMaterials || autoBuildBom) &&
        (!materialCategoryId || !baseUnitId || !materialCodeRuleId)
      )
        throw new Error(`${prefix}：请填写当前租户有效的物料分类、基本单位与编码规则`)
      if (project?.customerId && project.customerId !== customer.id) {
        throw new Error(`${prefix}：客户与项目不一致`)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || Number.isNaN(Date.parse(documentDate))) {
        throw new Error(`${prefix}：报价日期格式无效`)
      }
      if (materialCode && !material) throw new Error(`${prefix}：物料编码不存在`)
      if (!materialDescription || materialDescription.length > 200)
        throw new Error(`${prefix}：物料描述无效`)
      if (
        !/^\d+(\.\d{1,3})?$/.test(quantityText) ||
        Number(quantityText) <= 0 ||
        !/^\d+(\.\d{1,2})?$/.test(unitPriceText) ||
        !/^\d+(\.\d{1,2})?$/.test(taxRateText) ||
        Number(taxRateText) > 100 ||
        !/^\d+(\.\d{1,2})?$/.test(costText)
      ) {
        throw new Error(`${prefix}：数量、单价、税率或成本格式无效`)
      }
      const previous = documents.get(documentNo)
      if (
        previous &&
        (previous.projectId !== (project?.id ?? null) ||
          previous.customerId !== customer.id ||
          previous.documentDate !== documentDate ||
          previous.details.quotationScene !== quotationScene ||
          previous.details.plannedProjectName !== plannedProjectName ||
          previous.details.projectAddress !== String(row.projectAddress ?? '').trim() ||
          previous.details.constructionNo !== constructionNo ||
          Boolean(previous.details.autoCreateProject) !== autoCreateProject ||
          Boolean(previous.details.autoCreateMaterials) !== autoCreateMaterials ||
          Boolean(previous.details.autoBuildBom) !== autoBuildBom ||
          previous.details.materialCategoryId !== materialCategoryId ||
          previous.details.baseUnitId !== baseUnitId ||
          previous.details.materialCodeRuleId !== materialCodeRuleId)
      ) {
        throw new Error(`${prefix}：同一报价单的项目、客户和日期须一致`)
      }
      const input = previous ?? {
        tenantId,
        kind: 'sales_quotation',
        documentNo,
        documentTypeId: null,
        projectId: project?.id ?? null,
        customerId: customer.id,
        sourceId: null,
        documentDate,
        deliveryDate: null,
        currency: 'CNY',
        details:
          quotationScene === 'project'
            ? {
                quotationScene,
                plannedProjectName,
                projectAddress: String(row.projectAddress ?? '').trim(),
                constructionNo,
                autoCreateProject,
                autoCreateMaterials,
                autoBuildBom,
                materialCategoryId,
                baseUnitId,
                materialCodeRuleId
              }
            : { quotationScene },
        lines: [],
        fees: [],
        paymentPlans: [],
        deliveryPlans: [],
        clauses: [],
        remark: String(row.remark ?? '').trim()
      }
      const lineNo =
        row.lineNo == null || row.lineNo === '' ? (input.lines.length + 1) * 10 : Number(row.lineNo)
      if (
        !Number.isInteger(lineNo) ||
        lineNo < 1 ||
        input.lines.some((line) => line.lineNo === lineNo)
      )
        throw new Error(`${prefix}：报价明细行号须为不重复的正整数`)
      input.lines.push({
        lineId: crypto.randomUUID(),
        lineNo,
        materialId: material?.id ?? '',
        materialCode,
        materialDescription,
        specification: String(row.specification ?? '').trim() || material?.specification || '',
        brand: String(row.brand ?? '').trim(),
        division: String(row.division ?? '').trim(),
        salesUnit: String(row.salesUnit ?? '').trim() || material?.unit || '',
        quantity: Number(quantityText),
        unitPrice: Number(unitPriceText),
        taxRate: Number(taxRateText),
        costUnitPrice: Number(costText)
      })
      if (input.lines.length > 200) throw new Error(`${prefix}：一份报价单最多 200 行明细`)
      documents.set(documentNo, input)
    })
    await importScmSalesQuotations([...documents.values()])
  }

  function handleImportError(error: Error): void {
    ElMessage.warning(
      /^第 \d+ 行/.test(error.message) ? error.message : '导入失败，请检查模板及数据归属后重试'
    )
  }

  onMounted(() => {
    void tenantScopeStore.loadTenantOptions()
    void Promise.all([
      userStore.ensureDictLoaded('scmDocumentStatus'),
      ...(props.kind === 'sales_contract'
        ? [userStore.ensureDictLoaded('scmSalesContractStatus')]
        : []),
      ...(props.kind === 'sales_order' ? [userStore.ensureDictLoaded('scmSalesOrderStatus')] : [])
    ]).catch(() => ElMessage.warning('单据状态加载失败，请刷新页面重试'))
  })
  watch(effectiveTenantId, (tenantId) => {
    if (tenantId) search.value.tenantId = undefined
  })
</script>
