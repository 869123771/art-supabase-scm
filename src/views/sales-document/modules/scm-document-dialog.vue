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
        />
      </ArtSectionCard>

      <ArtSectionCard
        v-if="config.fields.length"
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
        />
      </ArtSectionCard>

      <ElTabs v-model="activeTab" class="min-w-0">
        <ElTabPane label="物料明细" name="lines">
          <ArtSectionCard title="物料明细" subtitle="按单据维护物料、数量、价格、税率与成本。">
            <template #actions>
              <ElButton
                type="primary"
                plain
                size="small"
                :disabled="!header.tenantId || config.sourceRequired"
                @click="addLine"
              >
                添加明细
              </ElButton>
            </template>
            <div v-if="!lines.length" class="py-6 text-center text-sm text-[var(--art-gray-600)]">
              暂无物料明细，添加后可计算单据金额。
            </div>
            <div v-else class="flex flex-col gap-3">
              <div
                v-for="(line, index) in lines"
                :key="line.lineId"
                class="min-w-0 rounded-lg border border-[var(--el-border-color-light)] p-4"
              >
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <strong class="text-sm"
                    >第 {{ index + 1 }} 行 · {{ line.materialDescription || '新物料' }}</strong
                  >
                  <ElButton type="danger" text size="small" @click="lines.splice(index, 1)"
                    >移除</ElButton
                  >
                </div>
                <div class="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    物料编码
                    <ElSelect
                      v-model="line.materialId"
                      filterable
                      clearable
                      :loading="referencesLoading"
                      placeholder="选择物料"
                      class="w-full"
                      @change="(value: string) => selectMaterial(line, value)"
                    >
                      <ElOption
                        v-for="material in materialOptions"
                        :key="material.id"
                        :label="`${material.materialCode} · ${material.materialDescription}`"
                        :value="material.id"
                      />
                    </ElSelect>
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    物料描述
                    <ElInput
                      v-model="line.materialDescription"
                      maxlength="200"
                      placeholder="填写物料描述"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    规格型号
                    <ElInput v-model="line.specification" maxlength="100" />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    生产厂家
                    <ElInput v-model="line.manufacturer" maxlength="100" />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    数量
                    <ElInputNumber
                      v-model="line.quantity"
                      :min="0.001"
                      :precision="3"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    单价（元）
                    <ElInputNumber
                      v-model="line.unitPrice"
                      :min="0"
                      :precision="2"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    税率（%）
                    <ElInputNumber
                      v-model="line.taxRate"
                      :min="0"
                      :max="100"
                      :precision="2"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    成本单价（元）
                    <ElInputNumber
                      v-model="line.costUnitPrice"
                      :min="0"
                      :precision="2"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    销售单位
                    <ElInput v-model="line.salesUnit" maxlength="30" />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    折扣方式
                    <ElSelect
                      v-model="line.discountMode"
                      clearable
                      placeholder="无折扣"
                      class="w-full"
                    >
                      <ElOption
                        v-for="option in discountOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </ElSelect>
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    单位折扣率（%）
                    <ElInputNumber
                      v-model="line.discountRate"
                      :min="0"
                      :max="100"
                      :precision="2"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    赠品
                    <ElSwitch v-model="line.gift" />
                  </label>
                  <template v-if="kind === 'sales_quotation' || kind === 'sales_contract'">
                    <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                      单台数量 / 辅助数量
                      <ElInputNumber
                        v-model="line.unitQuantity"
                        :min="0"
                        :precision="3"
                        :controls="false"
                        class="w-full!"
                      />
                    </label>
                    <label
                      v-if="kind === 'sales_contract'"
                      class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >
                      辅助单位
                      <ElInput v-model="line.auxiliaryUnit" maxlength="30" />
                    </label>
                    <label
                      v-if="kind === 'sales_contract'"
                      class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >
                      辅助数量（2）
                      <ElInputNumber
                        v-model="line.auxiliaryQuantity2"
                        :min="0"
                        :precision="3"
                        :controls="false"
                        class="w-full!"
                      />
                    </label>
                    <label
                      v-if="kind === 'sales_contract'"
                      class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >
                      辅助单位（2）
                      <ElInput v-model="line.auxiliaryUnit2" maxlength="30" />
                    </label>
                    <label
                      v-if="kind === 'sales_quotation'"
                      class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >
                      表价（元）
                      <ElInputNumber
                        v-model="line.listPrice"
                        :min="0"
                        :precision="2"
                        :controls="false"
                        class="w-full!"
                      />
                    </label>
                  </template>
                  <label
                    v-if="kind === 'shipping_notice' || kind === 'loading'"
                    class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                  >
                    仓库
                    <ElInput v-model="line.warehouse" maxlength="100" />
                  </label>
                  <label
                    v-if="kind === 'shipping_notice' || kind === 'loading'"
                    class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                  >
                    仓位
                    <ElInput v-model="line.location" maxlength="100" />
                  </label>
                  <label
                    v-if="kind === 'shipping_notice' || kind === 'loading'"
                    class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                  >
                    要货日期
                    <ElDatePicker
                      v-model="line.needDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]">
                    备注
                    <ElInput v-model="line.remark" maxlength="300" />
                  </label>
                </div>
                <div
                  class="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[var(--el-border-color-lighter)] pt-3 text-xs text-[var(--art-gray-600)]"
                >
                  <span>金额 {{ formatCurrencyValue(lineAmount(line)) }}</span>
                  <span>税额 {{ formatCurrencyValue(lineTax(line)) }}</span>
                  <span>价税合计 {{ formatCurrencyValue(lineAmount(line) + lineTax(line)) }}</span>
                  <span
                    >含税单价
                    {{ formatCurrencyValue(line.unitPrice * (1 + line.taxRate / 100)) }}</span
                  >
                </div>
              </div>
            </div>
          </ArtSectionCard>
        </ElTabPane>

        <ElTabPane v-if="config.useFees" label="费用明细" name="fees">
          <ArtSectionCard title="费用明细" subtitle="费用定义来自当前租户的报价费用清单。">
            <template #actions>
              <ElButton
                type="primary"
                plain
                size="small"
                :disabled="!expenseOptions.length"
                @click="addFee"
              >
                添加费用
              </ElButton>
            </template>
            <div v-if="!fees.length" class="py-6 text-center text-sm text-[var(--art-gray-600)]">
              暂无费用明细。
            </div>
            <div v-else class="flex flex-col gap-2">
              <div
                v-for="(fee, index) in fees"
                :key="index"
                class="grid min-w-0 grid-cols-1 items-center gap-2 rounded-lg border border-[var(--el-border-color-light)] p-3 sm:grid-cols-[minmax(0,1fr)_130px_130px_auto]"
              >
                <ElSelect
                  v-model="fee.expenseId"
                  filterable
                  class="w-full"
                  :aria-label="`第 ${index + 1} 项费用`"
                >
                  <ElOption
                    v-for="expense in expenseOptions"
                    :key="expense.id"
                    :label="expense.expenseName"
                    :value="expense.id"
                    :disabled="
                      fees.some(
                        (item, feeIndex) => feeIndex !== index && item.expenseId === expense.id
                      )
                    "
                  />
                </ElSelect>
                <ElInputNumber
                  v-model="fee.amount"
                  :min="0"
                  :precision="2"
                  :controls="false"
                  class="w-full!"
                  :aria-label="`第 ${index + 1} 项费用金额`"
                />
                <ElInputNumber
                  v-model="fee.cost"
                  :min="0"
                  :precision="2"
                  :controls="false"
                  class="w-full!"
                  :aria-label="`第 ${index + 1} 项费用成本`"
                />
                <ElButton type="danger" text @click="fees.splice(index, 1)">移除</ElButton>
              </div>
            </div>
          </ArtSectionCard>
        </ElTabPane>

        <ElTabPane v-if="config.usePaymentPlans" label="收款计划" name="payments">
          <ArtSectionCard title="收款计划" subtitle="选择按比例或按金额记录每期应收。">
            <template #actions>
              <ElButton type="primary" plain size="small" @click="addPaymentPlan"
                >添加计划</ElButton
              >
            </template>
            <div
              v-if="!paymentPlans.length"
              class="py-6 text-center text-sm text-[var(--art-gray-600)]"
            >
              暂无收款计划。
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
          >
            <template #actions>
              <ElButton type="primary" plain size="small" @click="addDeliveryPlan"
                >添加计划</ElButton
              >
            </template>
            <div
              v-if="!deliveryPlans.length"
              class="py-6 text-center text-sm text-[var(--art-gray-600)]"
            >
              暂无发货计划。
            </div>
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
          <ArtSectionCard title="合同条款" subtitle="记录双方确认的条款标题与正文。">
            <template #actions>
              <ElButton type="primary" plain size="small" @click="addClause">添加条款</ElButton>
            </template>
            <div v-if="!clauses.length" class="py-6 text-center text-sm text-[var(--art-gray-600)]">
              暂无合同条款。
            </div>
            <div v-else class="flex flex-col gap-3">
              <div
                v-for="(clause, index) in clauses"
                :key="clause.id"
                class="rounded-lg border border-[var(--el-border-color-light)] p-3"
              >
                <div class="mb-2 flex items-center justify-between">
                  <strong class="text-sm">第 {{ index + 1 }} 条</strong>
                  <ElButton type="danger" text size="small" @click="clauses.splice(index, 1)"
                    >移除</ElButton
                  >
                </div>
                <div class="flex min-w-0 flex-col gap-2">
                  <ElInput v-model="clause.title" maxlength="120" placeholder="条款标题" />
                  <ElInput
                    v-model="clause.content"
                    type="textarea"
                    :rows="3"
                    maxlength="4000"
                    placeholder="条款内容"
                  />
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
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useUserStore } from '@/store/modules/user'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    createScmSalesDocument,
    fetchQuoteExpenses,
    fetchScmCustomerOptions,
    fetchScmDocumentTypeOptions,
    fetchScmMaterialOptions,
    fetchScmProjectOptions,
    fetchScmRemainingSourceLines,
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
    type ScmMaterialOption,
    type ScmPaymentPlan,
    type ScmProjectOption,
    type ScmQuoteExpense,
    type ScmSalesDocument,
    type ScmSalesDocumentWrite
  } from '@scm/api'
  import { scmDocumentConfigs } from '../document-config'

  defineOptions({ name: 'ScmDocumentDialog' })

  interface OpenOptions {
    kind: ScmDocumentKind
    record?: ScmSalesDocument
    copy?: boolean
    tenantOptions: Array<{ label: string; value: string }>
    effectiveTenantId: string | null
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
  const headerFormRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const detailsFormRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const kind = ref<ScmDocumentKind>('sales_quotation')
  const config = computed(() => scmDocumentConfigs[kind.value])
  const recordId = ref<string>()
  const tenantOptions = ref<OpenOptions['tenantOptions']>([])
  const projectOptions = ref<ScmProjectOption[]>([])
  const customerOptions = ref<ScmCustomerOption[]>([])
  const materialOptions = ref<ScmMaterialOption[]>([])
  const expenseOptions = ref<ScmQuoteExpense[]>([])
  const documentTypeOptions = ref<ScmDocumentTypeOption[]>([])
  const sourceOptions = ref<ScmSalesDocument[]>([])
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
  const fees = ref<ScmDocumentFee[]>([])
  const paymentPlans = ref<ScmPaymentPlan[]>([])
  const deliveryPlans = ref<ScmDeliveryPlan[]>([])
  const clauses = ref<ScmContractClause[]>([])

  const discountOptions = computed(() => userStore.getDictMap?.scmDiscountMode ?? [])
  function lineAmount(line: ScmDocumentLine): number {
    return (
      Math.round(line.quantity * line.unitPrice * (1 - (line.discountRate || 0) / 100) * 100) / 100
    )
  }

  function lineTax(line: ScmDocumentLine): number {
    return Math.round(lineAmount(line) * line.taxRate) / 100
  }

  const previewTotal = computed(() => {
    const subtotal = lines.value.reduce((sum, line) => sum + lineAmount(line), 0)
    const feeTotal = fees.value.reduce((sum, fee) => sum + Number(fee.amount || 0), 0)
    const projectExtras =
      kind.value === 'project_quotation'
        ? Number(details.packageFee || 0) + Number(details.transportFee || 0)
        : 0
    return subtotal + feeTotal + projectExtras
  })

  const headerRules: FormRules<HeaderModel> = {
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    documentNo: [
      { required: true, message: '请输入单据编号', trigger: 'blur' },
      { min: 2, max: 60, message: '单据编号长度应为 2–60 个字符', trigger: 'blur' }
    ],
    projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
    customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
    documentDate: [{ required: true, message: '请选择单据日期', trigger: 'change' }]
  }

  const detailRules = computed<FormRules<ScmDocumentDetails>>(() => {
    const rules: FormRules<ScmDocumentDetails> = {}
    for (const field of config.value.fields) {
      if (field.required)
        rules[field.key] = [{ required: true, message: `请填写${field.label}`, trigger: 'blur' }]
    }
    return rules
  })

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
    { label: config.value.numberLabel, key: 'documentNo', type: 'input', props: { maxlength: 60 } },
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
        placeholder: '按 MDM 单据类型配置参选'
      }
    },
    {
      label: '项目名称',
      key: 'projectId',
      type: 'select',
      props: {
        options: projectOptions.value.map((item) => ({
          label: `${item.projectName}（${item.projectCode}）`,
          value: item.id
        })),
        filterable: true,
        loading: referencesLoading.value,
        disabled: !header.tenantId || Boolean(header.sourceId),
        placeholder: '请选择项目'
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
    ...(config.value.sourceKind
      ? [
          {
            label: config.value.sourceLabel || '来源单据',
            key: 'sourceId',
            type: 'select',
            span: 12,
            props: {
              options: sourceOptions.value.map((item) => ({
                label: `${item.documentNo} · ${item.project?.projectName || item.status}`,
                value: item.id
              })),
              filterable: true,
              clearable: !config.value.sourceRequired,
              loading: referencesLoading.value,
              disabled: !header.tenantId,
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
    ...(config.value.usePaymentPlans
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
    ...config.value.fields.map((field): FormItem => ({
      label: field.label,
      key: field.key,
      type: field.type,
      span: field.span ?? 12,
      props:
        field.type === 'date'
          ? { type: 'date', valueFormat: 'YYYY-MM-DD', class: 'w-full!', clearable: true }
          : field.type === 'number'
            ? { min: 0, precision: 2, controls: false, class: 'w-full!' }
            : field.type === 'select'
              ? { options: userStore.getDictMap?.[field.dictionary || ''] ?? [], clearable: true }
              : { maxlength: field.span === 24 ? 500 : 120 }
    }))
  ])

  async function loadReferences(tenantId: string): Promise<void> {
    const revision = ++referenceRevision
    projectOptions.value = []
    customerOptions.value = []
    materialOptions.value = []
    expenseOptions.value = []
    documentTypeOptions.value = []
    sourceOptions.value = []
    if (!tenantId) return
    referencesLoading.value = true
    try {
      const [projects, customers, materials, expenses, types, sources] = await Promise.all([
        fetchScmProjectOptions(tenantId),
        fetchScmCustomerOptions(tenantId),
        fetchScmMaterialOptions(tenantId),
        fetchQuoteExpenses({ tenantId }),
        fetchScmDocumentTypeOptions(tenantId),
        config.value.sourceKind
          ? fetchScmSourceOptions(config.value.sourceKind, tenantId)
          : Promise.resolve(null)
      ])
      if (revision !== referenceRevision) return
      projectOptions.value = projects.data ?? []
      customerOptions.value = customers.data ?? []
      materialOptions.value = materials.data ?? []
      expenseOptions.value = expenses.data ?? []
      documentTypeOptions.value = types.data ?? []
      sourceOptions.value = (sources?.data ?? []).filter((item) => {
        if (config.value.sourceKind === 'shipping_notice')
          return ['shipped', 'completed'].includes(item.status)
        if (config.value.sourceKind === 'sales_order')
          return ['approved', 'fulfilling'].includes(item.status)
        if (config.value.sourceKind === 'sales_contract') return item.status === 'effective'
        if (config.value.sourceKind === 'project_quotation') return item.status === 'effective'
        return item.status === 'effective'
      })
    } catch {
      if (revision === referenceRevision) ElMessage.warning('关联主数据加载失败，请稍后重试')
    } finally {
      if (revision === referenceRevision) referencesLoading.value = false
    }
  }

  function newLine(): ScmDocumentLine {
    return {
      lineId: crypto.randomUUID(),
      materialId: '',
      materialCode: '',
      materialDescription: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: 0,
      costUnitPrice: 0,
      gift: false,
      discountMode: 'none',
      discountRate: 0
    }
  }

  function addLine(): void {
    if (lines.value.length >= 200) return
    lines.value.push(newLine())
  }

  function selectMaterial(line: ScmDocumentLine, id: string): void {
    const material = materialOptions.value.find((item) => item.id === id)
    line.materialCode = material?.materialCode ?? ''
    line.materialDescription = material?.materialDescription ?? line.materialDescription
    line.specification = material?.specification ?? ''
    line.salesUnit = material?.unit ?? ''
  }

  function addFee(): void {
    const next = expenseOptions.value.find(
      (expense) => !fees.value.some((item) => item.expenseId === expense.id)
    )
    if (next) fees.value.push({ expenseId: next.id, amount: 0, cost: 0 })
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

  function addDeliveryPlan(): void {
    deliveryPlans.value.push({
      id: crypto.randomUUID(),
      location: '',
      address: '',
      needDate: '',
      leadDays: 0,
      plannedDate: '',
      quantity: 1
    })
  }

  function addClause(): void {
    clauses.value.push({ id: crypto.randomUUID(), title: '', content: '' })
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
      ElMessage.warning('请添加至少一行物料明细')
      activeTab.value = 'lines'
      return false
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
    if (clauses.value.some((clause) => !clause.title.trim() || !clause.content.trim())) {
      ElMessage.warning('请完整填写合同条款')
      activeTab.value = 'clauses'
      return false
    }
    return true
  }

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await headerFormRef.value?.validate())) return false
      if (config.value.fields.length && !(await detailsFormRef.value?.validate())) return false
      if (!validateDetails()) return false
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
        details: { ...details },
        lines: lines.value,
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
    if (config.value.usePaymentPlans && !details.paymentPlanMode) details.paymentPlanMode = 'amount'
    lines.value =
      options.record?.lines.map((line) => ({
        ...line,
        lineId: options.copy ? crypto.randomUUID() : line.lineId
      })) ?? []
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
    void loadReferences(header.tenantId)
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
  }

  watch(
    () => header.tenantId,
    (tenantId, previous) => {
      if (preparing || tenantId === previous) return
      header.projectId = ''
      header.customerId = ''
      header.sourceId = ''
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
    }
  )
  watch(
    () => header.sourceId,
    (sourceId) => {
      if (!preparing && sourceId) void applySource(sourceId)
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
