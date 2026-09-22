<template>
  <ArtDrawer ref="drawerRef">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtEntitySummary
        icon="ri:price-tag-2-line"
        eyebrow="QUOTATION ITEM"
        :title="record.categoryName"
        :description="`${record.project?.projectName || '项目'} · ${record.project?.projectCode || '--'}`"
      >
        <template #aside>
          <strong class="text-lg text-[var(--el-color-primary)]">{{
            formatCurrencyValue(record.totalAmount)
          }}</strong>
        </template>
      </ArtEntitySummary>

      <ArtSectionCard title="项目与报价" subtitle="价格与数量由报价项维护，总价由系统核算。">
        <ArtDescriptions :data="record" :items="descriptionItems" :columns="2" />
      </ArtSectionCard>

      <ArtSectionCard
        title="附加费用"
        subtitle="引用报价费用定义中的项目。"
        :loading="feeLoading"
        :error="feeError"
        :empty="!record.feeItems.length"
        empty-title="暂无附加费用"
        empty-description="此报价项仅按数量与单价计价。"
        @retry="loadExpenses"
      >
        <div class="flex flex-col divide-y divide-[var(--el-border-color-lighter)]">
          <div
            v-for="fee in record.feeItems"
            :key="fee.expenseId"
            class="flex min-w-0 items-center justify-between gap-4 py-2 text-sm"
          >
            <span class="min-w-0 truncate" :title="expenseName(fee.expenseId)">{{
              expenseName(fee.expenseId)
            }}</span>
            <strong class="shrink-0 font-medium">{{ formatCurrencyValue(fee.amount) }}</strong>
          </div>
          <div class="flex items-center justify-between gap-4 pt-3 text-sm font-semibold">
            <span>费用合计</span>
            <span>{{ formatCurrencyValue(record.feeTotal) }}</span>
          </div>
        </div>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { formatCompactNumberValue, formatCurrencyValue } from '@/utils/ui/format'
  import { fetchQuoteExpenses, type ScmQuoteCategory, type ScmQuoteExpense } from '@scm/api'

  defineOptions({ name: 'ScmQuoteCategoryDetailDrawer' })

  const drawerRef = ref<ArtDrawerExpose<ScmQuoteCategory>>()
  const record = ref<ScmQuoteCategory>({
    id: '',
    tenantId: '',
    projectId: '',
    categoryName: '',
    quantity: 1,
    unitPrice: 0,
    feeItems: [],
    feeTotal: 0,
    totalAmount: 0,
    remark: null,
    createdAt: '',
    updatedAt: ''
  })
  const expenses = ref<ScmQuoteExpense[]>([])
  const feeLoading = ref(false)
  const feeError = ref<string | null>(null)

  const descriptionItems: ArtDescriptionItem<ScmQuoteCategory>[] = [
    {
      key: 'projectName',
      label: '项目名称',
      value: (data: ScmQuoteCategory) => data.project?.projectName || '--'
    },
    {
      key: 'projectCode',
      label: '项目编码',
      value: (data: ScmQuoteCategory) => data.project?.projectCode || '--'
    },
    { key: 'categoryName', label: '报价项分类', field: 'categoryName', span: 2 },
    {
      key: 'quantity',
      label: '报价数量',
      value: (data: ScmQuoteCategory) => formatCompactNumberValue(data.quantity, 3)
    },
    {
      key: 'unitPrice',
      label: '单价',
      value: (data: ScmQuoteCategory) => formatCurrencyValue(data.unitPrice)
    },
    {
      key: 'feeTotal',
      label: '费用合计',
      value: (data: ScmQuoteCategory) => formatCurrencyValue(data.feeTotal)
    },
    {
      key: 'totalAmount',
      label: '报价总价',
      value: (data: ScmQuoteCategory) => formatCurrencyValue(data.totalAmount)
    },
    { key: 'remark', label: '备注', field: 'remark', span: 2 }
  ]

  function expenseName(id: string): string {
    const expense = expenses.value.find((item) => item.id === id)
    return expense ? `${expense.expenseName}（${expense.expenseCode}）` : '费用定义已变更'
  }

  async function loadExpenses(): Promise<void> {
    if (!record.value.feeItems.length) return
    feeLoading.value = true
    feeError.value = null
    try {
      const response = await fetchQuoteExpenses({ tenantId: record.value.tenantId })
      if (response.error) throw response.error
      expenses.value = response.data ?? []
    } catch {
      feeError.value = '费用名称加载失败，请重试。'
    } finally {
      feeLoading.value = false
    }
  }

  async function handleOpen(value: ScmQuoteCategory): Promise<void> {
    record.value = value
    expenses.value = []
    await drawerRef.value?.handleOpen(value, {
      title: '查看报价项分类',
      subtitle: '核对项目、计价与附加费用。',
      size: 'lg',
      showFooter: false
    })
    void loadExpenses()
  }

  defineExpose({ handleOpen })
</script>
