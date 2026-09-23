<template>
  <ArtDialog ref="dialogRef" size="xl">
    <template #subtitle>维护单据表头与业务明细。金额会在保存时由数据库核算。</template>
    <div class="flex min-w-0 flex-col gap-4">
      <ArtSectionCard title="单据基本信息" subtitle="单据编号、项目和客户确定此单据的业务归属。">
        <ArtForm
          ref="headerFormRef"
          v-model="header"
          :items="headerItems"
          :rules="headerRules"
          :validate-on-rule-change="false"
          :span="12"
          :gutter="20"
          label-width="112px"
          :show-reset="false"
          :show-submit="false"
        >
          <template #projectId>
            <ArtTableSingleSelect
              v-model="header.projectId"
              :data="projectOptions"
              :columns="projectPickerColumns"
              row-key="id"
              :label-key="projectPickerLabel"
              title="参选项目"
              search-placeholder="搜索项目编号或名称"
              :disabled="!header.tenantId || Boolean(header.sourceId)"
              empty-text="暂无可选项目"
              empty-description="请先在 MDM 项目列表维护项目。"
              dialog-width="xl"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>

      <ArtSectionCard
        v-if="config.fields.length && kind !== 'project_quotation'"
        title="业务信息"
        subtitle="按当前单据类型填写日期、地址和执行信息。"
      >
        <ArtForm
          ref="detailsFormRef"
          v-model="details"
          :items="detailItems"
          :rules="detailRules"
          :validate-on-rule-change="false"
          :span="12"
          :gutter="20"
          label-width="112px"
          :show-reset="false"
          :show-submit="false"
        >
          <template #salespersonId>
            <ArtEmployeeSelect
              v-model="details.salespersonId"
              v-model:selected-data="selectedSalesperson"
              :tenant-id="header.tenantId"
              :api-fn="fetchScmSalespersonOptions"
              :display-fields="['organization', 'jobTitle', 'employmentStatus']"
              placeholder="从员工花名册参选销售员"
              @change="updateSalesperson"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>

      <ArtSectionCard
        v-if="kind === 'sales_quotation' && details.quotationScene === 'project'"
        title="工程报价联动"
        subtitle="本销售报价是唯一数据源；生成项目报价并提交时，按本单设置创建项目、物料与 BOM 草稿。"
      >
        <ArtForm
          v-model="details"
          :items="automationItems"
          :span="12"
          :gutter="20"
          label-width="140px"
          :show-reset="false"
          :show-submit="false"
        />
      </ArtSectionCard>

      <ArtSectionCard
        v-if="kind === 'project_quotation'"
        title="来源报价快照"
        subtitle="项目、施工号、工程子目和自动建档参数均从销售报价单带入；请在源单修改后重新生成。"
      >
        <p class="text-sm text-[var(--art-gray-700)]">
          已带入 {{ lines.length }} 行工程明细；销售报价单中设置的项目、物料与 BOM
          联动将在提交时执行。
        </p>
      </ArtSectionCard>

      <ElTabs v-if="kind !== 'project_quotation'" v-model="activeTab" class="min-w-0">
        <ElTabPane
          :label="
            kind === 'sales_contract'
              ? '合同明细'
              : kind === 'sales_order'
                ? '订单明细'
                : kind === 'shipping_notice'
                  ? '发货明细'
                  : '物料明细'
          "
          name="lines"
        >
          <ArtSectionCard
            v-if="kind === 'sales_quotation' && details.quotationScene !== 'project'"
            title="物料明细"
            subtitle="标准报价 · 填写未税或含税单价，系统同步计算金额与税额。"
          >
            <QuotationLineTable
              ref="quotationLineTableRef"
              v-model:lines="lines"
              :materials="materialOptions"
              :disabled="!header.tenantId"
              :source-options="materialSourceOptions"
              :tax-rates="taxRateOptions"
              :discount-options="discountOptions"
            />
          </ArtSectionCard>
          <ArtSectionCard
            v-if="kind === 'sales_contract'"
            title="合同明细"
            subtitle="参选报价明细或批量添加物料；合计行固定在表格底部。"
          >
            <QuotationLineTable
              ref="quotationLineTableRef"
              v-model:lines="lines"
              contract
              :quotation-documents="quotationDocuments"
              :materials="materialOptions"
              :disabled="!header.tenantId"
              :source-options="materialSourceOptions"
              :tax-rates="taxRateOptions"
              :discount-options="discountOptions"
            />
          </ArtSectionCard>
          <ArtSectionCard
            v-if="kind === 'sales_order'"
            title="订单明细"
            subtitle="从销售报价、合同参选明细，或批量添加物料；合计行固定在表格底部。"
          >
            <QuotationLineTable
              ref="quotationLineTableRef"
              v-model:lines="lines"
              order
              :quotation-documents="quotationDocuments"
              :contract-documents="contractDocuments"
              :project-id="header.projectId"
              :customer-id="header.customerId"
              :materials="materialOptions"
              :disabled="!header.tenantId"
              :source-options="materialSourceOptions"
              :tax-rates="taxRateOptions"
              :discount-options="discountOptions"
              @source-selected="applySelectedLineSource"
            />
          </ArtSectionCard>
          <ArtSectionCard
            v-if="
              (kind !== 'sales_quotation' && kind !== 'sales_contract' && kind !== 'sales_order') ||
              (kind === 'sales_quotation' && details.quotationScene === 'project')
            "
            :title="kind === 'shipping_notice' ? '发货明细' : '物料明细'"
            :subtitle="
              kind === 'shipping_notice'
                ? header.sourceId
                  ? '已关联销售订单；可继续选取该订单的剩余明细。'
                  : '选单或直接添加物料；辅助数量按物料单位换算。'
                : '按单据维护物料、数量、价格、税率与成本；展开行可填写补充信息。'
            "
          >
            <QuotationLineTable
              ref="quotationLineTableRef"
              v-model:lines="lines"
              :engineering="kind === 'sales_quotation' && details.quotationScene === 'project'"
              :operational="kind === 'shipping_notice' || kind === 'loading'"
              :shipping="kind === 'shipping_notice'"
              :manual-disabled="
                config.sourceRequired || (kind === 'shipping_notice' && Boolean(header.sourceId))
              "
              :materials="materialOptions"
              :disabled="!header.tenantId"
              :source-options="materialSourceOptions"
              :tax-rates="taxRateOptions"
              :discount-options="discountOptions"
              @select-order="openShippingOrderPicker"
            />
          </ArtSectionCard>
        </ElTabPane>

        <ElTabPane v-if="config.useFees" label="费用明细" name="fees">
          <ArtSectionCard
            title="费用明细"
            subtitle="费用定义来自当前租户的报价费用清单。"
            :empty="!fees.length"
            empty-title="暂无费用明细"
            empty-description="可从当前租户的报价费用清单添加。"
          >
            <template #actions>
              <ElButton type="primary" plain :disabled="!expenseOptions.length" @click="addFee">
                <ArtSvgIcon icon="ri:add-line" />
                添加费用
              </ElButton>
            </template>
            <ArtTable
              ref="feeTableRef"
              :data="fees"
              :columns="feeColumns"
              :pagination="false"
              row-key="expenseId"
              table-layout="fixed"
              border
              show-summary
              :summary-method="feeSummaryMethod"
              class="scm-quotation-summary-table"
              empty-text="暂无费用明细"
              empty-description="从当前租户的报价费用清单添加。"
            />
          </ArtSectionCard>
        </ElTabPane>

        <ElTabPane v-if="config.usePaymentPlans" label="收款计划" name="payments">
          <ArtSectionCard
            title="收款计划"
            subtitle="选择按比例或按金额记录每期应收。"
            :empty="!paymentPlans.length"
            empty-title="暂无收款计划"
            empty-description="添加计划后可记录每期应收。"
          >
            <template #actions>
              <ElButton type="primary" plain @click="addPaymentPlan">
                <ArtSvgIcon icon="ri:add-line" />
                添加计划
              </ElButton>
            </template>
            <div v-if="kind === 'sales_contract' || kind === 'sales_order'" class="min-w-0">
              <div class="mb-3 flex items-center gap-3 text-sm text-[var(--art-gray-700)]">
                <span>按比例（%）</span>
                <ElSwitch
                  :model-value="details.paymentPlanMode === 'ratio'"
                  aria-label="按比例编制收款计划"
                  @update:model-value="
                    (enabled) => (details.paymentPlanMode = enabled === true ? 'ratio' : 'amount')
                  "
                />
                <span class="text-xs text-[var(--art-gray-600)]">{{
                  details.paymentPlanMode === 'ratio'
                    ? '填写应收比例，自动计算金额'
                    : '填写应收金额，自动计算比例'
                }}</span>
              </div>
              <ArtTable
                :data="paymentPlans"
                :columns="paymentColumns"
                :pagination="false"
                row-key="id"
                border
                :max-height="380"
                scrollbar-always-on
                class="w-full!"
                empty-text="暂无收款计划"
                empty-description="点击“添加计划”设置每期应收。"
              />
            </div>
            <div v-else class="flex flex-col gap-3">
              <div
                v-for="(plan, index) in paymentPlans"
                :key="plan.id"
                class="grid min-w-0 grid-cols-1 items-end gap-3 rounded-lg border border-[var(--el-border-color-light)] p-3 sm:grid-cols-2 xl:grid-cols-4"
              >
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  到期日期
                  <ElDatePicker
                    v-model="plan.dueDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    class="w-full!"
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  应收比例（%）
                  <ElInputNumber
                    v-model="plan.ratio"
                    :min="0"
                    :max="100"
                    :precision="2"
                    :controls="false"
                    class="w-full!"
                    :disabled="details.paymentPlanMode === 'amount'"
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  应收金额（元）
                  <ElInputNumber
                    v-model="plan.amount"
                    :min="0"
                    :precision="2"
                    :controls="false"
                    class="w-full!"
                    :disabled="details.paymentPlanMode === 'ratio'"
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  预收允超比例（%）
                  <ElInputNumber
                    v-model="plan.excessRatio"
                    :min="0"
                    :max="100"
                    :precision="2"
                    :controls="false"
                    class="w-full!"
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  是否预收
                  <ElSwitch v-model="plan.isAdvance" />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)] xl:col-span-2">
                  备注
                  <ElInput v-model="plan.remark" maxlength="300" />
                </label>
                <ElButton type="danger" text @click="paymentPlans.splice(index, 1)">移除</ElButton>
              </div>
            </div>
          </ArtSectionCard>
        </ElTabPane>

        <ElTabPane v-if="config.useDeliveryPlans" label="发货计划" name="deliveries">
          <ArtSectionCard
            title="发货计划"
            subtitle="按要货日期与运输提前期维护计划发货日期和数量。"
            :empty="!deliveryPlans.length"
            empty-title="暂无发货计划"
            empty-description="添加计划后可安排交付日期与数量。"
          >
            <template #actions>
              <ElButton type="primary" plain @click="addDeliveryPlan">
                <ArtSvgIcon icon="ri:add-line" />
                添加计划
              </ElButton>
            </template>
            <ArtTable
              v-if="kind === 'sales_order'"
              :data="deliveryPlans"
              :columns="deliveryColumns"
              :pagination="false"
              row-key="id"
              border
              :max-height="380"
              scrollbar-always-on
              class="w-full!"
              empty-text="暂无发货计划"
              empty-description="点击“添加计划”安排要货日期与发货数量。"
            />
            <div v-else class="flex flex-col gap-3">
              <div
                v-for="(plan, index) in deliveryPlans"
                :key="plan.id"
                class="grid min-w-0 grid-cols-1 items-end gap-3 rounded-lg border border-[var(--el-border-color-light)] p-3 sm:grid-cols-2 xl:grid-cols-4"
              >
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  收货地点
                  <ElInput v-model="plan.location" maxlength="100" />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)] xl:col-span-2">
                  收货地址
                  <ElInput v-model="plan.address" maxlength="200" />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  要货日期
                  <ElDatePicker
                    v-model="plan.needDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    class="w-full!"
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  运输提前期（天）
                  <ElInputNumber
                    v-model="plan.leadDays"
                    :min="0"
                    :max="365"
                    :controls="false"
                    class="w-full!"
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  计划发货日期
                  <ElDatePicker
                    v-model="plan.plannedDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    class="w-full!"
                  />
                </label>
                <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                  计划数量
                  <ElInputNumber
                    v-model="plan.quantity"
                    :min="0.001"
                    :precision="3"
                    :controls="false"
                    class="w-full!"
                  />
                </label>
                <ElButton type="danger" text @click="deliveryPlans.splice(index, 1)">移除</ElButton>
              </div>
            </div>
          </ArtSectionCard>
        </ElTabPane>

        <ElTabPane v-if="config.useClauses" label="合同条款" name="clauses">
          <ArtSectionCard
            title="合同条款"
            subtitle="记录双方确认的条款标题与正文。"
            :empty="!clauses.length"
            empty-title="暂无合同条款"
            empty-description="添加条款后可填写标题与正文。"
          >
            <template #actions>
              <ElButton type="primary" plain @click="addClause">
                <ArtSvgIcon icon="ri:add-line" />
                添加条款
              </ElButton>
            </template>
            <div class="flex flex-col gap-3">
              <div
                v-for="(clause, index) in clauses"
                :key="clause.id"
                class="rounded-lg border border-[var(--el-border-color-light)] p-3"
              >
                <div class="mb-2 flex items-center justify-between">
                  <strong class="text-sm">第 {{ index + 1 }} 条</strong>
                  <ElButton type="danger" text @click="clauses.splice(index, 1)">移除</ElButton>
                </div>
                <div class="flex min-w-0 flex-col gap-2">
                  <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-700)]">
                    合同条款
                    <ElSelect
                      v-model="clause.title"
                      filterable
                      placeholder="参选合同条款"
                      class="w-full!"
                      :aria-label="`第 ${index + 1} 条合同条款`"
                    >
                      <ElOption
                        v-for="option in clauseOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </ElSelect>
                  </label>
                  <label class="flex flex-col gap-1 text-xs text-[var(--art-gray-700)]">
                    条款内容
                    <ElInput
                      v-model="clause.content"
                      type="textarea"
                      :rows="3"
                      maxlength="4000"
                      placeholder="条款内容"
                    />
                  </label>
                </div>
              </div>
            </div>
          </ArtSectionCard>
        </ElTabPane>
      </ElTabs>

      <div
        class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--el-fill-color-light)] px-4 py-3 text-sm"
      >
        <span class="text-[var(--art-gray-600)]">预计金额 · 保存时由数据库重新核算</span>
        <strong class="text-lg font-semibold text-[var(--el-color-primary)]">{{
          formatCurrencyValue(previewTotal)
        }}</strong>
      </div>
    </div>
  </ArtDialog>
  <ArtDialog ref="shippingOrderPickerRef" size="xl">
    <div class="flex min-w-0 flex-col gap-3">
      <p class="text-sm text-[var(--art-gray-600)]"
        >选择一张销售订单，再勾选需要发货的明细。已添加的来源行不会重复显示。</p
      >
      <ElSelect
        v-model="selectedShippingOrderId"
        filterable
        class="w-full!"
        :disabled="Boolean(header.sourceId)"
        placeholder="搜索销售订单号"
        aria-label="选择销售订单"
        @change="loadShippingOrderLines"
      >
        <ElOption
          v-for="order in sourceOptions"
          :key="order.id"
          :value="order.id"
          :label="order.documentNo"
        />
      </ElSelect>
      <ArtTable
        :data="availableShippingLines"
        :columns="shippingOrderColumns"
        :pagination="false"
        :loading="shippingOrderLoading"
        :height="Math.min(420, 88 + availableShippingLines.length * 48)"
        scrollbar-always-on
        row-key="lineId"
        border
        empty-text="暂无可选的订单明细"
        empty-description="请选择订单，或检查该订单是否还有待发货数量。"
        @selection-change="selectedShippingLines = $event"
      />
      <p class="text-xs text-[var(--art-gray-600)]"
        >已选 {{ selectedShippingLines.length }} 行 · 最多 200 行</p
      >
    </div>
  </ArtDialog>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import {
    ElCheckbox,
    ElDatePicker,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElOption,
    ElSelect,
    type FormRules
  } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import type { DataSelectColumn } from '@/components/core/forms/art-data-select/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useUserStore } from '@/store/modules/user'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    createScmSalesDocument,
    fetchQuoteExpenses,
    fetchScmCustomerOptions,
    fetchScmDocumentTypeOptions,
    fetchScmEngineeringReferenceOptions,
    fetchScmMaterialOptions,
    fetchScmProjectOptions,
    fetchScmRemainingSourceLines,
    fetchScmSalespersonOptions,
    fetchScmSourceOptions,
    updateScmSalesDocument,
    type ScmContractClause,
    type ScmCustomerOption,
    type ScmDeliveryPlan,
    type ScmDocumentDetails,
    type ScmDocumentFee,
    type ScmDocumentKind,
    type ScmDocumentLine,
    type ScmDocumentTypeOption,
    type ScmEngineeringReferenceOptions,
    type ScmMaterialOption,
    type ScmPaymentPlan,
    type ScmProjectOption,
    type ScmQuoteExpense,
    type ScmSalesDocument,
    type ScmSalesDocumentWrite
  } from '@scm/api'
  import { scmDocumentConfigs } from '../document-config'
  import {
    calculateContractLine,
    calculateQuotationLine,
    contractAuxiliaryQuantity
  } from '../quotation-pricing'
  import QuotationLineTable from './quotation-line-table.vue'
  import '../quotation-summary-table.css'

  defineOptions({ name: 'ScmDocumentDialog' })

  interface OpenOptions {
    kind: ScmDocumentKind
    record?: ScmSalesDocument
    copy?: boolean
    tenantOptions: Array<{ label: string; value: string }>
    effectiveTenantId: string | null
    initialSource?: ScmSalesDocument
    sourceLines?: ScmDocumentLine[]
    openSourcePicker?: boolean
  }

  interface HeaderModel {
    tenantId: string
    documentNo: string
    documentTypeId: string
    projectId: string
    customerId: string
    sourceId: string
    documentDate: string
    deliveryDate: string
    currency: string
    remark: string
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const { shouldExposeTenantField } = useTenantScopeFormPolicy()
  const userStore = useUserStore()
  const dialogRef = ref<ArtDialogExpose<OpenOptions>>()
  const shippingOrderPickerRef = ref<ArtDialogExpose>()
  const headerFormRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const detailsFormRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const quotationLineTableRef = ref<{
    validate: () => Promise<boolean>
    openSourcePicker: (kind: 'sales_quotation' | 'sales_contract') => Promise<void>
  }>()
  const feeTableRef = ref<ArtTableExpose>()
  const kind = ref<ScmDocumentKind>('sales_quotation')
  const config = computed(() => scmDocumentConfigs[kind.value])
  const recordId = ref<string>()
  const tenantOptions = ref<OpenOptions['tenantOptions']>([])
  const projectOptions = ref<ScmProjectOption[]>([])
  const quotationDocuments = ref<ScmSalesDocument[]>([])
  const contractDocuments = ref<ScmSalesDocument[]>([])
  const selectedSalesperson = ref<EmployeeIntegrationItem[]>([])
  const projectPickerColumns: DataSelectColumn[] = [
    { prop: 'projectCode', label: '项目编码', width: 150 },
    { prop: 'projectName', label: '项目名称', minWidth: 230 }
  ]
  const projectPickerLabel = (row: { projectCode?: string; projectName?: string }): string =>
    `${row.projectName ?? ''} · ${row.projectCode ?? ''}`
  const customerOptions = ref<ScmCustomerOption[]>([])
  const materialOptions = ref<ScmMaterialOption[]>([])
  const expenseOptions = ref<ScmQuoteExpense[]>([])
  const documentTypeOptions = ref<ScmDocumentTypeOption[]>([])
  const sourceOptions = ref<ScmSalesDocument[]>([])
  const engineeringReferences = reactive<ScmEngineeringReferenceOptions>({
    categories: [],
    materialTypes: [],
    units: [],
    codeRules: []
  })
  const referencesLoading = ref(false)
  const activeTab = ref('lines')
  let preparing = false
  let referenceRevision = 0

  function initialHeader(): HeaderModel {
    return {
      tenantId: '',
      documentNo: '',
      documentTypeId: '',
      projectId: '',
      customerId: '',
      sourceId: '',
      documentDate: dayjs().format('YYYY-MM-DD'),
      deliveryDate: '',
      currency: 'CNY',
      remark: ''
    }
  }

  const header = reactive<HeaderModel>(initialHeader())
  const details = reactive<ScmDocumentDetails>({})
  const lines = ref<ScmDocumentLine[]>([])
  const selectedShippingOrderId = ref('')
  const availableShippingLines = ref<ScmDocumentLine[]>([])
  const selectedShippingLines = ref<ScmDocumentLine[]>([])
  const shippingOrderLoading = ref(false)
  let shippingOrderRevision = 0
  const shippingOrderColumns: ColumnOption<ScmDocumentLine>[] = [
    { type: 'selection', width: 48 },
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 220, showOverflowTooltip: true },
    { prop: 'quantity', label: '待发数量', width: 110, align: 'right' },
    { prop: 'salesUnit', label: '单位', width: 90 }
  ]
  const fees = ref<ScmDocumentFee[]>([])
  const paymentPlans = ref<ScmPaymentPlan[]>([])
  const deliveryPlans = ref<ScmDeliveryPlan[]>([])
  const clauses = ref<ScmContractClause[]>([])

  const discountOptions = computed(() =>
    (userStore.getDictMap?.scmDiscountMode ?? [])
      .filter(
        (item) =>
          (kind.value !== 'sales_contract' && kind.value !== 'sales_order') ||
          ['none', 'percentage'].includes(String(item.value))
      )
      .map((item) => ({
        label: item.label ?? item.name,
        value: String(item.value)
      }))
  )
  const materialSourceOptions = computed(() =>
    (userStore.getDictMap?.mdmMaterialSource ?? []).map((item) => ({
      label: item.label ?? item.name,
      value: String(item.value)
    }))
  )
  const taxRateOptions = computed(() =>
    (userStore.getDictMap?.scmTaxRate ?? []).map((item) => ({
      label: item.label ?? item.name,
      value: String(item.value)
    }))
  )
  const clauseOptions = computed(() =>
    (userStore.getDictMap?.scmSalesContractClause ?? []).map((item) => ({
      label: item.label ?? item.name,
      value: String(item.value)
    }))
  )
  function lineAmount(line: ScmDocumentLine): number {
    return (
      kind.value === 'sales_contract' || kind.value === 'sales_order'
        ? calculateContractLine(line)
        : calculateQuotationLine(line)
    ).amount
  }

  function lineTax(line: ScmDocumentLine): number {
    return (
      kind.value === 'sales_contract' || kind.value === 'sales_order'
        ? calculateContractLine(line)
        : calculateQuotationLine(line)
    ).tax
  }

  const previewTotal = computed(() => {
    const subtotal = lines.value.reduce((sum, line) => sum + lineAmount(line), 0)
    const feeTotal = fees.value.reduce((sum, fee) => sum + Number(fee.amount || 0), 0)
    const projectExtras =
      kind.value === 'project_quotation' ||
      (kind.value === 'sales_quotation' && details.quotationScene === 'project')
        ? Number(details.packageFee || 0) + Number(details.transportFee || 0)
        : 0
    const taxTotal = lines.value.reduce((sum, line) => sum + lineTax(line), 0)
    return subtotal + taxTotal + feeTotal + projectExtras
  })

  const headerRules = computed<FormRules<HeaderModel>>(() => ({
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    documentNo:
      ['sales_contract', 'sales_order', 'shipping_notice'].includes(kind.value) && !recordId.value
        ? []
        : [
            { required: true, message: '请输入单据编号', trigger: 'blur' },
            { min: 2, max: 60, message: '单据编号长度应为 2–60 个字符', trigger: 'blur' }
          ],
    projectId: [
      {
        validator: (_rule, value, callback) => {
          if (
            value ||
            (kind.value === 'sales_quotation' &&
              details.quotationScene === 'project' &&
              details.autoCreateProject &&
              details.plannedProjectName?.trim()) ||
            (kind.value === 'project_quotation' && header.sourceId)
          )
            callback()
          else callback(new Error('请选择项目；工程报价可启用自动建项目并填写项目名称'))
        },
        trigger: 'change'
      }
    ],
    customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
    documentDate: [{ required: true, message: '请选择单据日期', trigger: 'change' }]
  }))

  const detailRules = computed<FormRules<ScmDocumentDetails>>(() => {
    const rules: FormRules<ScmDocumentDetails> = {}
    for (const field of activeDetailFields.value) {
      if (field.required)
        rules[field.key] = [{ required: true, message: `请填写${field.label}`, trigger: 'blur' }]
    }
    return rules
  })

  const activeDetailFields = computed(() =>
    kind.value === 'sales_quotation' && details.quotationScene === 'project'
      ? scmDocumentConfigs.project_quotation.fields
      : config.value.fields
  )

  const headerItems = computed<FormItem[]>(() => [
    ...(shouldExposeTenantField.value
      ? [
          { label: '数据归属', key: 'tenantSection', type: 'divider', span: 24 } as FormItem,
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select',
            span: 24,
            props: {
              options: tenantOptions.value,
              filterable: true,
              disabled: Boolean(recordId.value),
              placeholder: '选择单据所属租户'
            }
          } as FormItem
        ]
      : []),
    { label: '单据', key: 'documentSection', type: 'divider', span: 24 },
    {
      label: config.value.numberLabel,
      key: 'documentNo',
      type: 'input',
      props: {
        maxlength: 60,
        disabled: ['sales_contract', 'sales_order', 'shipping_notice'].includes(kind.value),
        placeholder: ['sales_contract', 'sales_order', 'shipping_notice'].includes(kind.value)
          ? '保存后按月度编号规则自动生成'
          : undefined
      }
    },
    {
      label: '单据类型',
      key: 'documentTypeId',
      type: 'select',
      props: {
        options: documentTypeOptions.value.map((item) => ({
          label: item.documentTypeName,
          value: item.id
        })),
        filterable: true,
        clearable: true,
        loading: referencesLoading.value,
        noDataText:
          kind.value === 'shipping_notice'
            ? '请先在 MDM 单据类型中配置发货通知单类型'
            : '暂无可用单据类型',
        placeholder: '按 MDM 单据类型配置参选'
      }
    },
    {
      label: '项目名称',
      key: 'projectId',
      type: ['sales_contract', 'sales_order', 'shipping_notice'].includes(kind.value)
        ? 'slot'
        : 'select',
      props: {
        options: projectOptions.value.map((item) => ({
          label: `${item.projectName}（${item.projectCode}）`,
          value: item.id
        })),
        filterable: true,
        loading: referencesLoading.value,
        disabled: !header.tenantId || Boolean(header.sourceId),
        clearable: !config.value.projectRequired,
        placeholder: config.value.projectRequired ? '请选择项目' : '选择既有项目，或在下方自动创建'
      }
    },
    {
      label: '客户全称',
      key: 'customerId',
      type: 'select',
      props: {
        options: customerOptions.value.map((item) => ({
          label: `${item.customerName}（${item.customerCode}）`,
          value: item.id
        })),
        filterable: true,
        loading: referencesLoading.value,
        disabled: !header.tenantId || Boolean(header.sourceId),
        placeholder: '优先从项目带入，可手动选择'
      }
    },
    ...(config.value.sourceKind && kind.value !== 'sales_order' && kind.value !== 'shipping_notice'
      ? [
          {
            label: config.value.sourceLabel || '来源单据',
            key: 'sourceId',
            type: 'select',
            span: 12,
            props: {
              options: sourceOptions.value.map((item) => ({
                label: `${item.documentNo} · ${projectOptions.value.find((project) => project.id === item.projectId)?.projectName || '未关联项目'}`,
                value: item.id
              })),
              filterable: true,
              clearable: !config.value.sourceRequired,
              loading: referencesLoading.value,
              disabled: !header.tenantId,
              noDataText:
                config.value.sourceKind === 'sales_order'
                  ? '当前租户暂无已审核或履约中的销售订单'
                  : '当前租户暂无可用来源单据，请核对租户和单据状态',
              placeholder: config.value.sourceRequired ? '请选择来源单据' : '可从已存在的单据带入'
            }
          } as FormItem
        ]
      : []),
    {
      label: '单据日期',
      key: 'documentDate',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
    },
    {
      label: '交货日期',
      key: 'deliveryDate',
      type: 'date',
      props: { type: 'date', valueFormat: 'YYYY-MM-DD', class: 'w-full!', clearable: true }
    },
    {
      label: '币种',
      key: 'currency',
      type: 'select',
      props: {
        options: userStore.getDictMap?.mdmCurrency ?? [],
        filterable: true,
        placeholder: '选择币种'
      }
    },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])

  const detailItems = computed<FormItem[]>(() => [
    ...(config.value.usePaymentPlans &&
    kind.value !== 'sales_contract' &&
    kind.value !== 'sales_order'
      ? [
          {
            label: '收款计划方式',
            key: 'paymentPlanMode',
            type: 'select',
            span: 12,
            props: {
              options: userStore.getDictMap?.scmPaymentPlanMode ?? [],
              placeholder: '按比例或按金额'
            }
          } as FormItem
        ]
      : []),
    ...(kind.value === 'sales_quotation'
      ? [
          {
            label: '报价场景',
            key: 'quotationScene',
            type: 'select',
            span: 24,
            props: {
              options: [
                { label: '标准产品报价', value: 'standard' },
                { label: '项目工程报价', value: 'project' }
              ],
              disabled: Boolean(recordId.value),
              placeholder: '请选择报价场景'
            }
          } as FormItem
        ]
      : []),
    ...activeDetailFields.value.map((field): FormItem => ({
      label: field.label,
      key: field.key,
      type: field.type,
      span: field.span ?? 12,
      props:
        field.type === 'date'
          ? {
              type: 'date',
              valueFormat: 'YYYY-MM-DD',
              class: 'w-full!',
              clearable: true,
              disabled: kind.value === 'project_quotation'
            }
          : field.type === 'number'
            ? {
                min: 0,
                precision: 2,
                controls: false,
                class: 'w-full!',
                disabled: kind.value === 'project_quotation'
              }
            : field.type === 'select'
              ? {
                  options: userStore.getDictMap?.[field.dictionary || ''] ?? [],
                  clearable: true,
                  disabled: kind.value === 'project_quotation' || field.key === 'salesDepartment'
                }
              : {
                  maxlength: field.span === 24 ? 500 : 120,
                  disabled: kind.value === 'project_quotation'
                }
    }))
  ])

  const automationItems = computed<FormItem[]>(() => [
    { label: '自动创建项目', key: 'autoCreateProject', type: 'switch' },
    { label: '自动创建物料', key: 'autoCreateMaterials', type: 'switch' },
    { label: '自动搭建 BOM', key: 'autoBuildBom', type: 'switch' },
    ...(details.autoCreateMaterials || details.autoBuildBom
      ? ([
          {
            label: '物料分类',
            key: 'materialCategoryId',
            type: 'select',
            props: {
              options: engineeringReferences.categories.map((item) => ({
                label: `${item.name} · ${item.code}`,
                value: item.id
              })),
              filterable: true,
              placeholder: '请选择物料分类'
            }
          },
          {
            label: '默认基本单位',
            key: 'baseUnitId',
            type: 'select',
            props: {
              options: engineeringReferences.units.map((item) => ({
                label: `${item.name} · ${item.code}`,
                value: item.id
              })),
              filterable: true,
              placeholder: '请选择单位'
            }
          },
          {
            label: '物料编码规则',
            key: 'materialCodeRuleId',
            type: 'select',
            span: 24,
            props: {
              options: engineeringReferences.codeRules.map((item) => ({
                label: `${item.name} · ${item.code}`,
                value: item.id
              })),
              filterable: true,
              placeholder: '请选择编码规则'
            }
          }
        ] as FormItem[])
      : [])
  ])

  async function loadReferences(tenantId: string): Promise<void> {
    const revision = ++referenceRevision
    projectOptions.value = []
    customerOptions.value = []
    materialOptions.value = []
    expenseOptions.value = []
    documentTypeOptions.value = []
    sourceOptions.value = []
    quotationDocuments.value = []
    contractDocuments.value = []
    Object.assign(engineeringReferences, {
      categories: [],
      materialTypes: [],
      units: [],
      codeRules: []
    })
    if (!tenantId) return
    referencesLoading.value = true
    try {
      const [
        projects,
        customers,
        materials,
        expenses,
        types,
        sources,
        engineering,
        quotations,
        contracts
      ] = await Promise.all([
        fetchScmProjectOptions(tenantId),
        fetchScmCustomerOptions(tenantId),
        fetchScmMaterialOptions(tenantId),
        fetchQuoteExpenses({ tenantId }),
        fetchScmDocumentTypeOptions(tenantId, config.value.menuName),
        config.value.sourceKind
          ? fetchScmSourceOptions(config.value.sourceKind, tenantId)
          : Promise.resolve(null),
        kind.value === 'sales_quotation'
          ? fetchScmEngineeringReferenceOptions(tenantId)
          : Promise.resolve(null),
        kind.value === 'sales_contract' || kind.value === 'sales_order'
          ? fetchScmSourceOptions('sales_quotation', tenantId)
          : Promise.resolve(null),
        kind.value === 'sales_order'
          ? fetchScmSourceOptions('sales_contract', tenantId)
          : Promise.resolve(null)
      ])
      if (revision !== referenceRevision) return
      projectOptions.value = projects.data ?? []
      customerOptions.value = customers.data ?? []
      materialOptions.value = materials.data ?? []
      expenseOptions.value = expenses.data ?? []
      documentTypeOptions.value = types.data ?? []
      quotationDocuments.value = (quotations?.data ?? []).filter(
        (item) => item.status === 'effective'
      )
      contractDocuments.value = (contracts?.data ?? []).filter(
        (item) => item.status === 'effective'
      )
      sourceOptions.value = (sources?.data ?? []).filter((item) => {
        if (config.value.sourceKind === 'shipping_notice')
          return ['shipped', 'completed'].includes(item.status)
        if (config.value.sourceKind === 'sales_order')
          return ['approved', 'fulfilling'].includes(item.status)
        if (config.value.sourceKind === 'sales_contract') return item.status === 'effective'
        if (config.value.sourceKind === 'project_quotation') return item.status === 'effective'
        if (kind.value === 'project_quotation')
          return item.status === 'effective' && item.details.quotationScene === 'project'
        return item.status === 'effective'
      })
      if (engineering?.data) Object.assign(engineeringReferences, engineering.data)
    } catch {
      if (revision === referenceRevision) ElMessage.warning('关联主数据加载失败，请稍后重试')
    } finally {
      if (revision === referenceRevision) referencesLoading.value = false
    }
  }

  function addFee(): void {
    const next = expenseOptions.value.find(
      (expense) => !fees.value.some((item) => item.expenseId === expense.id)
    )
    if (next) fees.value.push({ expenseId: next.id, amount: 0, cost: 0 })
  }

  const feeColumns = computed<ColumnOption<ScmDocumentFee>[]>(() => [
    {
      prop: 'expenseId',
      label: '费用',
      minWidth: 190,
      required: true,
      requiredMessage: ({ rowIndex }) => `第 ${rowIndex + 1} 项费用未选择费用类型`,
      formatter: (row) => (
        <ElSelect
          v-model={row.expenseId}
          filterable
          style={{ width: '100%' }}
          aria-label="费用类型"
        >
          {expenseOptions.value.map((expense) => (
            <ElOption
              key={expense.id}
              label={expense.expenseName}
              value={expense.id}
              disabled={fees.value.some((item) => item !== row && item.expenseId === expense.id)}
            />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'amount',
      label: '金额（元）',
      width: 155,
      align: 'right',
      required: true,
      rules: {
        validator: ({ value }) => Number.isFinite(Number(value)) && Number(value) >= 0,
        message: '费用金额不能小于 0'
      },
      formatter: (row) => (
        <ElInputNumber
          v-model={row.amount}
          min={0}
          precision={2}
          controls={false}
          class="w-full!"
          aria-label="费用金额"
        />
      )
    },
    {
      prop: 'cost',
      label: '成本（元）',
      width: 155,
      align: 'right',
      required: true,
      rules: {
        validator: ({ value }) => Number.isFinite(Number(value)) && Number(value) >= 0,
        message: '费用成本不能小于 0'
      },
      formatter: (row) => (
        <ElInputNumber
          v-model={row.cost}
          min={0}
          precision={2}
          controls={false}
          class="w-full!"
          aria-label="费用成本"
        />
      )
    },
    {
      prop: 'remark',
      label: '备注',
      minWidth: 170,
      formatter: (row) => (
        <ElInput v-model={row.remark} maxlength={300} placeholder="备注" aria-label="费用备注" />
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 68,
      align: 'center',
      formatter: (row) => (
        <ArtIconButton
          icon="ri:delete-bin-line"
          label="移除费用"
          tone="danger"
          onClick={() => fees.value.splice(fees.value.indexOf(row), 1)}
        />
      )
    }
  ])

  function feeSummaryMethod({ columns }: { columns: Array<{ property?: string }> }): string[] {
    return columns.map((column, index) => {
      if (index === 0) return '合计'
      if (column.property === 'amount')
        return formatCurrencyValue(
          fees.value.reduce((sum, fee) => sum + Number(fee.amount || 0), 0)
        )
      if (column.property === 'cost')
        return formatCurrencyValue(fees.value.reduce((sum, fee) => sum + Number(fee.cost || 0), 0))
      return ''
    })
  }

  function addPaymentPlan(): void {
    paymentPlans.value.push({
      id: crypto.randomUUID(),
      isAdvance: false,
      dueDate: '',
      ratio: 0,
      amount: 0,
      excessRatio: 0
    })
  }

  const paymentColumns = computed<ColumnOption<ScmPaymentPlan>[]>(() => [
    {
      prop: 'id',
      label: '#',
      width: 52,
      align: 'center',
      formatter: (row) => String(paymentPlans.value.indexOf(row) + 1)
    },
    {
      prop: 'isAdvance',
      label: '是否预收',
      width: 100,
      align: 'center',
      formatter: (row) => <ElCheckbox v-model={row.isAdvance} aria-label="是否预收" />
    },
    {
      prop: 'dueDate',
      label: '到期日',
      width: 175,
      formatter: (row) => (
        <ElDatePicker
          v-model={row.dueDate}
          type="date"
          valueFormat="YYYY-MM-DD"
          class="w-full!"
          aria-label="收款到期日"
        />
      )
    },
    {
      prop: 'ratio',
      label: '应收比例（%）',
      width: 135,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.ratio}
          min={0}
          max={100}
          precision={2}
          controls={false}
          disabled={details.paymentPlanMode !== 'ratio'}
          class="w-full!"
          aria-label="应收比例"
        />
      )
    },
    {
      prop: 'amount',
      label: '应收金额（元）',
      width: 145,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.amount}
          min={0}
          precision={2}
          controls={false}
          disabled={details.paymentPlanMode === 'ratio'}
          class="w-full!"
          aria-label="应收金额"
        />
      )
    },
    {
      prop: 'excessRatio',
      label: '预收允超比例（%）',
      width: 155,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.excessRatio}
          min={0}
          max={100}
          precision={2}
          controls={false}
          class="w-full!"
          aria-label="预收允超比例"
        />
      )
    },
    {
      prop: 'remark',
      label: '备注',
      minWidth: 160,
      formatter: (row) => <ElInput v-model={row.remark} maxlength={300} aria-label="收款计划备注" />
    },
    {
      prop: 'operation',
      label: '操作',
      width: 68,
      fixed: 'right',
      align: 'center',
      formatter: (row) => (
        <ArtIconButton
          icon="ri:delete-bin-line"
          label="移除收款计划"
          tone="danger"
          onClick={() => paymentPlans.value.splice(paymentPlans.value.indexOf(row), 1)}
        />
      )
    }
  ])

  function addDeliveryPlan(): void {
    const today = dayjs().format('YYYY-MM-DD')
    deliveryPlans.value.push({
      id: crypto.randomUUID(),
      location: '',
      address: '',
      needDate: today,
      leadDays: 0,
      plannedDate: today,
      quantity: 1
    })
  }

  function updatePlannedDate(plan: ScmDeliveryPlan): void {
    plan.plannedDate = plan.needDate
      ? dayjs(plan.needDate)
          .subtract(Number(plan.leadDays) || 0, 'day')
          .format('YYYY-MM-DD')
      : ''
  }

  const deliveryColumns = computed<ColumnOption<ScmDeliveryPlan>[]>(() => [
    {
      prop: 'id',
      label: '#',
      width: 52,
      align: 'center',
      formatter: (row) => String(deliveryPlans.value.indexOf(row) + 1)
    },
    {
      prop: 'location',
      label: '收货地点',
      minWidth: 150,
      formatter: (row) => <ElInput v-model={row.location} maxlength={100} aria-label="收货地点" />
    },
    {
      prop: 'address',
      label: '收货地址',
      minWidth: 190,
      formatter: (row) => <ElInput v-model={row.address} maxlength={200} aria-label="收货地址" />
    },
    {
      prop: 'needDate',
      label: '要货日期',
      width: 170,
      formatter: (row) => (
        <ElDatePicker
          v-model={row.needDate}
          type="date"
          valueFormat="YYYY-MM-DD"
          class="w-full!"
          aria-label="要货日期"
          onUpdate:modelValue={() => nextTick(() => updatePlannedDate(row))}
        />
      )
    },
    {
      prop: 'leadDays',
      label: '运输提前期（天）',
      width: 145,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.leadDays}
          min={0}
          max={365}
          precision={0}
          controls={false}
          class="w-full!"
          aria-label="运输提前期"
          onChange={() => updatePlannedDate(row)}
        />
      )
    },
    {
      prop: 'plannedDate',
      label: '计划发货日期',
      width: 135,
      formatter: (row) => row.plannedDate || '—'
    },
    {
      prop: 'quantity',
      label: '计划数量',
      width: 130,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.quantity}
          min={0.001}
          precision={3}
          controls={false}
          class="w-full!"
          aria-label="计划数量"
        />
      )
    },
    {
      prop: 'remark',
      label: '备注',
      minWidth: 160,
      formatter: (row) => <ElInput v-model={row.remark} maxlength={300} aria-label="发货计划备注" />
    },
    {
      prop: 'operation',
      label: '操作',
      width: 68,
      fixed: 'right',
      align: 'center',
      formatter: (row) => (
        <ArtIconButton
          icon="ri:delete-bin-line"
          label="移除发货计划"
          tone="danger"
          onClick={() => deliveryPlans.value.splice(deliveryPlans.value.indexOf(row), 1)}
        />
      )
    }
  ])

  function addClause(): void {
    clauses.value.push({ id: crypto.randomUUID(), title: '', content: '' })
  }

  async function loadShippingOrderLines(orderId: string): Promise<void> {
    const revision = ++shippingOrderRevision
    selectedShippingLines.value = []
    availableShippingLines.value = []
    const source = sourceOptions.value.find((item) => item.id === orderId)
    if (!source) return
    shippingOrderLoading.value = true
    try {
      const remaining = await fetchScmRemainingSourceLines(source)
      if (revision !== shippingOrderRevision) return
      availableShippingLines.value = remaining.filter(
        (line) => !lines.value.some((existing) => existing.sourceLineId === line.lineId)
      )
    } catch {
      if (revision === shippingOrderRevision)
        ElMessage.warning('订单剩余数量加载失败，请重新选择订单')
    } finally {
      if (revision === shippingOrderRevision) shippingOrderLoading.value = false
    }
  }

  async function openShippingOrderPicker(): Promise<void> {
    if (lines.value.length && !header.sourceId) {
      ElMessage.warning('当前为直接添加物料的发货单；请清空明细后再选单')
      return
    }
    if (!sourceOptions.value.length) {
      ElMessage.warning('暂无可选的已审核或履约中销售订单')
      return
    }
    selectedShippingOrderId.value = header.sourceId || ''
    selectedShippingLines.value = []
    availableShippingLines.value = []
    if (selectedShippingOrderId.value) await loadShippingOrderLines(selectedShippingOrderId.value)
    await shippingOrderPickerRef.value?.handleOpen(undefined, {
      title: '选单 · 销售订单明细',
      confirmText: '添加所选明细',
      onConfirm: () => {
        const source = sourceOptions.value.find((item) => item.id === selectedShippingOrderId.value)
        if (!source || !selectedShippingLines.value.length) {
          ElMessage.warning('请选择销售订单及至少一行待发明细')
          return false
        }
        if (header.sourceId && header.sourceId !== source.id) {
          ElMessage.warning('一张发货通知单只能关联一张销售订单')
          return false
        }
        if (lines.value.length + selectedShippingLines.value.length > 200) {
          ElMessage.warning('发货明细最多 200 行')
          return false
        }
        header.sourceId = source.id
        header.projectId = source.projectId || ''
        header.customerId = source.customerId || ''
        header.currency = source.currency || 'CNY'
        lines.value = [
          ...lines.value,
          ...selectedShippingLines.value.map((line) => ({
            ...line,
            lineId: crypto.randomUUID(),
            sourceLineId: line.lineId,
            sourceDocumentId: source.id,
            sourceDocumentNo: source.documentNo,
            sourceLineNo: source.lines.findIndex((item) => item.lineId === line.lineId) + 1,
            deliveredQuantity: 0,
            outboundQuantity: 0,
            returnQuantity: 0
          }))
        ]
        return true
      }
    })
  }

  function updateSalesperson(_id: string | undefined, rows: EmployeeIntegrationItem[]): void {
    details.salesperson = rows[0]?.employeeName ?? ''
    details.salesDepartment = rows[0]?.organization?.organizationName ?? ''
  }

  function applySelectedLineSource(
    source: Pick<ScmSalesDocument, 'projectId' | 'customerId' | 'currency'>
  ): void {
    if (!header.projectId) header.projectId = source.projectId ?? ''
    if (!header.customerId) header.customerId = source.customerId ?? ''
    header.currency = source.currency || 'CNY'
  }

  async function applySource(id: string): Promise<void> {
    const source = sourceOptions.value.find((item) => item.id === id)
    if (!source) return
    const availableLines = await fetchScmRemainingSourceLines(source)
    if (header.sourceId !== id) return
    if (!availableLines.length) {
      ElMessage.warning('来源单据已无剩余数量，请选择其他单据')
      header.sourceId = ''
      return
    }
    header.projectId = source.projectId || ''
    header.customerId = source.customerId || ''
    header.currency = source.currency || 'CNY'
    if (kind.value === 'project_quotation') {
      Object.assign(details, source.details)
      header.documentDate = source.documentDate
      header.deliveryDate = source.deliveryDate || ''
      header.remark = source.remark || ''
    }
    lines.value = availableLines.map((line) => ({
      ...line,
      lineId: crypto.randomUUID(),
      sourceLineId: line.lineId,
      deliveredQuantity: 0,
      outboundQuantity: 0,
      returnQuantity: 0
    }))
    if (config.value.useFees) fees.value = source.fees.map((fee) => ({ ...fee }))
  }

  function validateDetails(): boolean {
    if (config.value.sourceRequired && !header.sourceId) {
      ElMessage.warning(`请选择${config.value.sourceLabel || '来源单据'}`)
      return false
    }
    if (!lines.value.length) {
      ElMessage.warning(`请添加至少一行${kind.value === 'shipping_notice' ? '发货' : '物料'}明细`)
      activeTab.value = 'lines'
      return false
    }
    if (
      kind.value === 'shipping_notice' &&
      lines.value.some((line) => Boolean(line.sourceLineId) !== Boolean(header.sourceId))
    ) {
      ElMessage.warning('选单明细与直接添加的物料不能混用，请检查发货明细')
      activeTab.value = 'lines'
      return false
    }
    if (kind.value === 'sales_quotation' && details.quotationScene === 'project') {
      if (!header.projectId && !details.autoCreateProject) {
        ElMessage.warning('请选择既有项目，或启用自动创建项目')
        return false
      }
      if (details.autoCreateProject && !header.projectId && !details.plannedProjectName?.trim()) {
        ElMessage.warning('请填写项目名称')
        return false
      }
      if (
        details.autoBuildBom &&
        !details.autoCreateMaterials &&
        lines.value.some((line) => !line.materialId)
      ) {
        ElMessage.warning('存在未编码明细；请先启用自动创建物料编码，再搭建 BOM 清单')
        return false
      }
      if (
        (details.autoCreateMaterials || details.autoBuildBom) &&
        (!details.materialCategoryId || !details.baseUnitId || !details.materialCodeRuleId)
      ) {
        ElMessage.warning('请完整选择物料分类、基本单位和编码规则')
        return false
      }
    }
    if (
      lines.value.some(
        (line) =>
          !line.materialDescription?.trim() ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          !Number.isFinite(line.unitPrice) ||
          line.unitPrice < 0 ||
          line.taxRate < 0 ||
          line.taxRate > 100
      )
    ) {
      ElMessage.warning('请完整填写物料描述、正数数量、非负单价及 0–100% 税率')
      activeTab.value = 'lines'
      return false
    }
    if (
      (kind.value === 'sales_quotation' ||
        kind.value === 'sales_contract' ||
        kind.value === 'sales_order') &&
      lines.value.some(
        (line) =>
          (kind.value === 'sales_quotation' &&
            (!line.materialSource ||
              !materialSourceOptions.value.some(
                (option) => option.value === line.materialSource
              ))) ||
          !taxRateOptions.value.some((option) => Number(option.value) === line.taxRate)
      )
    ) {
      ElMessage.warning('请为每行参选有效的税率和物料来源')
      activeTab.value = 'lines'
      return false
    }
    if (
      (kind.value === 'sales_contract' || kind.value === 'sales_order') &&
      lines.value.some((line) => calculateContractLine(line).amount < 0)
    ) {
      ElMessage.warning('折扣额不能大于未税金额，请调整折扣率')
      activeTab.value = 'lines'
      return false
    }
    if (fees.value.some((fee) => !fee.expenseId || fee.amount < 0 || fee.cost < 0)) {
      ElMessage.warning('请完整填写费用明细')
      activeTab.value = 'fees'
      return false
    }
    if (paymentPlans.value.some((plan) => !plan.dueDate || plan.ratio < 0 || plan.amount < 0)) {
      ElMessage.warning('请完整填写收款计划')
      activeTab.value = 'payments'
      return false
    }
    if (
      deliveryPlans.value.some((plan) => !plan.needDate || !plan.plannedDate || plan.quantity <= 0)
    ) {
      ElMessage.warning('请完整填写发货计划')
      activeTab.value = 'deliveries'
      return false
    }
    if (
      clauses.value.some(
        (clause) =>
          !clause.title.trim() ||
          !clause.content.trim() ||
          (kind.value === 'sales_contract' &&
            !clauseOptions.value.some((option) => option.value === clause.title))
      )
    ) {
      ElMessage.warning('请完整填写合同条款')
      activeTab.value = 'clauses'
      return false
    }
    return true
  }

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await headerFormRef.value?.validate())) return false
      if (
        kind.value !== 'project_quotation' &&
        config.value.fields.length &&
        !(await detailsFormRef.value?.validate())
      )
        return false
      if (kind.value !== 'project_quotation' && !(await quotationLineTableRef.value?.validate()))
        return false
      if (config.value.useFees) {
        const feeValidation = await feeTableRef.value?.validate()
        if (feeValidation && !feeValidation.valid) {
          activeTab.value = 'fees'
          ElMessage.warning(feeValidation.firstError?.message ?? '请完善费用明细')
          return false
        }
      }
      if (!validateDetails()) return false
      const cleanDetails: ScmDocumentDetails = { ...details }
      const payload: ScmSalesDocumentWrite = {
        tenantId: header.tenantId,
        kind: kind.value,
        documentNo: header.documentNo,
        documentTypeId: header.documentTypeId || null,
        projectId: header.projectId || null,
        customerId: header.customerId || null,
        sourceId: header.sourceId || null,
        documentDate: header.documentDate,
        deliveryDate: header.deliveryDate || null,
        currency: header.currency || 'CNY',
        details: cleanDetails,
        lines:
          kind.value === 'sales_contract' || kind.value === 'shipping_notice'
            ? lines.value.map((line) => {
                const material = materialOptions.value.find((item) => item.id === line.materialId)
                return {
                  ...line,
                  auxiliaryQuantity:
                    contractAuxiliaryQuantity(line.quantity, material?.auxiliaryUnitId, material) ??
                    (kind.value === 'shipping_notice' ? undefined : line.auxiliaryQuantity),
                  auxiliaryUnit:
                    material?.auxiliaryUnit ??
                    (kind.value === 'shipping_notice' ? undefined : line.auxiliaryUnit),
                  auxiliaryQuantity2:
                    contractAuxiliaryQuantity(
                      line.quantity,
                      material?.auxiliaryUnit2Id,
                      material
                    ) ?? (kind.value === 'shipping_notice' ? undefined : line.auxiliaryQuantity2),
                  auxiliaryUnit2: material?.auxiliaryUnit2 ?? line.auxiliaryUnit2
                }
              })
            : lines.value,
        fees: fees.value,
        paymentPlans: paymentPlans.value,
        deliveryPlans: deliveryPlans.value,
        clauses: clauses.value,
        remark: header.remark
      }
      if (recordId.value) await updateScmSalesDocument(recordId.value, payload)
      else await createScmSalesDocument(payload)
      emit('success', recordId.value ? 'edit' : 'add')
      return true
    } catch {
      // API 边界已显示业务安全的错误，保留表单供用户修正。
      return false
    }
  }

  async function handleOpen(options: OpenOptions): Promise<void> {
    try {
      await Promise.all(
        [
          'scmDiscountMode',
          'scmPaymentPlanMode',
          'scmTransportMode',
          'mdmCurrency',
          'scmTaxRate',
          'scmSalesContractClause'
        ].map((code) => userStore.ensureDictLoaded(code))
      )
    } catch {
      ElMessage.warning('单据选项加载失败，请刷新页面重试')
      return
    }
    preparing = true
    kind.value = options.kind
    recordId.value = options.copy ? undefined : options.record?.id
    tenantOptions.value = options.tenantOptions
    Object.assign(header, initialHeader(), options.record ?? {}, {
      tenantId: options.record?.tenantId ?? options.effectiveTenantId ?? '',
      documentNo: options.copy ? '' : (options.record?.documentNo ?? ''),
      documentTypeId: options.record?.documentTypeId ?? '',
      projectId: options.record?.projectId ?? '',
      customerId: options.record?.customerId ?? '',
      sourceId: options.copy ? '' : (options.record?.sourceId ?? ''),
      deliveryDate: options.record?.deliveryDate ?? '',
      remark: options.record?.remark ?? ''
    })
    for (const key of Object.keys(details)) delete details[key as keyof ScmDocumentDetails]
    Object.assign(details, options.record?.details ?? {})
    selectedSalesperson.value = details.salespersonId
      ? [
          {
            id: details.salespersonId,
            tenantId: header.tenantId,
            employeeNo: '',
            employeeName: details.salesperson || '',
            employmentStatus: 'active'
          }
        ]
      : []
    if (kind.value === 'sales_quotation' && !details.quotationScene)
      details.quotationScene = 'standard'
    if (options.copy) delete details.automationResult
    if (config.value.usePaymentPlans && !details.paymentPlanMode) details.paymentPlanMode = 'amount'
    lines.value =
      options.record?.lines.map((line, index) => ({
        ...line,
        lineId: options.copy ? crypto.randomUUID() : line.lineId,
        ...(options.copy && kind.value === 'sales_order'
          ? {
              sourceDocumentId: undefined,
              sourceDocumentNo: options.record?.documentNo,
              sourceLineId: line.lineId,
              sourceLineNo: index + 1
            }
          : {})
      })) ?? []
    if (options.copy && kind.value === 'shipping_notice' && options.record?.sourceId)
      lines.value = []
    if (options.initialSource) {
      header.tenantId = options.initialSource.tenantId
      header.sourceId = options.initialSource.id
      header.projectId = options.initialSource.projectId ?? ''
      header.customerId = options.initialSource.customerId ?? ''
      header.currency = options.initialSource.currency
      lines.value = (options.sourceLines ?? options.initialSource.lines).map((line) => ({
        ...line,
        lineId: crypto.randomUUID(),
        sourceLineId: line.lineId,
        sourceDocumentId: options.initialSource?.id,
        sourceDocumentNo: options.initialSource?.documentNo
      }))
    }
    fees.value = options.record?.fees.map((fee) => ({ ...fee })) ?? []
    paymentPlans.value =
      options.record?.paymentPlans.map((plan) => ({
        ...plan,
        id: options.copy ? crypto.randomUUID() : plan.id
      })) ?? []
    deliveryPlans.value =
      options.record?.deliveryPlans.map((plan) => ({
        ...plan,
        id: options.copy ? crypto.randomUUID() : plan.id
      })) ?? []
    clauses.value =
      options.record?.clauses.map((clause) => ({
        ...clause,
        id: options.copy ? crypto.randomUUID() : clause.id
      })) ?? []
    activeTab.value = 'lines'
    await nextTick()
    preparing = false
    const referencesPromise = loadReferences(header.tenantId)
    await dialogRef.value?.handleOpen(options, {
      title: options.copy
        ? `复制${config.value.title} · ${options.record?.documentNo || ''}`
        : options.record
          ? `编辑${config.value.title} · ${options.record.documentNo}`
          : `新增${config.value.title}`,
      confirmText: recordId.value ? '保存更改' : '创建单据',
      onConfirm: handleSubmit,
      onOpen: () => {
        headerFormRef.value?.clearValidate()
        detailsFormRef.value?.clearValidate()
      },
      dialogProps: { closeOnClickModal: false }
    })
    if (options.openSourcePicker && kind.value === 'sales_order') {
      await referencesPromise
      await nextTick()
      await quotationLineTableRef.value?.openSourcePicker('sales_contract')
    }
  }

  watch(
    () => header.tenantId,
    (tenantId, previous) => {
      if (preparing || tenantId === previous) return
      header.projectId = ''
      header.customerId = ''
      header.sourceId = ''
      details.salespersonId = undefined
      details.salesperson = ''
      selectedSalesperson.value = []
      lines.value = []
      fees.value = []
      void loadReferences(tenantId)
    }
  )
  watch(
    () => header.projectId,
    (projectId) => {
      if (preparing || header.sourceId) return
      const project = projectOptions.value.find((item) => item.id === projectId)
      if (project?.customerId) header.customerId = project.customerId
      if (projectId) details.plannedProjectName = project?.projectName ?? details.plannedProjectName
    }
  )
  watch(
    () => header.sourceId,
    (sourceId) => {
      if (!preparing && sourceId && kind.value !== 'shipping_notice') void applySource(sourceId)
    }
  )
  watch(
    () => lines.value.length,
    (count) => {
      if (!preparing && kind.value === 'shipping_notice' && !count) header.sourceId = ''
    }
  )

  watch(
    [() => details.paymentPlanMode, previewTotal, paymentPlans],
    () => {
      const total = previewTotal.value
      for (const plan of paymentPlans.value) {
        if (details.paymentPlanMode === 'ratio') {
          const amount = Math.round(total * plan.ratio) / 100
          if (plan.amount !== amount) plan.amount = amount
        } else if (details.paymentPlanMode === 'amount') {
          const ratio = total > 0 ? Math.round((plan.amount / total) * 10000) / 100 : 0
          if (plan.ratio !== ratio) plan.ratio = ratio
        }
      }
    },
    { deep: true }
  )

  defineExpose({ handleOpen })
</script>
