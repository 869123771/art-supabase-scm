<template>
  <ArtDrawer ref="drawerRef">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtEntitySummary
        icon="ri:price-tag-3-line"
        eyebrow="QUOTATION EXPENSE"
        :title="record.expenseName"
        :description="record.expenseCode"
      >
        <template #aside>
          <ElTag :effect="record.tagStyle" :style="tagStyle" round>
            {{ record.enabled ? '启用' : '禁用' }}
          </ElTag>
        </template>
      </ArtEntitySummary>
      <ArtSectionCard title="费用定义" subtitle="稳定编码和使用状态由报价单引用。">
        <ArtDescriptions :data="record" :items="definitionItems" :columns="2" />
      </ArtSectionCard>
      <ArtSectionCard title="显示与维护" subtitle="列表标签和最近一次更新信息。">
        <ArtDescriptions :data="record" :items="displayItems" :columns="2" />
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import type { CSSProperties } from 'vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { formatWithDayjs } from '@/utils/time'
  import type { ScmQuoteExpense } from '@scm/api'

  defineOptions({ name: 'ScmQuoteExpenseDetailDrawer' })

  const drawerRef = ref<ArtDrawerExpose<ScmQuoteExpense>>()
  const record = ref<ScmQuoteExpense>({
    id: '',
    tenantId: '',
    expenseCode: '',
    expenseName: '',
    enabled: true,
    remark: null,
    sortOrder: 100,
    textColor: '',
    tagStyle: 'plain',
    createdAt: '',
    updatedAt: ''
  })

  const tagStyle = computed<CSSProperties>(() => ({
    color: record.value.textColor || undefined
  }))

  const definitionItems: ArtDescriptionItem<ScmQuoteExpense>[] = [
    { key: 'expenseCode', label: '费用编码', field: 'expenseCode', copyable: true },
    { key: 'expenseName', label: '费用名称', field: 'expenseName' },
    {
      key: 'enabled',
      label: '状态',
      value: (data: ScmQuoteExpense) => (data.enabled ? '启用' : '禁用')
    },
    { key: 'sortOrder', label: '排序', field: 'sortOrder' },
    {
      key: 'tenant',
      label: '所属租户',
      value: (data: ScmQuoteExpense) => data.tenant?.tenantName ?? '--',
      span: 2
    },
    { key: 'remark', label: '备注', field: 'remark', span: 2 }
  ]
  const displayItems: ArtDescriptionItem<ScmQuoteExpense>[] = [
    { key: 'tagStyle', label: '标签样式', field: 'tagStyle' },
    {
      key: 'textColor',
      label: '文字颜色',
      value: (data: ScmQuoteExpense) => data.textColor || '跟随主题'
    },
    {
      key: 'createdAt',
      label: '创建时间',
      value: (data: ScmQuoteExpense) => formatWithDayjs(data.createdAt) || '--'
    },
    {
      key: 'updatedAt',
      label: '更新时间',
      value: (data: ScmQuoteExpense) => formatWithDayjs(data.updatedAt) || '--'
    }
  ]

  async function handleOpen(value: ScmQuoteExpense): Promise<void> {
    record.value = value
    await drawerRef.value?.handleOpen(value, {
      title: '查看报价费用',
      subtitle: '核对费用编码、状态和显示设置。',
      size: 'md',
      showFooter: false
    })
  }

  defineExpose({ handleOpen })
</script>
