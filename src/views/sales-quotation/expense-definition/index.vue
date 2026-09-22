<template>
  <ArtPermissionGuard permission="ScmQuoteExpense:View" resource-name="报价费用定义">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        eyebrow="QUOTATION COSTS"
        title="报价费用定义"
        description="统一维护施工、安装、运输等报价附加费用，供报价明细选择并追溯费用口径。"
        icon="ri:price-tag-3-line"
        :tags="[
          { label: '统一费用口径', type: 'primary' },
          { label: '按租户管理', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>

      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :search-items="searchItems"
        :api-fn="fetchQuoteExpenses"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '暂无报价费用',
          emptyDescription: '创建费用定义后，可在报价明细中选择使用。'
        }"
        focusable
      />

      <ExpenseDialog ref="dialogRef" @success="handleSaved" />
      <ExpenseDetailDrawer ref="detailDrawerRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElMessage, ElTag } from 'element-plus'
  import { storeToRefs } from 'pinia'
  import type { CSSProperties } from 'vue'
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
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useUserStore } from '@/store/modules/user'
  import type { ColumnOption } from '@/types'
  import {
    deleteQuoteExpense,
    fetchQuoteExpenses,
    importQuoteExpenses,
    type QuoteExpenseQuery,
    type QuoteExpenseWrite,
    type ScmQuoteExpense
  } from '@scm/api'
  import ExpenseDialog from './modules/expense-dialog.vue'
  import ExpenseDetailDrawer from './modules/expense-detail-drawer.vue'

  defineOptions({ name: 'ScmQuoteExpense' })

  const { confirmAction } = useArtFeedback()
  const { isPlatformSuper } = storeToRefs(useUserStore())
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions: availableTenants } = storeToRefs(tenantScopeStore)
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<{
    handleOpen: (options: {
      record?: ScmQuoteExpense
      tenantOptions: Array<{ label: string; value: string }>
      effectiveTenantId: string | null
    }) => Promise<void>
  }>()
  const detailDrawerRef = ref<{ handleOpen: (record: ScmQuoteExpense) => Promise<void> }>()
  const search = ref<QuoteExpenseQuery>({ keyword: '', enabled: undefined })
  const tenantOptions = computed(() =>
    availableTenants.value.map((tenant) => ({
      label: `${tenant.tenantName}（${tenant.tenantCode}）`,
      value: tenant.id
    }))
  )
  const importTenantId = computed(() => effectiveTenantId.value || search.value.tenantId || '')

  const expenseExcelColumns = [
    { key: 'expenseCode', title: '报价费用编码', required: true },
    { key: 'expenseName', title: '报价费用名称', required: true },
    { key: 'enabled', title: '状态' },
    { key: 'remark', title: '备注' },
    { key: 'sortOrder', title: '排序' },
    { key: 'textColor', title: '文字颜色' },
    { key: 'tagStyle', title: '标签样式' }
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
      label: '费用名称',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入名称或编码' }
    },
    {
      label: '状态',
      key: 'enabled',
      type: 'select',
      props: {
        clearable: true,
        options: [
          { label: '启用', value: true },
          { label: '禁用', value: false }
        ]
      }
    }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: 'ScmQuoteExpense:Add',
      type: 'add',
      label: '新增报价费用',
      onClick: () => openDialog()
    },
    {
      permission: 'ScmQuoteExpense:Import',
      type: 'import',
      label: importTenantId.value ? '导入' : '请先选择所属租户',
      disabled: !importTenantId.value,
      importColumns: expenseExcelColumns,
      importApi: importExpenses,
      onImportError: handleImportError
    },
    {
      permission: 'ScmQuoteExpense:Export',
      type: 'export',
      exportFilename: '报价费用定义',
      exportSheetName: '报价费用',
      exportColumns: expenseExcelColumns,
      exportData: exportExpenses
    }
  ])

  const moreActions: ButtonMoreItem[] = [
    {
      auth: 'ScmQuoteExpense:Delete',
      key: 'delete',
      label: '删除',
      icon: 'ri:delete-bin-line',
      color: 'var(--el-color-danger)'
    }
  ]

  const columnsFactory = (): ColumnOption<ScmQuoteExpense>[] => [
    {
      prop: 'expenseName',
      label: '报价费用',
      minWidth: 230,
      fixed: 'left',
      formatter: (row) => (
        <div class="min-w-0 leading-5">
          <strong
            class="block truncate font-medium text-[var(--art-gray-900)]"
            title={row.expenseName}
          >
            {row.expenseName}
          </strong>
          <small class="block truncate text-[var(--art-gray-600)]" title={row.expenseCode}>
            {row.expenseCode}
          </small>
        </div>
      )
    },
    ...(isPlatformSuper.value
      ? [
          {
            prop: 'tenantId',
            label: '所属租户',
            minWidth: 180,
            formatter: (row: ScmQuoteExpense) => row.tenant?.tenantName || '--'
          } satisfies ColumnOption<ScmQuoteExpense>
        ]
      : []),
    {
      prop: 'enabled',
      label: '状态',
      width: 105,
      dict: { code: 'commonBoolean', display: 'tag', value: (row) => String(row.enabled) }
    },
    { prop: 'sortOrder', label: '排序', width: 82, align: 'center' },
    {
      prop: 'tagStyle',
      label: '标签预览',
      width: 135,
      formatter: (row) => (
        <ElTag
          effect={row.tagStyle}
          style={{ color: row.textColor || undefined } satisfies CSSProperties}
          round
        >
          {row.expenseName}
        </ElTag>
      )
    },
    { prop: 'remark', label: '备注', minWidth: 220, showOverflowTooltip: true },
    {
      prop: 'operation',
      label: '操作',
      width: 164,
      fixed: 'right',
      formatter: (row) => (
        <>
          <ArtButtonTable
            type="view"
            permission="ScmQuoteExpense:View"
            onClick={() => void detailDrawerRef.value?.handleOpen(row)}
          />
          <ArtButtonTable
            type="edit"
            permission="ScmQuoteExpense:Edit"
            onClick={() => openDialog(row)}
          />
          <ArtButtonMore
            list={moreActions}
            onClick={(item: ButtonMoreItem) => {
              if (item.key === 'delete') void handleDelete(row)
            }}
          />
        </>
      )
    }
  ]

  function openDialog(record?: ScmQuoteExpense): void {
    void dialogRef.value?.handleOpen({
      record,
      tenantOptions: tenantOptions.value,
      effectiveTenantId: effectiveTenantId.value
    })
  }

  async function handleDelete(row: ScmQuoteExpense): Promise<void> {
    try {
      await confirmAction(
        `确定删除“${row.expenseName}”吗？已被报价单引用的费用无法删除。`,
        '删除报价费用',
        {
          type: 'warning',
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger'
        }
      )
      await deleteQuoteExpense(row.id)
      await tableRef.value?.refreshRemove()
    } catch {
      // 取消操作和 API 已提示的约束错误无需重复弹出消息。
    }
  }

  function handleSaved(mode: 'add' | 'edit'): void {
    void (mode === 'add' ? tableRef.value?.refreshCreate() : tableRef.value?.refreshUpdate())
  }

  async function importExpenses(rows: Array<Record<string, unknown>>): Promise<void> {
    const tenantId = importTenantId.value
    if (!tenantId) throw new Error('请先选择所属租户')
    if (!rows.length) throw new Error('导入文件没有可用数据')
    const inputs: QuoteExpenseWrite[] = rows.map((row, index) => {
      const prefix = `第 ${index + 2} 行`
      const expenseCode = String(row.expenseCode ?? '').trim()
      const expenseName = String(row.expenseName ?? '').trim()
      if (!/^[A-Za-z0-9_-]{2,40}$/.test(expenseCode)) {
        throw new Error(`${prefix}：报价费用编码须为 2–40 位字母、数字、下划线或中横线`)
      }
      if (expenseName.length < 2 || expenseName.length > 80) {
        throw new Error(`${prefix}：报价费用名称须为 2–80 个字符`)
      }
      const state = String(row.enabled ?? '启用').trim()
      if (!['启用', '禁用', 'true', 'false'].includes(state)) {
        throw new Error(`${prefix}：状态只能是启用或禁用`)
      }
      const sortOrder = Number(row.sortOrder ?? 100)
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
        throw new Error(`${prefix}：排序须为 0–9999 的整数`)
      }
      const textColor = String(row.textColor ?? '').trim()
      if (!/^(|#[0-9A-Fa-f]{6})$/.test(textColor)) {
        throw new Error(`${prefix}：文字颜色须为六位十六进制色值`)
      }
      const remark = String(row.remark ?? '').trim()
      if (remark.length > 500) throw new Error(`${prefix}：备注不能超过 500 个字符`)
      const style = String(row.tagStyle ?? '描边').trim()
      const tagStyle: ScmQuoteExpense['tagStyle'] | null =
        style === '描边' || style === 'plain'
          ? 'plain'
          : style === '浅色' || style === 'light'
            ? 'light'
            : style === '深色' || style === 'dark'
              ? 'dark'
              : null
      if (!tagStyle) throw new Error(`${prefix}：标签样式只能是描边、浅色或深色`)
      return {
        tenantId,
        expenseCode,
        expenseName,
        enabled: state === '启用' || state === 'true',
        remark,
        sortOrder,
        textColor,
        tagStyle
      }
    })
    await importQuoteExpenses(inputs)
  }

  function handleImportError(error: Error): void {
    ElMessage.warning(
      /^第 \d+ 行/.test(error.message)
        ? error.message
        : '导入失败，请检查模板、重复编码及数据归属后重试'
    )
  }

  async function exportExpenses(): Promise<Array<Record<string, unknown>>> {
    const { data } = await fetchQuoteExpenses({ ...search.value, from: 0, to: 9999 })
    return (data ?? []).map((row) => ({
      expenseCode: row.expenseCode,
      expenseName: row.expenseName,
      enabled: row.enabled ? '启用' : '禁用',
      remark: row.remark || '',
      sortOrder: row.sortOrder,
      textColor: row.textColor,
      tagStyle: { plain: '描边', light: '浅色', dark: '深色' }[row.tagStyle]
    }))
  }

  onMounted(() => void tenantScopeStore.loadTenantOptions())
  watch(effectiveTenantId, (tenantId) => {
    if (tenantId) search.value.tenantId = undefined
  })
</script>
