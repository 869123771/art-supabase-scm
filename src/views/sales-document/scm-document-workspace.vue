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
          emptyDescription: `创建${config.title}后，可继续维护明细与单据状态。`
        }"
        focusable
      />

      <ScmDocumentDialog ref="dialogRef" @success="handleSaved" />
      <ScmDocumentDetailDrawer ref="detailDrawerRef" />
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
    deleteScmSalesDocument,
    fetchScmCustomerOptions,
    fetchScmMaterialOptions,
    fetchScmProjectOptions,
    fetchScmSalesDocuments,
    generateScmSalesContract,
    importScmSalesQuotations,
    transitionScmSalesDocument,
    type ScmDocumentKind,
    type ScmSalesDocument,
    type ScmSalesDocumentQuery,
    type ScmSalesDocumentWrite
  } from '@scm/api'
  import { scmDocumentConfigs, type ScmDocumentTransition } from './document-config'
  import ScmDocumentDialog from './modules/scm-document-dialog.vue'
  import ScmDocumentDetailDrawer from './modules/scm-document-detail-drawer.vue'

  defineOptions({ name: 'ScmDocumentWorkspace' })

  const props = defineProps<{ kind: ScmDocumentKind }>()
  const config = computed(() => scmDocumentConfigs[props.kind])
  const router = useRouter()
  const { confirmAction } = useArtFeedback()
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
    }) => Promise<void>
  }>()
  const detailDrawerRef = ref<{ handleOpen: (record: ScmSalesDocument) => Promise<void> }>()
  const search = ref<ScmSalesDocumentQuery>({ keyword: '' })
  const importTenantId = computed(() => effectiveTenantId.value || search.value.tenantId || '')
  const importColumns = [
    { key: 'documentNo', title: '报价单号', required: true },
    { key: 'projectCode', title: '项目编码', required: true },
    { key: 'customerCode', title: '客户编码', required: true },
    { key: 'documentDate', title: '报价日期（YYYY-MM-DD）', required: true },
    { key: 'materialCode', title: '物料编码' },
    { key: 'materialDescription', title: '物料描述', required: true },
    { key: 'quantity', title: '数量', required: true },
    { key: 'unitPrice', title: '单价（元）', required: true },
    { key: 'taxRate', title: '税率（%）' },
    { key: 'costUnitPrice', title: '成本单价（元）' },
    { key: 'remark', title: '备注' }
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
        { key: 'customerName', title: '客户全称' },
        { key: 'documentDate', title: '单据日期' },
        { key: 'deliveryDate', title: '交货日期' },
        { key: 'status', title: '单据状态' },
        { key: 'subtotal', title: '金额(元)' },
        { key: 'taxAmount', title: '税金(元)' },
        { key: 'totalAmount', title: '总价(元)' },
        { key: 'remark', title: '备注' }
      ],
      exportData: exportDocuments
    }
  ])

  const columnsFactory = (): ColumnOption<ScmSalesDocument>[] => [
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
    {
      prop: 'projectId',
      label: '项目名称',
      minWidth: 190,
      formatter: (row) => row.project?.projectName || '--'
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
          {canEdit(row) && (
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

  function detailColumns(): ColumnOption<ScmSalesDocument>[] {
    const visibleFields =
      props.kind === 'sales_quotation'
        ? ['productCategory']
        : props.kind === 'project_quotation'
          ? ['projectOwner', 'projectDepartment', 'contactName', 'contactPhone']
          : props.kind === 'sales_contract'
            ? ['title', 'paperContractNo', 'signedDate']
            : props.kind === 'sales_order'
              ? ['deliveryAddress']
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
        formatter: (row: ScmSalesDocument) => String(row.details[field.key] ?? '--')
      }))
  }

  function canEdit(row: ScmSalesDocument): boolean {
    return row.status === 'draft' || row.status === 'created'
  }

  function moreActions(row: ScmSalesDocument): ButtonMoreItem[] {
    const actions: ButtonMoreItem[] = [
      { auth: config.value.permissions.Copy, key: 'copy', label: '复制', icon: 'ri:file-copy-line' }
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
      actions.push({
        auth: config.value.permissions.GeneratePlan,
        key: 'generate-plan',
        label: '生成计划',
        icon: 'ri:calendar-todo-line'
      })
    }
    return actions
  }

  async function handleMoreAction(row: ScmSalesDocument, key: string): Promise<void> {
    if (key === 'copy') return openDialog(row, true)
    if (key === 'delete') return handleDelete(row)
    if (key === 'generate-contract') return handleGenerateContract(row)
    if (key === 'generate-plan') {
      ElMessage.info('采购申请与 MES 生产计划尚未接入。本次先完成销售页面，暂不生成无去向的计划。')
      return
    }
    if (key.startsWith('status:')) {
      const transition = (config.value.transitions[row.status] ?? []).find(
        (item) => `status:${item.status}` === key
      )
      if (transition) await handleTransition(row, transition)
    }
  }

  function openDialog(record?: ScmSalesDocument, copy = false): void {
    void dialogRef.value?.handleOpen({
      kind: props.kind,
      record,
      copy,
      tenantOptions: tenantOptions.value,
      effectiveTenantId: effectiveTenantId.value
    })
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
      await transitionScmSalesDocument(row.id, transition.status)
      await tableRef.value?.refreshUpdate()
    } catch {
      // 用户取消或 API 已提示业务错误。
    }
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
      projectName: row.project?.projectName || '',
      customerName: row.customer?.customerName || '',
      documentDate: row.documentDate,
      deliveryDate: row.deliveryDate || '',
      status:
        (getDictMap.value?.scmDocumentStatus ?? []).find((item) => item.value === row.status)
          ?.label || row.status,
      subtotal: row.subtotal,
      taxAmount: row.taxAmount,
      totalAmount: row.totalAmount,
      remark: row.remark || ''
    }))
  }

  async function importQuotations(rows: Array<Record<string, unknown>>): Promise<void> {
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
      const prefix = `第 ${index + 2} 行`
      const documentNo = String(row.documentNo ?? '').trim()
      const project = projects.get(String(row.projectCode ?? '').trim())
      const customer = customers.get(String(row.customerCode ?? '').trim())
      const documentDate = String(row.documentDate ?? '').trim()
      const materialCode = String(row.materialCode ?? '').trim()
      const material = materialCode ? materials.get(materialCode) : undefined
      const materialDescription = String(row.materialDescription ?? '').trim()
      const quantityText = String(row.quantity ?? '').trim()
      const unitPriceText = String(row.unitPrice ?? '').trim()
      const taxRateText = String(row.taxRate ?? '0').trim() || '0'
      const costText = String(row.costUnitPrice ?? '0').trim() || '0'
      if (!documentNo || documentNo.length > 60 || !project || !customer) {
        throw new Error(`${prefix}：报价单号、项目编码或客户编码无效`)
      }
      if (project.customerId && project.customerId !== customer.id) {
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
        (previous.projectId !== project.id ||
          previous.customerId !== customer.id ||
          previous.documentDate !== documentDate)
      ) {
        throw new Error(`${prefix}：同一报价单的项目、客户和日期须一致`)
      }
      const input = previous ?? {
        tenantId,
        kind: 'sales_quotation',
        documentNo,
        documentTypeId: null,
        projectId: project.id,
        customerId: customer.id,
        sourceId: null,
        documentDate,
        deliveryDate: null,
        currency: 'CNY',
        details: {},
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
        materialDescription,
        specification: material?.specification ?? '',
        salesUnit: material?.unit ?? '',
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

  onMounted(() => void tenantScopeStore.loadTenantOptions())
  watch(effectiveTenantId, (tenantId) => {
    if (tenantId) search.value.tenantId = undefined
  })
</script>
