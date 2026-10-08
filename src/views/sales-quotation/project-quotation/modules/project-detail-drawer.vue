<template>
  <ArtDrawer :loading="loading" ref="drawerRef" size="xl" @close="closeDetail">
    <div class="art-page-view flex min-w-0 flex-col gap-4">
      <ArtEntitySummary
        icon="ri:briefcase-4-line"
        eyebrow="PROJECT QUOTATION"
        :title="selected?.projectName"
        :description="`${selected?.projectCode || ''} · ${selected?.customerName || '未关联客户'}`"
      >
        <template #aside
          ><ElTag>{{ selected?.quotationCount || 0 }} 次审批报价</ElTag></template
        >
      </ArtEntitySummary>
      <ElTabs v-model="activeTab" class="min-w-0" aria-label="项目业务资料">
        <ElTabPane label="项目详细资料" name="profile" />
        <ElTabPane v-for="tab in tabs" :key="tab.key" :label="tab.label" :name="tab.key" />
      </ElTabs>
      <ArtSectionCard
        v-if="activeTab === 'profile'"
        title="项目详细资料"
        subtitle="项目主数据与审批报价关联资料。"
        :error="loadError"
        :empty="missing"
        empty-title="暂无项目资料"
        empty-description="请返回项目报价列表刷新后重新选择；如需补充资料，请到项目管理维护。"
        error-title="项目资料加载失败"
        @retry="retryLoad"
      >
        <ArtDescriptions v-if="profile" :data="profile" :items="profileItems" :columns="2" />
      </ArtSectionCard>
      <ArtEmptyState
        v-else-if="!canReadTab"
        title="暂无此页签的查看权限"
        description="请联系管理员分配对应业务的查看权限后重试。"
      />
      <ArtTableQuery
        v-else-if="selected"
        :key="`${selected.id}:${activeTab}`"
        v-model="tabSearch"
        :api-fn="fetchRows"
        :columns-factory="columnsFactory"
        :search-items="tabSearchItems"
        :search-bar-props="{ span: 12, labelWidth: 70, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: `暂无${activeLabel}`,
          emptyDescription: emptyDescription
        }"
      />
    </div>
  </ArtDrawer>
</template>

