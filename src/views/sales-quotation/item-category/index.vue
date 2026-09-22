<template>
  <ArtPermissionGuard permission="ScmQuoteCategory:View" resource-name="报价项分类">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        eyebrow="QUOTATION ITEMS"
        title="报价项分类"
        description="按项目维护报价项、数量、单价与附加费用；总价由系统统一计算。"
        icon="ri:price-tag-2-line"
        :tags="[
          { label: '关联项目主数据', type: 'primary' },
          { label: '自动核算总价', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>

      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :search-items="searchItems"
        :api-fn="fetchQuoteCategories"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '暂无报价项分类',
          emptyDescription: '新增报价项后，项目报价即可引用分类与费用。'
        }"
        focusable
      />

      <CategoryDialog ref="dialogRef" @success="handleSaved" />
      <CategoryDetailDrawer ref="detailDrawerRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElMessage } from 'element-plus'
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
  import { formatCompactNumberValue, formatCurrencyValue } from '@/utils/ui/format'
  import type { ColumnOption } from '@/types'
  import {
    deleteQuoteCategory,
    fetchQuoteCategories,
    fetchQuoteExpenses,
    fetchScmProjectOptions,
    importQuoteCategories,
    type QuoteCategoryQuery,
    type QuoteCategoryWrite,
    type ScmQuoteCategory
  } from '@scm/api'
  import CategoryDialog from './modules/category-dialog.vue'
  import CategoryDetailDrawer from './modules/category-detail-drawer.vue'

  defineOptions({ name: 'ScmQuoteCategory' })

  const { confirmAction } = useArtFeedback()
  const { isPlatformSuper } = storeToRefs(useUserStore())
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
      record?: ScmQuoteCategory
      copy?: boolean
      tenantOptions: Array<{ label: string; value: string }>
      effectiveTenantId: string | null
    }) => Promise<void>
  }>()
  const detailDrawerRef = ref<{ handleOpen: (record: ScmQuoteCategory) => Promise<void> }>()
  const search = ref<QuoteCategoryQuery>({ keyword: '' })
  const importTenantId = computed(() => effectiveTenantId.value || search.value.tenantId || '')

  const importColumns = [
    { key: 'projectCode', title: '项目编码', required: true },
    { key: 'categoryName', title: '报价项分类', required: true },
    { key: 'quantity', title: '报价数量', required: true },
    { key: 'unitPrice', title: '单价(元)', required: true },
    { key: 'fees', title: '报价费用（编码:金额；多项用分号分隔）' },
    { key: 'remark', title: '备注' }
  ]
  const exportColumns = [
    ...importColumns,
    { key: 'feeTotal', title: '费用合计(元)' },
    { key: 'totalAmount', title: '总价(元)' }
  ]

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
      label: '项目/分类',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入项目编码、名称或分类名称' }
    }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'ScmQuoteCategory:Add',
      type: 'add',
      label: '新增报价项',
      onClick: () => openDialog()
    },
    {
      permission: 'ScmQuoteCategory:Import',
      type: 'import',
      label: importTenantId.value ? '导入' : '请先选择所属租户',
      disabled: !importTenantId.value,
      importColumns,
      importApi: importCategories,
      onImportError: handleImportError
    },
    {
      permission: 'ScmQuoteCategory:Export',
      type: 'export',
      exportFilename: '报价项分类',
      exportSheetName: '报价项分类',
      exportColumns,
      exportData: exportCategories
    }
  ])

  const moreActions: ButtonMoreItem[] = [
    { auth: 'ScmQuoteCategory:Copy', key: 'copy', label: '复制', icon: 'ri:file-copy-line' },
    {
      auth: 'ScmQuoteCategory:Delete',
      key: 'delete',
      label: '删除',
      icon: 'ri:delete-bin-line',
      color: 'var(--el-color-danger)'
    }
  ]

  const columnsFactory = (): ColumnOption<ScmQuoteCategory>[] => [
    {
      prop: 'projectId',
      label: '项目',
      minWidth: 220,
      fixed: 'left',
      formatter: (row) => (
        <div class="min-w-0 leading-5">
          <strong class="block truncate font-medium text-[var(--art-gray-900)]">
            {row.project?.projectName || '--'}
          </strong>
          <small class="block truncate text-[var(--art-gray-600)]">
            {row.project?.projectCode || '--'}
          </small>
        </div>
      )
    },
    { prop: 'categoryName', label: '报价项分类', minWidth: 190, showOverflowTooltip: true },
    {
      prop: 'quantity',
      label: '报价数量',
      width: 112,
      align: 'right',
      formatter: (row) => formatCompactNumberValue(row.quantity, 3)
    },
    {
      prop: 'unitPrice',
      label: '单价',
      width: 135,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.unitPrice)
    },
    {
      prop: 'feeTotal',
      label: '附加费用',
      width: 135,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.feeTotal)
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
            permission="ScmQuoteCategory:View"
            onClick={() => void detailDrawerRef.value?.handleOpen(row)}
          />
          <ArtButtonTable
            type="edit"
            permission="ScmQuoteCategory:Edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonMore
            list={moreActions}
            onClick={(item: ButtonMoreItem) => {
              if (item.key === 'copy') openDialog(row, true)
              if (item.key === 'delete') void handleDelete(row)
            }}
          />
        </BusinessTableRowActions>
      )
    }
  ]

  function openDialog(record?: ScmQuoteCategory, copy = false): void {
    void dialogRef.value?.handleOpen({
      record,
      copy,
      tenantOptions: tenantOptions.value,
      effectiveTenantId: effectiveTenantId.value
    })
  }

  async function handleDelete(row: ScmQuoteCategory): Promise<void> {
    try {
      await confirmAction(
        `确定删除“${row.categoryName}”吗？已被报价单引用的分类无法删除。`,
        '删除报价项分类',
        {
          type: 'warning',
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
      await deleteQuoteCategory(row.id)
      await tableRef.value?.refreshRemove()
    } catch {
      // 用户取消或 API 已提示业务错误。
    }
  }

  function handleSaved(mode: 'add' | 'edit'): void {
    void (mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate())
  }

  async function importCategories(rows: Array<Record<string, unknown>>): Promise<void> {
    const tenantId = importTenantId.value
    if (!tenantId) throw new Error('请先选择所属租户')
    if (!rows.length) throw new Error('导入文件没有可用数据')
    const [projectsResult, expensesResult] = await Promise.all([
      fetchScmProjectOptions(tenantId),
      fetchQuoteExpenses({ tenantId, enabled: true })
    ])
    const projects = projectsResult.data ?? []
    const expenses = expensesResult.data ?? []
    const inputs: QuoteCategoryWrite[] = rows.map((row, index) => {
      const prefix = `第 ${index + 2} 行`
      const projectCode = String(row.projectCode ?? '').trim()
      const project = projects.find((item) => item.projectCode === projectCode)
      if (!project) throw new Error(`${prefix}：项目编码不存在或不可用`)
      const categoryName = String(row.categoryName ?? '').trim()
      if (!categoryName || categoryName.length > 120) {
        throw new Error(`${prefix}：报价项分类长度须为 1–120 个字符`)
      }
      const quantityText = String(row.quantity ?? '').trim()
      const unitPriceText = String(row.unitPrice ?? '').trim()
      const quantity = Number(quantityText)
      const unitPrice = Number(unitPriceText)
      if (!/^\d+(\.\d{1,3})?$/.test(quantityText) || quantity <= 0) {
        throw new Error(`${prefix}：报价数量须为大于 0、最多三位小数的数字`)
      }
      if (!/^\d+(\.\d{1,2})?$/.test(unitPriceText)) {
        throw new Error(`${prefix}：单价须为非负、最多两位小数的数字`)
      }
      const feeText = String(row.fees ?? '').trim()
      const feeItems = feeText
        ? feeText
            .split(/[;；]/)
            .filter(Boolean)
            .map((part) => {
              const [code, amountText, extra] = part.split(/[:：]/)
              const expense = expenses.find((item) => item.expenseCode === code?.trim())
              const amount = Number(amountText)
              if (
                !expense ||
                extra !== undefined ||
                !/^\d+(\.\d{1,2})?$/.test(amountText?.trim() ?? '')
              ) {
                throw new Error(`${prefix}：报价费用格式应为“费用编码:金额”，金额最多两位小数`)
              }
              return { expenseId: expense.id, amount }
            })
        : []
      if (
        feeItems.length > 30 ||
        new Set(feeItems.map((item) => item.expenseId)).size !== feeItems.length
      ) {
        throw new Error(`${prefix}：费用不能重复，每项最多添加 30 种费用`)
      }
      const remark = String(row.remark ?? '').trim()
      if (remark.length > 500) throw new Error(`${prefix}：备注不能超过 500 个字符`)
      return {
        tenantId,
        projectId: project.id,
        categoryName,
        quantity,
        unitPrice,
        feeItems,
        remark
      }
    })
    await importQuoteCategories(inputs)
  }

  function handleImportError(error: Error): void {
    ElMessage.warning(
      /^第 \d+ 行/.test(error.message)
        ? error.message
        : '导入失败，请检查模板、项目编码、重复分类及数据归属后重试'
    )
  }

  async function exportCategories(): Promise<Array<Record<string, unknown>>> {
    const [categories, expenses] = await Promise.all([
      fetchQuoteCategories({ ...search.value, from: 0, to: 9999 }),
      fetchQuoteExpenses({ from: 0, to: 9999 })
    ])
    const expenseCodeById = new Map(
      (expenses.data ?? []).map((item) => [item.id, item.expenseCode])
    )
    return (categories.data ?? []).map((row) => ({
      projectCode: row.project?.projectCode || '',
      categoryName: row.categoryName,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      fees: row.feeItems
        .map((fee) => `${expenseCodeById.get(fee.expenseId) || '已变更'}:${fee.amount}`)
        .join(';'),
      remark: row.remark || '',
      feeTotal: row.feeTotal,
      totalAmount: row.totalAmount
    }))
  }

  onMounted(() => void tenantScopeStore.loadTenantOptions())
  watch(effectiveTenantId, (tenantId) => {
    if (tenantId) search.value.tenantId = undefined
  })
</script>
