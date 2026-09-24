<template>
  <ArtDrawer ref="drawerRef">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtEntitySummary
        :icon="config.icon"
        :eyebrow="config.eyebrow"
        :title="record.documentNo"
        :description="`${record.project?.projectName || '未命名项目'} · ${record.supplier?.supplierName || '未指定供应商'}`"
      >
        <template #aside
          ><div class="text-right"
            ><div class="text-xs text-[var(--art-gray-600)]">价税合计</div>
            <strong class="text-lg text-[var(--el-color-primary)]">{{
              formatCurrencyValue(record.totalAmount)
            }}</strong></div
          ></template
        >
      </ArtEntitySummary>
      <ArtSectionCard title="单据信息" subtitle="单据归属、日期与当前状态。">
        <ArtDescriptions :data="record" :items="headerItems" :columns="2" />
      </ArtSectionCard>
      <ArtSectionCard v-if="config.fields.length" title="业务信息">
        <ArtDescriptions :data="record" :items="detailItems" :columns="2" />
      </ArtSectionCard>
      <ArtSectionCard title="物料明细" :empty="!record.lines.length" empty-title="暂无明细">
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
                  >{{ line.lineNo ?? index + 1 }}</span
                >
                <div class="min-w-0">
                  <div class="break-words text-sm font-semibold text-[var(--art-gray-900)]">{{
                    line.materialDescription || '未命名物料'
                  }}</div>
                  <div class="mt-1 break-words text-xs text-[var(--art-gray-600)]"
                    >{{ line.materialCode || '无物料编码'
                    }}<span v-if="line.specification"> · {{ line.specification }}</span></div
                  >
                  <div
                    v-if="line.sourceDocumentNo"
                    class="mt-1 break-words text-xs text-[var(--art-gray-600)]"
                    >来源 {{ line.sourceDocumentNo }}</div
                  >
                  <div v-if="line.sourceLineNo" class="mt-1 text-xs text-[var(--art-gray-600)]">
                    源单据行号 {{ line.sourceLineNo }}
                  </div>
                  <div
                    v-if="record.kind === 'purchase_contract' && line.baseUnit"
                    class="mt-1 text-xs text-[var(--art-gray-600)]"
                  >
                    基本单位 {{ line.baseUnit }}
                  </div>
                  <div
                    v-if="
                      record.kind === 'purchase_request' &&
                      (line.reason || line.suggestedSupplierId)
                    "
                    class="mt-1 text-xs text-[var(--art-gray-600)]"
                  >
                    <span v-if="line.reason">需求原因 {{ line.reason }}</span>
                    <span v-if="line.suggestedSupplierId">
                      · 建议供应商
                      {{
                        suggestedSuppliers.get(line.suggestedSupplierId) || line.suggestedSupplierId
                      }}</span
                    >
                  </div>
                  <div v-if="line.gift" class="mt-1 text-xs text-[var(--el-color-success)]"
                    >赠品 · 金额为 0</div
                  >
                  <div
                    v-if="record.kind === 'purchase_request'"
                    class="mt-1 text-xs text-[var(--art-gray-600)]"
                  >
                    已采购 {{ line.purchasedQuantity ?? 0 }} · 未采购
                    {{ line.remainingQuantity ?? line.quantity }}
                  </div>
                  <div
                    v-if="record.kind === 'purchase_order'"
                    class="mt-1 text-xs text-[var(--art-gray-600)]"
                  >
                    已收料 {{ line.receivedQuantity ?? 0 }} · 待收料
                    {{ line.remainingQuantity ?? line.quantity }}
                  </div>
                  <div
                    v-if="line.batchNo || line.serialNumbers?.length"
                    class="mt-1 break-all text-xs text-[var(--art-gray-600)]"
                  >
                    <span v-if="line.batchNo">批号 {{ line.batchNo }}</span>
                    <span v-if="line.serialNumbers?.length">
                      · 序列号 {{ line.serialNumbers.join('、') }}</span
                    >
                  </div>
                </div>
              </div>
              <div
                class="grid w-full grid-cols-3 gap-3 text-right text-sm sm:w-auto sm:min-w-[320px]"
              >
                <div
                  ><div class="text-xs text-[var(--art-gray-600)]">数量</div
                  ><div class="mt-1 font-medium tabular-nums"
                    >{{ line.quantity }} {{ line.unit }}</div
                  ></div
                >
                <div
                  ><div class="text-xs text-[var(--art-gray-600)]">单价</div
                  ><div class="mt-1 font-medium tabular-nums">{{
                    formatCurrencyValue(line.unitPrice)
                  }}</div></div
                >
                <div
                  ><div class="text-xs text-[var(--art-gray-600)]">价税合计</div
                  ><div class="mt-1 font-semibold tabular-nums text-[var(--art-gray-900)]">{{
                    formatCurrencyValue(
                      line.gift
                        ? 0
                        : line.quantity *
                            line.unitPrice *
                            (1 - line.discountRate / 100) *
                            (1 + line.taxRate / 100)
                    )
                  }}</div></div
                >
              </div>
            </div>
          </div>
        </div>
      </ArtSectionCard>
      <ArtSectionCard v-if="record.paymentPlans.length" title="付款计划">
        <div
          v-for="plan in record.paymentPlans"
          :key="plan.id"
          class="flex flex-wrap justify-between gap-3 border-b border-[var(--el-border-color-lighter)] py-2 text-sm last:border-0"
        >
          <span>{{ plan.dueDate }} · {{ plan.isAdvance ? '预付' : '应付' }}</span>
          <strong>{{ plan.ratio }}% · {{ formatCurrencyValue(plan.amount) }}</strong></div
        >
      </ArtSectionCard>
      <ArtSectionCard v-if="record.deliveryPlans.length" title="交货计划">
        <div
          v-for="plan in record.deliveryPlans"
          :key="plan.id"
          class="border-b border-[var(--el-border-color-lighter)] py-2 text-sm last:border-0"
        >
          <strong>{{ plan.plannedDate }} · 计划 {{ plan.quantity }}</strong>
          <div class="mt-1 text-[var(--art-gray-600)]">
            基本数量 {{ plan.plannedBaseQuantity ?? plan.quantity }} · 已交货
            {{ plan.deliveredQuantity }} · 未交货 {{ plan.remainingQuantity ?? plan.quantity }}
          </div>
          <div v-if="plan.recentDeliveryDate" class="mt-1 text-[var(--art-gray-600)]">
            最近交货 {{ plan.recentDeliveryDate }}
          </div>
          <div class="text-[var(--art-gray-600)]">{{ plan.location }} {{ plan.address }}</div></div
        >
      </ArtSectionCard>
      <ArtSectionCard v-if="record.clauses.length" title="合同条款">
        <div
          v-for="clause in record.clauses"
          :key="clause.id"
          class="border-b border-[var(--el-border-color-lighter)] py-2 text-sm last:border-0"
        >
          <strong>{{ clause.title }}</strong
          ><p class="mt-1 whitespace-pre-wrap text-[var(--art-gray-600)]">{{
            clause.content
          }}</p></div
        >
      </ArtSectionCard>
      <ArtSectionCard title="金额汇总"
        ><div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div
            ><span class="text-[var(--art-gray-600)]">货品金额</span
            ><strong class="block">{{ formatCurrencyValue(record.subtotal) }}</strong></div
          >
          <div
            ><span class="text-[var(--art-gray-600)]">税金</span
            ><strong class="block">{{ formatCurrencyValue(record.taxAmount) }}</strong></div
          >
          <div
            ><span class="text-[var(--art-gray-600)]">价税合计</span
            ><strong class="block text-[var(--el-color-primary)]">{{
              formatCurrencyValue(record.totalAmount)
            }}</strong></div
          >
        </div></ArtSectionCard
      >
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
  import {
    fetchScmMaterialOptions,
    fetchScmPurchaseDocument,
    fetchScmSupplierOptions,
    type ScmPurchaseDocument
  } from '@scm/api'
  import { purchaseConfigs } from '../purchase-config'

  defineOptions({ name: 'ScmPurchaseDetailDrawer' })
  const drawerRef = ref<ArtDrawerExpose<ScmPurchaseDocument>>()
  const record = ref<ScmPurchaseDocument>({
    id: '',
    tenantId: '',
    kind: 'purchase_contract',
    documentNo: '',
    documentTypeId: null,
    projectId: null,
    supplierId: null,
    sourceId: null,
    status: 'draft',
    documentDate: '',
    deliveryDate: null,
    details: {},
    lines: [],
    paymentPlans: [],
    deliveryPlans: [],
    clauses: [],
    subtotal: 0,
    taxAmount: 0,
    totalAmount: 0,
    remark: null,
    createdAt: '',
    updatedAt: ''
  })
  const config = computed(() => purchaseConfigs[record.value.kind])
  const suggestedSuppliers = ref(new Map<string, string>())
  const { getDictMap } = storeToRefs(useUserStore())
  const headerItems: ArtDescriptionItem<ScmPurchaseDocument>[] = [
    { key: 'documentNo', label: '单据编号', field: 'documentNo' },
    {
      key: 'status',
      label: '单据状态',
      value: (row: ScmPurchaseDocument) =>
        getDictMap.value?.scmPurchaseStatus?.find((item) => item.value === row.status)?.label ||
        row.status
    },
    {
      key: 'projectName',
      label: '项目名称',
      value: (row: ScmPurchaseDocument) => row.project?.projectName || '--'
    },
    {
      key: 'projectCode',
      label: '项目编码',
      value: (row: ScmPurchaseDocument) => row.project?.projectCode || '--'
    },
    {
      key: 'supplierName',
      label: '供应商全称',
      value: (row: ScmPurchaseDocument) => row.supplier?.supplierName || '--'
    },
    {
      key: 'sourceNo',
      label: '来源单据',
      value: (row: ScmPurchaseDocument) => row.source?.documentNo || '--'
    },
    { key: 'documentDate', label: '单据日期', field: 'documentDate' },
    {
      key: 'deliveryDate',
      label: '交货日期',
      value: (row: ScmPurchaseDocument) => row.deliveryDate || '--'
    },
    {
      key: 'remark',
      label: '备注',
      value: (row: ScmPurchaseDocument) => row.remark || '--',
      span: 2
    }
  ]
  const detailItems = computed<ArtDescriptionItem<ScmPurchaseDocument>[]>(() =>
    config.value.fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: (row: ScmPurchaseDocument) => {
        const value = row.details[field.key]
        if (field.key === 'contractStatus')
          return (
            getDictMap.value?.scmPurchaseContractStatus?.find((item) => item.value === value)
              ?.label || String(value || '--')
          )
        if (field.key === 'effectiveness')
          return (
            getDictMap.value?.scmContractEffectiveness?.find((item) => item.value === value)
              ?.label || String(value || '--')
          )
        return String(row.details[`${field.key}Name` as keyof typeof row.details] ?? value ?? '--')
      },
      span: field.span === 24 ? 2 : 1
    }))
  )
  async function handleOpen(value: ScmPurchaseDocument) {
    record.value = value
    await drawerRef.value?.handleOpen(value, {
      title: `查看${config.value.title}`,
      subtitle: '核对单据、明细及金额。',
      size: 'xl',
      contentHeight: 'calc(100vh - 126px)',
      scrollbarAlways: true,
      showFooter: false
    })
    const [documentResult, materialResult, supplierResult] = await Promise.all([
      fetchScmPurchaseDocument(value.id),
      fetchScmMaterialOptions(
        value.tenantId,
        value.lines.map((line) => line.materialId)
      ),
      fetchScmSupplierOptions(value.tenantId)
    ])
    suggestedSuppliers.value = new Map(
      (supplierResult.data ?? []).map((supplier) => [supplier.id, supplier.supplierName])
    )
    const data = documentResult.data
    if (data) {
      const materials = new Map(
        (materialResult.data ?? []).map((material) => [material.id, material])
      )
      record.value = {
        ...data,
        lines: data.lines.map((line) => {
          const material = materials.get(line.materialId)
          if (!material || (data.kind !== 'purchase_request' && data.kind !== 'purchase_contract'))
            return line
          return {
            ...line,
            unit: line.unit === material.unit ? material.baseUnitName || line.unit : line.unit,
            baseUnit:
              data.kind === 'purchase_contract' &&
              (!line.baseUnit || line.baseUnit === material.unit)
                ? material.baseUnitName || line.baseUnit
                : line.baseUnit
          }
        })
      }
    }
  }
  defineExpose({ handleOpen })
</script>