<script setup lang="tsx">
  import { computed, ref, watch } from 'vue'
  import { ElTabPane, ElTabs, ElTag } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    formatCompactNumberValue,
    formatSensitiveCurrencyValue,
    formatDateTimeValue
  } from '@/utils/ui/format'
  import type { ColumnOption } from '@/types'
  import {
    fetchProjectQuotationProfile,
    fetchProjectQuotationTab,
    type ProjectQuotationSummary,
    type ProjectQuotationProfile,
    type ProjectQuotationTab,
    type ProjectQuotationRow,
    type ProjectQuotationQuery
  } from '@scm/api'

  defineOptions({ name: 'ScmProjectQuotationDetail' })
  const drawerRef = ref<ArtDrawerExpose<ProjectQuotationSummary>>()
  const selected = ref<ProjectQuotationSummary>()
  const activeTab = ref<'profile' | ProjectQuotationTab>('profile')
  const tabSearch = ref({ keyword: '' })
  watch(activeTab, () => {
    tabSearch.value = { keyword: '' }
  })
  const { hasAuth } = useAuth()
  const tabs: Array<{ key: ProjectQuotationTab; label: string; permission: string }> = [
    { key: 'categories', label: '报价项分类', permission: 'ScmQuoteCategory:View' },
    { key: 'quotation_lines', label: '报价明细', permission: 'ScmSalesQuotationDoc:View' },
    { key: 'contracts', label: '销售合同', permission: 'ScmSalesContract:View' },
    { key: 'purchase_requests', label: '采购申请', permission: 'ScmPurchaseRequest:View' },
    { key: 'purchase_orders', label: '采购订单', permission: 'ScmPurchaseOrder:View' },
    { key: 'stock', label: '实时库存', permission: 'WmsStock:View' },
    { key: 'movements', label: '库存流水', permission: 'WmsInventoryLedger:View' }
  ]
  const activeConfig = computed(() => tabs.find((tab) => tab.key === activeTab.value))
  const activeLabel = computed(() => activeConfig.value?.label || '项目资料')
  const canReadTab = computed(() => !!activeConfig.value && hasAuth(activeConfig.value.permission))
  const emptyDescription = computed(() =>
    activeTab.value === 'purchase_requests'
      ? '此项目尚无已保存的采购申请。'
      : activeTab.value === 'purchase_orders'
        ? '此项目尚无已提交的采购订单明细。'
        : activeTab.value === 'stock'
          ? '此项目当前没有库存结存。'
          : '此项目暂无相关业务记录。'
  )
  const {
    detail: profile,
    loading,
    missing,
    loadError,
    loadDetail,
    openDetail,
    retryLoad
  } = useDetailRecord<ProjectQuotationProfile>(
    async (id) => ({ data: await fetchProjectQuotationProfile(id) }),
    '项目资料加载失败，请重试'
  )
  const profileItems: ArtDescriptionItem<ProjectQuotationProfile>[] = [
    { key: 'projectCode', label: '项目编码', copyable: true },
    { key: 'projectName', label: '项目名称' },
    { key: 'customerName', label: '客户' },
    { key: 'projectStatus', label: '项目状态', dictCode: 'mdmProjectStatus' },
    { key: 'ownerName', label: '负责人' },
    { key: 'salespersonName', label: '销售员' },
    { key: 'contactName', label: '联系人' },
    { key: 'contactPhone', label: '联系电话' },
    { key: 'quotationCount', label: '审批报价次数' },
    { key: 'latestQuotationNo', label: '最近报价单号' },
    { key: 'latestQuotationDate', label: '最近报价日期', format: 'date' as const },
    { key: 'projectStage', label: '项目阶段', dictCode: 'mdmProjectStage' },
    { key: 'addressDetail', label: '项目地址', span: 2 },
    { key: 'remark', label: '备注', span: 2 }
  ].map((item) => ({ ...item, field: item.key }))
  const tabSearchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '查询',
      type: 'input',
      props: { placeholder: '单号、分类、物料或仓库', clearable: true }
    }
  ]
  async function fetchRows(query: ProjectQuotationQuery) {
    if (!selected.value || activeTab.value === 'profile') return { data: [], total: 0, error: null }
    return fetchProjectQuotationTab(selected.value.id, activeTab.value, query)
  }
  function columnsFactory(): ColumnOption<ProjectQuotationRow>[] {
    const tab = activeTab.value
    const columns: ColumnOption<ProjectQuotationRow>[] = []
    if (tab !== 'stock')
      columns.push({
        prop: 'documentNo',
        label: tab === 'movements' ? '来源单号' : '单据编号',
        minWidth: 180,
        showOverflowTooltip: true
      })
    if (tab !== 'stock' && tab !== 'movements')
      columns.push({
        prop: 'documentDate',
        label: '单据日期',
        width: 118,
        formatter: (row) => formatDateTimeValue(row.documentDate, { format: 'YYYY-MM-DD' })
      })
    if (tab === 'categories' || tab === 'quotation_lines')
      columns.push({
        prop: 'categoryName',
        label: '报价产品分类',
        minWidth: 160,
        showOverflowTooltip: true
      })
    if (tab === 'quotation_lines' || tab === 'purchase_requests' || tab === 'purchase_orders')
      columns.push({ prop: 'lineNo', label: '行号', width: 72 })
    if (tab !== 'categories')
      columns.push({
        prop: 'materialDescription',
        label: tab === 'contracts' ? '合同名称' : '物料描述',
        minWidth: 220,
        showOverflowTooltip: true
      })
    if (tab !== 'categories' && tab !== 'contracts')
      columns.push(
        { prop: 'materialCode', label: '物料编码', minWidth: 150, showOverflowTooltip: true },
        { prop: 'specification', label: '规格型号', minWidth: 145, showOverflowTooltip: true },
        { prop: 'brand', label: '品牌', minWidth: 110 }
      )
    if (tab !== 'contracts')
      columns.push({
        prop: 'quantity',
        label: tab === 'stock' ? '结存数量' : '数量',
        width: 115,
        align: 'right',
        formatter: (row) => formatCompactNumberValue(row.quantity, 3)
      })
    if (tab !== 'categories' && tab !== 'contracts')
      columns.push({ prop: 'unit', label: '单位', width: 85 })
    if (tab !== 'contracts')
      columns.push({
        prop: 'unitPrice',
        label: '单价',
        width: 125,
        align: 'right',
        formatter: (row) => formatSensitiveCurrencyValue(row.unitPrice, row.currency || 'CNY')
      })
    if (tab === 'categories')
      columns.push({
        prop: 'feeTotal',
        label: '附加费用',
        width: 125,
        align: 'right',
        formatter: (row) => formatSensitiveCurrencyValue(row.feeTotal, row.currency || 'CNY')
      })
    columns.push({
      prop: 'amount',
      label: tab === 'categories' ? '报价总价' : '金额',
      width: 145,
      align: 'right',
      formatter: (row) => formatSensitiveCurrencyValue(row.amount, row.currency || 'CNY')
    })
    if (tab === 'categories' || tab === 'quotation_lines' || tab === 'contracts')
      columns.push({ prop: 'currency', label: '币种', width: 85 })
    if (tab === 'purchase_orders')
      columns.push({
        prop: 'supplierName',
        label: '供应商',
        minWidth: 180,
        showOverflowTooltip: true
      })
    if (tab === 'stock')
      columns.push(
        { prop: 'warehouseName', label: '仓库', minWidth: 150 },
        { prop: 'binName', label: '库位', minWidth: 125 }
      )
    if (tab === 'movements')
      columns.push(
        {
          prop: 'occurredAt',
          label: '发生时间',
          minWidth: 180,
          formatter: (row) => formatDateTimeValue(row.occurredAt, { format: 'YYYY-MM-DD HH:mm' })
        },
        { prop: 'sourceWarehouseName', label: '发出仓库', minWidth: 150 },
        { prop: 'targetWarehouseName', label: '接收仓库', minWidth: 150 }
      )
    if (tab === 'stock' || tab === 'movements')
      columns.push(
        { prop: 'batchNo', label: '批次', minWidth: 150 },
        { prop: 'constructionNo', label: '施工号', minWidth: 135 }
      )
    if (
      tab === 'quotation_lines' ||
      tab === 'contracts' ||
      tab === 'purchase_requests' ||
      tab === 'purchase_orders'
    )
      columns.push({
        prop: 'status',
        label: '状态',
        width: 105,
        dict: {
          code: tab.startsWith('purchase') ? 'scmPurchaseStatus' : 'scmDocumentStatus',
          display: 'auto'
        }
      })
    columns.push({ prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true })
    return columns
  }
  function closeDetail() {
    openDetail('')
    selected.value = undefined
  }
  async function handleOpen(project: ProjectQuotationSummary) {
    selected.value = project
    activeTab.value = 'profile'
    tabSearch.value = { keyword: '' }
    openDetail(project.id)
    await drawerRef.value?.handleOpen(project, {
      title: '项目报价详情',
      subtitle: '按项目查看审批报价与后续业务记录。',
      showFooter: false,
      onOpen: () => loadDetail(project.id)
    })
  }
  defineExpose({ handleOpen })
</script>
