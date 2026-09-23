<template>
  <ArtDrawer ref="drawerRef">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtEntitySummary
        :icon="config.icon"
        :eyebrow="config.eyebrow"
        :title="record.documentNo"
        :description="`${record.project?.projectName || '未命名项目'} · ${record.customer?.customerName || '未命名客户'}`"
      >
        <template #aside>
          <div class="text-right">
            <div class="text-xs text-[var(--art-gray-600)]">单据总价</div>
            <strong class="text-lg text-[var(--el-color-primary)]">{{
              formatCurrencyValue(record.totalAmount)
            }}</strong>
          </div>
        </template>
      </ArtEntitySummary>

      <ArtSectionCard title="单据信息" subtitle="项目、客户与状态均以当前单据为准。">
        <ArtDescriptions :data="record" :items="headerItems" :columns="2" />
      </ArtSectionCard>

      <ArtSectionCard v-if="config.fields.length" title="业务信息">
        <ArtDescriptions :data="record" :items="detailItems" :columns="2" />
      </ArtSectionCard>

      <ArtSectionCard
        :title="
          record.kind === 'sales_order'
            ? '订单明细'
            : record.kind === 'sales_contract'
              ? '合同明细'
              : '物料明细'
        "
        :empty="!record.lines.length"
        empty-title="暂无明细"
      >
        <div class="divide-y divide-[var(--el-border-color-lighter)]">
          <div
            v-for="(line, index) in record.lines"
            :key="line.lineId"
            class="py-4 first:pt-0 last:pb-0"
          >
            <div class="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-2">
              <div class="flex min-w-0 flex-1 items-start gap-3">
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--el-color-primary-light-9)] text-xs font-semibold text-[var(--el-color-primary)]"
                  >{{ index + 1 }}</span
                >
                <div class="min-w-0">
                  <div class="break-words text-sm font-semibold text-[var(--art-gray-900)]">{{
                    line.materialDescription || '未命名物料'
                  }}</div>
                  <div class="mt-1 break-words text-xs text-[var(--art-gray-600)]"
                    >{{ line.materialCode || '无物料编码'
                    }}<span v-if="line.specification"> · {{ line.specification }}</span></div
                  >
                </div>
              </div>
              <div
                class="grid w-full grid-cols-3 gap-3 text-right text-sm sm:w-auto sm:min-w-[320px]"
              >
                <div
                  ><div class="text-xs text-[var(--art-gray-600)]">数量</div
                  ><div class="mt-1 font-medium tabular-nums"
                    >{{ line.quantity }} {{ line.salesUnit }}</div
                  ></div
                >
                <div
                  ><div class="text-xs text-[var(--art-gray-600)]">单价</div
                  ><div class="mt-1 font-medium tabular-nums">{{
                    formatCurrencyValue(line.unitPrice)
                  }}</div></div
                >
                <div
                  ><div class="text-xs text-[var(--art-gray-600)]">金额</div
                  ><div class="mt-1 font-semibold tabular-nums text-[var(--art-gray-900)]">{{
                    formatCurrencyValue(
                      record.kind === 'sales_order' || record.kind === 'sales_contract'
                        ? calculateContractLine(line).amount
                        : line.quantity * line.unitPrice * (1 - (line.discountRate || 0) / 100)
                    )
                  }}</div></div
                >
              </div>
            </div>
          </div>
        </div>
      </ArtSectionCard>

      <ArtSectionCard v-if="record.fees.length" title="费用明细">
        <div
          v-for="fee in record.fees"
          :key="fee.expenseId"
          class="flex justify-between gap-3 border-b border-[var(--el-border-color-lighter)] py-2 text-sm last:border-0"
        >
          <span>{{ feeNames.get(fee.expenseId) || fee.expenseId }}</span
          ><strong>{{ formatCurrencyValue(fee.amount) }}</strong>
        </div>
      </ArtSectionCard>

      <ArtSectionCard v-if="record.paymentPlans.length" title="收款计划">
        <div
          v-for="plan in record.paymentPlans"
          :key="plan.id"
          class="flex flex-wrap justify-between gap-3 border-b border-[var(--el-border-color-lighter)] py-2 text-sm last:border-0"
        >
          <span>{{ plan.dueDate }} · {{ plan.isAdvance ? '预收' : '应收' }}</span
          ><strong>{{ plan.ratio }}% · {{ formatCurrencyValue(plan.amount) }}</strong>
        </div>
      </ArtSectionCard>

      <ArtSectionCard v-if="record.deliveryPlans.length" title="发货计划">
        <div
          v-for="plan in record.deliveryPlans"
          :key="plan.id"
          class="border-b border-[var(--el-border-color-lighter)] py-2 text-sm last:border-0"
        >
          <strong>{{ plan.plannedDate }} · {{ plan.quantity }}</strong
          ><div class="text-[var(--art-gray-600)]">{{ plan.location }} {{ plan.address }}</div>
        </div>
      </ArtSectionCard>

      <ArtSectionCard v-if="record.clauses.length" title="合同条款">
        <div
          v-for="clause in record.clauses"
          :key="clause.id"
          class="border-b border-[var(--el-border-color-lighter)] py-2 text-sm last:border-0"
        >
          <strong>{{ clauseLabel(clause.title) }}</strong
          ><p class="mt-1 whitespace-pre-wrap text-[var(--art-gray-600)]">{{ clause.content }}</p>
        </div>
      </ArtSectionCard>

      <ArtSectionCard title="金额汇总">
        <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div
            ><span class="text-[var(--art-gray-600)]">货品金额</span
            ><strong class="block">{{ formatCurrencyValue(record.subtotal) }}</strong></div
          >
          <div
            ><span class="text-[var(--art-gray-600)]">费用合计</span
            ><strong class="block">{{ formatCurrencyValue(record.feeTotal) }}</strong></div
          >
          <div
            ><span class="text-[var(--art-gray-600)]">税金</span
            ><strong class="block">{{ formatCurrencyValue(record.taxAmount) }}</strong></div
          >
          <div
            ><span class="text-[var(--art-gray-600)]">成本</span
            ><strong class="block">{{ formatCurrencyValue(record.costTotal) }}</strong></div
          >
          <div
            ><span class="text-[var(--art-gray-600)]">毛利</span
            ><strong class="block">{{ formatCurrencyValue(record.grossProfit) }}</strong></div
          >
          <div
            ><span class="text-[var(--art-gray-600)]">毛利率</span
            ><strong class="block">{{ record.grossMargin }}%</strong></div
          >
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
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { useUserStore } from '@/store/modules/user'
  import { storeToRefs } from 'pinia'
  import { fetchQuoteExpenses, fetchScmSalesDocument, type ScmSalesDocument } from '@scm/api'
  import { scmDocumentConfigs } from '../document-config'
  import { calculateContractLine } from '../quotation-pricing'

  defineOptions({ name: 'ScmDocumentDetailDrawer' })

  const drawerRef = ref<ArtDrawerExpose<ScmSalesDocument>>()
  const record = ref<ScmSalesDocument>({
    id: '',
    tenantId: '',
    kind: 'sales_quotation',
    documentNo: '',
    documentTypeId: null,
    projectId: null,
    customerId: null,
    sourceId: null,
    status: 'draft',
    documentDate: '',
    deliveryDate: null,
    currency: 'CNY',
    details: {},
    lines: [],
    fees: [],
    paymentPlans: [],
    deliveryPlans: [],
    clauses: [],
    subtotal: 0,
    feeTotal: 0,
    taxAmount: 0,
    costTotal: 0,
    totalAmount: 0,
    grossProfit: 0,
    grossMargin: 0,
    remark: null,
    createdAt: '',
    updatedAt: ''
  })
  const config = computed(() => scmDocumentConfigs[record.value.kind])
  const { getDictMap } = storeToRefs(useUserStore())
  const feeNames = ref(new Map<string, string>())
  const clauseLabel = (value: string): string =>
    getDictMap.value?.scmSalesContractClause?.find((item) => item.value === value)?.label || value

  const headerItems = computed<ArtDescriptionItem<ScmSalesDocument>[]>(() => [
    { key: 'documentNo', label: '单据编号', field: 'documentNo' },
    {
      key: 'status',
      label: '单据状态',
      value: (row: ScmSalesDocument) =>
        getDictMap.value?.scmDocumentStatus?.find((item) => item.value === row.status)?.label ||
        row.status
    },
    ...(record.value.kind === 'sales_contract'
      ? [
          {
            key: 'contractStatus',
            label: '合同状态',
            value: (row: ScmSalesDocument) =>
              getDictMap.value?.scmSalesContractStatus?.find(
                (item) => item.value === row.contractStatus
              )?.label ||
              row.contractStatus ||
              '--'
          }
        ]
      : []),
    ...(record.value.kind === 'sales_order'
      ? [
          {
            key: 'orderStatus',
            label: '订单状态',
            value: (row: ScmSalesDocument) =>
              getDictMap.value?.scmSalesOrderStatus?.find((item) => item.value === row.orderStatus)
                ?.label ||
              row.orderStatus ||
              '--'
          }
        ]
      : []),
    {
      key: 'projectName',
      label: '项目名称',
      value: (row: ScmSalesDocument) => row.project?.projectName || '--'
    },
    {
      key: 'customerName',
      label: '客户全称',
      value: (row: ScmSalesDocument) => row.customer?.customerName || '--'
    },
    {
      key: 'sourceNo',
      label: '来源单据',
      value: (row: ScmSalesDocument) => row.source?.documentNo || '--'
    },
    { key: 'documentDate', label: '单据日期', field: 'documentDate' },
    {
      key: 'deliveryDate',
      label: '交货日期',
      value: (row: ScmSalesDocument) => row.deliveryDate || '--'
    },
    { key: 'currency', label: '币种', field: 'currency' },
    { key: 'remark', label: '备注', value: (row: ScmSalesDocument) => row.remark || '--', span: 2 }
  ])
  const detailItems = computed<ArtDescriptionItem<ScmSalesDocument>[]>(() =>
    config.value.fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: (row: ScmSalesDocument) =>
        field.key === 'salespersonId'
          ? row.details.salesperson || '--'
          : String(row.details[field.key] ?? '--'),
      span: field.span === 24 ? 2 : 1
    }))
  )

  async function handleOpen(value: ScmSalesDocument): Promise<void> {
    record.value = value
    await drawerRef.value?.handleOpen(value, {
      title: `查看${config.value.title}`,
      subtitle: '核对单据、明细及金额。',
      size: 'xl',
      contentHeight: 'calc(100vh - 126px)',
      scrollbarAlways: true,
      showFooter: false
    })
    const [detail, expenses] = await Promise.all([
      fetchScmSalesDocument(value.id),
      value.fees.length ? fetchQuoteExpenses({ tenantId: value.tenantId }) : Promise.resolve(null)
    ])
    if (detail.data) record.value = detail.data
    feeNames.value = new Map((expenses?.data ?? []).map((item) => [item.id, item.expenseName]))
  }

  defineExpose({ handleOpen })
</script>
