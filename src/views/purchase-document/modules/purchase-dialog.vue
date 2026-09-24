<template>
  <ArtDialog ref="dialogRef" size="xl">
    <template #subtitle>维护单据表头、物料明细与履约安排；金额由数据库统一核算。</template>
    <div class="flex min-w-0 flex-col gap-4">
      <ElAlert v-if="initializationError" type="error" :closable="false" show-icon>
        <template #title>基础数据加载失败</template>
        <div class="flex flex-wrap items-center gap-2">
          <span>{{ initializationError }}</span>
          <ElButton link type="primary" @click="retryOpeningData">重新加载</ElButton>
        </div>
      </ElAlert>
      <ElAlert
        v-if="referencesLoaded && header.tenantId && !projects.length"
        type="warning"
        :closable="false"
        show-icon
        title="当前租户暂无可用项目"
        description="采购单据需要关联项目。请在页头切换到有项目的业务租户后重新打开，或先在 MDM 主数据维护项目。"
      />
      <ArtSectionCard title="单据基本信息" subtitle="确定采购业务的项目、供应商与交付时间。">
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
              :data="projects"
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
          <template #supplierId>
            <ArtTableSingleSelect
              v-model="header.supplierId"
              :data="suppliers"
              :columns="supplierPickerColumns"
              row-key="id"
              :label-key="supplierPickerLabel"
              title="参选供应商"
              search-placeholder="搜索供应商编码或名称"
              :disabled="!header.tenantId || Boolean(header.sourceId)"
              empty-text="暂无可选供应商"
              empty-description="请先在 MDM 供应商主数据中维护供应商。"
              dialog-width="lg"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ArtSectionCard
        v-if="config.fields.length"
        title="业务信息"
        subtitle="填写当前单据需要的补充信息。"
      >
        <ArtForm
          v-model="details"
          :items="detailItems"
          :span="12"
          :gutter="20"
          label-width="112px"
          :show-reset="false"
          :show-submit="false"
        >
          <template #buyer>
            <ArtEmployeeSelect
              v-model="details.buyer"
              v-model:selected-data="selectedEmployees.buyer"
              :tenant-id="header.tenantId"
              placeholder="选择采购员"
              @change="(_, rows) => setEmployeeName('buyer', rows)"
            />
          </template>
          <template #applicant>
            <ArtEmployeeSelect
              v-model="details.applicant"
              v-model:selected-data="selectedEmployees.applicant"
              :tenant-id="header.tenantId"
              placeholder="选择申请人"
              @change="(_, rows) => setEmployeeName('applicant', rows)"
            />
          </template>
          <template #keeper>
            <ArtEmployeeSelect
              v-model="details.keeper"
              v-model:selected-data="selectedEmployees.keeper"
              :tenant-id="header.tenantId"
              placeholder="选择库管员"
              @change="(_, rows) => setEmployeeName('keeper', rows)"
            />
          </template>
          <template #ownerId>
            <ArtTableSingleSelect
              v-if="details.ownerType === 'supplier'"
              v-model="details.ownerId"
              :data="suppliers"
              :columns="supplierPickerColumns"
              row-key="id"
              :label-key="supplierPickerLabel"
              title="参选货主供应商"
              search-placeholder="搜索供应商编码或名称"
              :disabled="!header.tenantId"
            />
            <ArtTableSingleSelect
              v-else-if="details.ownerType === 'customer'"
              v-model="details.ownerId"
              :data="customers"
              :columns="customerPickerColumns"
              row-key="id"
              :label-key="customerPickerLabel"
              title="参选货主客户"
              search-placeholder="搜索客户编码或名称"
              :disabled="!header.tenantId"
            />
            <ElInput v-else model-value="" disabled placeholder="自有无需选择货主" />
          </template>
        </ArtForm>
      </ArtSectionCard>
      <ElTabs v-model="activeTab" class="min-w-0">
        <ElTabPane
          :label="
            kind === 'purchase_contract'
              ? '合同明细'
              : kind === 'purchase_order'
                ? '订单物料明细'
                : kind === 'receipt_notice'
                  ? '收料物料明细'
                  : '物料明细'
          "
          name="lines"
        >
          <ArtSectionCard
            :title="
              kind === 'purchase_contract'
                ? '合同明细'
                : kind === 'purchase_order'
                  ? '订单物料明细'
                  : kind === 'receipt_notice'
                    ? '收料物料明细'
                    : '物料明细'
            "
            :subtitle="
              kind === 'purchase_contract'
                ? '参选报价明细或批量添加物料；金额随输入实时核算。'
                : '可多选物料；选单时按剩余数量筛选来源明细。'
            "
            :empty="kind !== 'purchase_contract' && !lines.length"
            :empty-title="kind === 'purchase_contract' ? '暂无合同明细' : '暂无物料明细'"
            :empty-description="
              materials.length
                ? '选择来源单据或添加物料后开始填写。'
                : '当前租户暂无可选物料，请先在 MDM 主数据维护物料。'
            "
            :min-height="144"
            :empty-visual-size="72"
          >
            <template #actions>
              <div class="flex flex-wrap gap-2">
                <ElButton
                  v-if="kind === 'purchase_order' || kind === 'receipt_notice'"
                  :disabled="kind === 'purchase_order' ? !header.projectId : !header.supplierId"
                  @click="kind === 'purchase_order' ? importQuotationLines() : importSourceLines()"
                  ><ArtSvgIcon icon="ri:file-list-3-line" />{{
                    kind === 'receipt_notice' ? '参选采购订单' : '选单'
                  }}</ElButton
                >
                <ElButton
                  v-if="kind === 'purchase_contract' || kind === 'purchase_request'"
                  :disabled="!header.projectId"
                  @click="importQuotationLines"
                  ><ArtSvgIcon icon="ri:file-search-line" />{{
                    kind === 'purchase_contract' ? '参选报价明细' : '选单'
                  }}</ElButton
                >
                <ElButton
                  v-if="kind !== 'receipt_notice' && config.permissions.RecentPrice"
                  v-auth="config.permissions.RecentPrice"
                  :disabled="!lines.length"
                  @click="applyRecentPrices"
                  ><ArtSvgIcon icon="ri:price-tag-3-line" />获取最近采购价</ElButton
                >
                <ArtMaterialSelect
                  v-if="
                    kind === 'purchase_contract' ||
                    kind === 'purchase_request' ||
                    kind === 'purchase_order' ||
                    kind === 'receipt_notice'
                  "
                  class="w-auto!"
                  v-model:model-values="selectedMaterialIds"
                  multiple
                  reset-draft-on-open
                  :api-fn="materialPickerApi"
                  :categories="materialCategories"
                  :title="kind === 'purchase_contract' ? '添加物料' : '参选物料'"
                  :subtitle="
                    kind === 'purchase_contract'
                      ? '按物料分类筛选，选择后批量带入合同明细与基本单位。'
                      : '按物料分类筛选，选择后批量带入物料明细。'
                  "
                  :disabled="!header.tenantId"
                  @confirm="addContractMaterials"
                >
                  <template #trigger="{ open }">
                    <ElButton type="primary" plain :disabled="!header.tenantId" @click="open">
                      <ArtSvgIcon icon="ri:add-line" />{{
                        kind === 'purchase_contract' ? '添加物料' : '参选物料'
                      }}
                    </ElButton>
                  </template>
                </ArtMaterialSelect>
                <ElButton
                  v-else
                  type="primary"
                  plain
                  :disabled="!header.tenantId || !materials.length"
                  @click="addSelectedMaterials"
                >
                  <ArtSvgIcon icon="ri:add-line" />参选物料
                </ElButton>
              </div>
            </template>
            <ArtTable
              ref="lineTableRef"
              :data="lines"
              :columns="lineColumns"
              :pagination="false"
              row-key="lineId"
              table-layout="fixed"
              border
              show-summary
              :summary-method="lineSummaryMethod"
              :max-height="460"
              scrollbar-always-on
              class="scm-editable-table"
              empty-text="暂无物料明细"
              empty-description="选择来源单据或参选物料后开始填写。"
            />
          </ArtSectionCard>
        </ElTabPane>
        <ElTabPane v-if="config.tabs.includes('payments')" label="付款计划" name="payments">
          <ArtSectionCard
            title="付款计划"
            subtitle="按比例或金额安排应付款，切换方式时自动换算。"
            :empty="
              kind !== 'purchase_contract' && kind !== 'purchase_order' && !paymentPlans.length
            "
            empty-title="暂无付款计划"
            empty-description="添加计划后可按比例或金额安排付款。"
            :min-height="144"
            :empty-visual-size="72"
          >
            <template #actions
              ><ElButton type="primary" plain @click="addPayment"
                ><ArtSvgIcon icon="ri:add-line" />添加计划</ElButton
              ></template
            >
            <div v-if="kind === 'purchase_contract' || kind === 'purchase_order'" class="min-w-0">
              <div
                class="mb-3 flex flex-wrap items-center gap-3 text-sm text-[var(--art-gray-700)]"
              >
                <span>按比例（%）</span>
                <ElSwitch
                  :model-value="details.paymentMode === 'ratio'"
                  aria-label="按比例编制付款计划"
                  @update:model-value="
                    (enabled) => (details.paymentMode = enabled === true ? 'ratio' : 'amount')
                  "
                />
                <span class="text-xs text-[var(--art-gray-600)]">{{
                  details.paymentMode === 'ratio'
                    ? '填写应付比例，自动计算金额'
                    : '填写应付金额，自动计算比例'
                }}</span>
              </div>
              <ArtTable
                :data="paymentPlans"
                :columns="paymentColumns"
                :pagination="false"
                row-key="id"
                table-layout="fixed"
                border
                :max-height="380"
                scrollbar-always-on
                empty-text="暂无付款计划"
                empty-description="点击“添加计划”设置每期应付。"
              />
            </div>
            <div v-else class="mb-4 flex items-center gap-3 text-sm"
              ><span>计划方式</span
              ><ElRadioGroup v-model="details.paymentMode">
                <ElRadioButton label="ratio" value="ratio">按比例</ElRadioButton
                ><ElRadioButton label="amount" value="amount">按金额</ElRadioButton>
              </ElRadioGroup></div
            >
            <template v-if="kind !== 'purchase_contract' && kind !== 'purchase_order'">
              <div
                v-for="(plan, index) in paymentPlans"
                :key="plan.id"
                class="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-[var(--el-border-color-light)] p-3 sm:grid-cols-2 xl:grid-cols-5"
              >
                <ElDatePicker
                  v-model="plan.dueDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="到期日期"
                  class="w-full!"
                />
                <ElInputNumber
                  v-model="plan.ratio"
                  :min="0"
                  :max="100"
                  :precision="2"
                  :controls="false"
                  :disabled="details.paymentMode !== 'ratio'"
                  class="w-full!"
                  aria-label="应付比例"
                />
                <ElInputNumber
                  v-model="plan.amount"
                  :min="0"
                  :precision="2"
                  :controls="false"
                  :disabled="details.paymentMode === 'ratio'"
                  class="w-full!"
                  aria-label="应付金额"
                />
                <ElCheckbox v-model="plan.isAdvance">预付</ElCheckbox>
                <ArtIconButton
                  icon="ri:delete-bin-line"
                  label="移除付款计划"
                  tone="danger"
                  @click="paymentPlans.splice(index, 1)"
                />
                <ElInput
                  v-model="plan.remark"
                  placeholder="计划备注"
                  class="sm:col-span-2 xl:col-span-5"
                />
              </div>
            </template>
          </ArtSectionCard>
        </ElTabPane>
        <ElTabPane v-if="config.tabs.includes('deliveries')" label="交货计划" name="deliveries">
          <ArtSectionCard
            title="交货计划"
            :empty="!deliveryPlans.length"
            empty-title="暂无交货计划"
            empty-description="添加计划后可记录交货日期、数量与地点。"
            :min-height="144"
            :empty-visual-size="72"
          >
            <template #actions
              ><ElButton type="primary" plain @click="addDelivery"
                ><ArtSvgIcon icon="ri:add-line" />添加计划</ElButton
              ></template
            >
            <ArtTable
              v-if="kind === 'purchase_order'"
              :data="deliveryPlans"
              :columns="deliveryColumns"
              :pagination="false"
              row-key="id"
              table-layout="fixed"
              border
              :max-height="380"
              scrollbar-always-on
              empty-text="暂无交货计划"
              empty-description="点击“添加计划”，再参选订单物料明细。"
            />
            <div
              v-else
              v-for="(plan, index) in deliveryPlans"
              :key="plan.id"
              class="mb-3 rounded-lg border border-[var(--el-border-color-light)] p-3"
            >
              <div class="mb-3 flex items-center justify-between gap-2">
                <strong class="text-sm">第 {{ index + 1 }} 期交货</strong>
                <div
                  ><ArtIconButton
                    icon="ri:file-copy-line"
                    label="复制交货计划"
                    @click="copyDelivery(plan)" />
                  <ArtIconButton
                    icon="ri:delete-bin-line"
                    label="移除交货计划"
                    tone="danger"
                    @click="deliveryPlans.splice(index, 1)"
                /></div>
              </div>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                  >计划交货日期
                  <ElDatePicker
                    v-model="plan.plannedDate"
                    type="date"
                    value-format="YYYY-MM-DD"
                    class="w-full!"
                  />
                </label>
                <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                  >计划交货数量
                  <ElInputNumber
                    v-model="plan.quantity"
                    :min="0.001"
                    :precision="3"
                    :controls="false"
                    class="w-full!"
                  />
                </label>
                <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                  >计划交货基本数量
                  <ElInputNumber
                    v-model="plan.plannedBaseQuantity"
                    :min="0"
                    :precision="3"
                    :controls="false"
                    class="w-full!"
                  />
                </label>
                <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                  >交货地点
                  <ElInput v-model="plan.location" placeholder="交货地点" />
                </label>
                <label
                  class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)] sm:col-span-2"
                  >交货地址
                  <ElInput v-model="plan.address" placeholder="交货地址" />
                </label>
                <label
                  class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)] sm:col-span-2"
                  >备注
                  <ElInput v-model="plan.remark" placeholder="备注" />
                </label>
              </div>
            </div>
          </ArtSectionCard>
        </ElTabPane>
        <ElTabPane v-if="config.tabs.includes('clauses')" label="合同条款" name="clauses">
          <ArtSectionCard
            title="合同条款"
            :empty="kind !== 'purchase_contract' && !clauses.length"
            empty-title="暂无合同条款"
            empty-description="添加条款后明确双方的履约约定。"
            :min-height="144"
            :empty-visual-size="72"
          >
            <template #actions
              ><ElButton type="primary" plain @click="addClause"
                ><ArtSvgIcon icon="ri:add-line" />添加条款</ElButton
              ></template
            >
            <ArtTable
              v-if="kind === 'purchase_contract'"
              :data="clauses"
              :columns="clauseColumns"
              :pagination="false"
              row-key="id"
              table-layout="fixed"
              border
              :max-height="420"
              scrollbar-always-on
              empty-text="暂无合同条款"
              empty-description="点击“添加条款”选择字典条款并填写内容。"
            />
            <div
              v-else
              v-for="(clause, index) in clauses"
              :key="clause.id"
              class="mb-3 flex flex-col gap-3 rounded-lg border border-[var(--el-border-color-light)] p-3"
            >
              <div class="flex gap-2"
                ><ElSelect v-model="clause.title" placeholder="选择条款" class="min-w-0 flex-1">
                  <ElOption
                    v-for="item in clauseOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  /> </ElSelect
                ><ArtIconButton
                  icon="ri:delete-bin-line"
                  label="移除合同条款"
                  tone="danger"
                  @click="clauses.splice(index, 1)"
                />
              </div>
              <ElInput
                v-model="clause.content"
                type="textarea"
                :rows="3"
                maxlength="2000"
                show-word-limit
                placeholder="填写条款内容"
              />
            </div>
          </ArtSectionCard>
        </ElTabPane>
      </ElTabs>
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--el-color-primary-light-9)] p-4 text-sm"
      >
        <span class="text-[var(--art-gray-600)]"
          >共 {{ lines.length }} 项物料 · 数量 {{ totalQuantity }}</span
        >
        <strong class="text-lg text-[var(--el-color-primary)]"
          >预估价税合计 {{ formatCurrencyValue(totalAmount) }}</strong
        >
      </div>
    </div>
  </ArtDialog>
  <ArtDialog v-if="kind === 'receipt_notice'" ref="materialDialogRef" size="md">
    <div class="mb-3 text-sm text-[var(--art-gray-600)]">选择同一租户的物料，可一次添加多项。</div>
    <ElSelect
      v-model="selectedMaterialIds"
      multiple
      filterable
      class="w-full!"
      placeholder="搜索物料编码或名称"
    >
      <ElOption
        v-for="material in materials"
        :key="material.id"
        :label="`${material.materialCode} · ${material.materialDescription}`"
        :value="material.id"
      />
    </ElSelect>
  </ArtDialog>
  <ArtDialog ref="quotationDialogRef" :size="kind === 'receipt_notice' ? 'md' : 'xl'">
    <template v-if="kind !== 'receipt_notice'">
      <ElInput
        v-model="quotationKeyword"
        clearable
        placeholder="搜索来源单号、物料编码或描述"
        aria-label="搜索报价明细"
        class="mb-3"
      />
      <ArtTable
        :data="filteredQuotationLines"
        :columns="quotationColumns"
        :pagination="false"
        row-key="choiceId"
        border
        :max-height="420"
        empty-text="暂无可参选的来源明细"
        empty-description="请先确认当前项目已有生效的采购合同或销售报价。"
        @selection-change="selectQuotationLines"
      />
      <p class="mt-3 text-xs text-[var(--art-gray-600)]"
        >已选 {{ selectedQuotationLines.length }} 行 · 最多 200 行</p
      >
    </template>
    <template v-else>
      <div class="mb-3 text-sm text-[var(--art-gray-600)]"
        >仅显示当前项目的已生效销售报价物料。</div
      >
      <ElSelect
        v-model="selectedQuotationId"
        filterable
        class="w-full!"
        placeholder="选择销售报价单"
      >
        <ElOption
          v-for="quotation in eligibleQuotations"
          :key="quotation.id"
          :label="quotation.documentNo"
          :value="quotation.id"
        />
      </ElSelect>
    </template>
  </ArtDialog>
  <ArtDialog ref="sourceLineDialogRef" size="lg">
    <ElAlert v-if="sourceLineLoadError" type="error" :closable="false" show-icon>
      <template #title>来源明细加载失败</template>
      <ElButton link type="primary" @click="loadSourceLines">重新加载</ElButton>
    </ElAlert>
    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ElInput
        v-model="sourceLineKeyword"
        clearable
        placeholder="筛选物料、项目或采购员"
        aria-label="筛选来源明细"
      />
      <ElDatePicker
        v-model="sourceLineDateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="需求开始日期"
        end-placeholder="需求结束日期"
        class="w-full!"
      />
    </div>
    <div
      v-if="!filteredSourceLines.length"
      class="py-8 text-center text-sm text-[var(--art-gray-600)]"
    >
      当前筛选条件下没有可转换的物料。
    </div>
    <ElCheckboxGroup
      v-model="selectedSourceLineIds"
      class="flex max-h-[55vh] flex-col gap-2 overflow-y-auto"
    >
      <ElCheckbox
        v-for="line in filteredSourceLines"
        :key="line.choiceId || line.sourceLineId"
        :value="line.choiceId || line.sourceLineId"
        class="h-auto! w-full! rounded-lg border border-[var(--el-border-color-light)] p-3!"
      >
        <div class="min-w-0 whitespace-normal">
          <strong class="block break-words">{{ line.materialDescription }}</strong>
          <span class="text-xs text-[var(--art-gray-600)]">
            {{ line.sourceDocumentNo
            }}<span v-if="line.sourceLineNo"> · 第 {{ line.sourceLineNo }} 行</span> ·
            {{ line.materialCode }} · 可转换 {{ line.quantity }} {{ line.unit }}
            <span v-if="line.projectName"> · {{ line.projectName }}</span>
            <span v-if="line.needDate"> · 需求 {{ line.needDate }}</span>
          </span>
        </div>
      </ElCheckbox>
    </ElCheckboxGroup>
  </ArtDialog>
  <ArtTableMultipleSelect
    v-if="kind === 'receipt_notice'"
    ref="receiptOrderSelectRef"
    v-model="selectedSourceLineIds"
    :data="availableSourceLines"
    :columns="receiptOrderColumns"
    row-key="choiceId"
    label-key="materialDescription"
    title="参选采购订单"
    subtitle="按供应商筛选未交完的已审核采购订单，可跨订单多选明细。"
    search-placeholder="搜索订单编号、项目或物料"
    :show-pagination="false"
    reset-draft-on-open
    dialog-width="xl"
    :empty-text="receiptSourceLoading ? '正在加载可参选明细…' : '暂无可参选的采购订单明细'"
    :empty-description="
      receiptSourceLoading
        ? '正在查询当前供应商的采购订单剩余数量。'
        : '请先确认供应商，再检查采购订单的审核状态与剩余交货数量。'
    "
    @confirm="confirmReceiptOrderLines"
  >
    <template #trigger><span class="sr-only">参选采购订单</span></template>
  </ArtTableMultipleSelect>
</template>

<script setup lang="tsx">
  import dayjs from 'dayjs'
  import { omit, uniq } from 'lodash-es'
  import {
    ElButton,
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
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type { DataSelectColumn } from '@/components/core/forms/art-data-select/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtMaterialSelect, {
    type MaterialSelectRecord
  } from '@/components/business/art-material-select/index.vue'
  import type { ColumnOption } from '@/types'
  import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useUserStore } from '@/store/modules/user'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    createScmPurchaseDocument,
    fetchScmPurchaseDocument,
    fetchScmDocumentTypeOptions,
    fetchScmMaterialOptions,
    fetchScmPurchaseMaterialCandidates,
    fetchScmPurchaseMaterialCategories,
    fetchScmPurchaseWarehouseOptions,
    fetchScmPurchaseBinOptions,
    fetchScmPurchaseCustomerOptions,
    fetchScmReceiptBatchOptions,
    fetchScmPurchaseProjectOptions,
    fetchScmProjectSections,
    fetchScmPurchaseMenuIds,
    fetchScmPurchaseRemainingLines,
    generateScmReceiptBatchNo,
    fetchScmReceiptOrderLineChoices,
    fetchScmPurchaseSourceOptions,
    fetchScmRecentPurchasePrices,
    fetchScmSourceOptions,
    fetchScmSupplierOptions,
    updateScmPurchaseDocument,
    type ScmDocumentTypeOption,
    type ScmDocumentLine,
    type ScmMaterialOption,
    type ScmPurchaseMaterialCandidate,
    type ScmPurchaseMaterialCategory,
    type ScmPurchaseProjectOption,
    type ScmReceiptOrderLineChoice,
    type ScmPurchaseWarehouseOption,
    type ScmPurchaseBinOption,
    type ScmPurchaseCustomerOption,
    type ScmPurchaseClause,
    type ScmPurchaseDeliveryPlan,
    type ScmPurchaseDetails,
    type ScmPurchaseDocument,
    type ScmPurchaseKind,
    type ScmPurchaseLine,
    type ScmPurchasePaymentPlan,
    type ScmPurchaseWrite,
    type ScmSalesDocument,
    type ScmSupplierOption
  } from '@scm/api'
  import { purchaseConfigs } from '../purchase-config'
  import '../../scm-editable-table.css'

  interface OpenOptions {
    kind: ScmPurchaseKind
    record?: ScmPurchaseDocument
    copy?: boolean
    generate?: 'batch' | 'serial'
    initialSource?: ScmPurchaseDocument
    initialSourceId?: string
    openLineSelector?: boolean
    tenantOptions: Array<{ label: string; value: string }>
    effectiveTenantId: string | null
  }
  interface HeaderModel {
    tenantId: string
    documentNo: string
    documentTypeId: string
    projectId: string
    supplierId: string
    sourceId: string
    documentDate: string
    deliveryDate: string
    remark: string
  }

  defineOptions({ name: 'ScmPurchaseDialog' })
  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const { shouldExposeTenantField } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<OpenOptions>>()
  const materialDialogRef = ref<ArtDialogExpose>()
  const quotationDialogRef = ref<ArtDialogExpose>()
  const sourceLineDialogRef = ref<ArtDialogExpose>()
  const receiptOrderSelectRef = ref<{
    open: () => Promise<void>
    reload: () => Promise<void>
  }>()
  const headerFormRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const lineTableRef = ref<ArtTableExpose>()
  const kind = ref<ScmPurchaseKind>('purchase_contract')
  const config = computed(() => purchaseConfigs[kind.value])
  const recordId = ref<string>()
  const tenantOptions = ref<OpenOptions['tenantOptions']>([])
  const projects = ref<ScmPurchaseProjectOption[]>([])
  const projectSections = ref<
    Array<{
      id: string
      projectId: string
      constructionNo: string
      sectionName: string
      status: 'active' | 'closed'
    }>
  >([])
  const suppliers = ref<ScmSupplierOption[]>([])
  const materials = ref<ScmMaterialOption[]>([])
  const materialCategories = ref<ScmPurchaseMaterialCategory[]>([])
  const warehouses = ref<ScmPurchaseWarehouseOption[]>([])
  const bins = ref<ScmPurchaseBinOption[]>([])
  const customers = ref<ScmPurchaseCustomerOption[]>([])
  const documentTypes = ref<ScmDocumentTypeOption[]>([])
  const sourceDocuments = ref<ScmPurchaseDocument[]>([])
  const sourceLineSource = shallowRef<ScmPurchaseDocument>()
  const sourceLineLoadError = ref(false)
  const receiptSourceLoading = ref(false)
  const quotations = ref<ScmSalesDocument[]>([])
  const salesContracts = ref<ScmSalesDocument[]>([])
  const salesOrders = ref<ScmSalesDocument[]>([])
  const purchaseContracts = ref<ScmPurchaseDocument[]>([])
  const selectedMaterialIds = ref<string[]>([])
  const selectedQuotationId = ref('')
  interface QuotationLineChoice extends ScmDocumentLine {
    choiceId: string
    documentNo: string
    sourceKind: string
    sourceSalesDocumentId?: string
    sourcePurchaseDocumentId?: string
    sourcePurchaseRequestId?: string
    selectedLineNo: number
  }
  const quotationKeyword = ref('')
  const selectedQuotationLines = ref<QuotationLineChoice[]>([])
  const availableSourceLines = ref<Array<ScmPurchaseLine & Partial<ScmReceiptOrderLineChoice>>>([])
  const selectedSourceLineIds = ref<string[]>([])
  const sourceLineKeyword = ref('')
  const sourceLineDateRange = ref<string[]>([])
  const selectAfterSupplier = ref(false)
  const receiptSourceOrderId = ref('')
  const activeTab = ref('lines')
  const loading = ref(false)
  const referencesLoaded = ref(false)
  const initializationError = ref('')
  let preparing = false
  let referenceRevision = 0
  let openRevision = 0
  let currentOpenOptions: OpenOptions | undefined

  const emptyHeader = (): HeaderModel => ({
    tenantId: '',
    documentNo: '',
    documentTypeId: '',
    projectId: '',
    supplierId: '',
    sourceId: '',
    documentDate: dayjs().format('YYYY-MM-DD'),
    deliveryDate: '',
    remark: ''
  })
  const header = reactive<HeaderModel>(emptyHeader())
  const details = reactive<ScmPurchaseDetails>({})
  const selectedEmployees = reactive<
    Record<'buyer' | 'applicant' | 'keeper', EmployeeIntegrationItem[]>
  >({ buyer: [], applicant: [], keeper: [] })
  const lines = ref<ScmPurchaseLine[]>([])
  const paymentPlans = ref<ScmPurchasePaymentPlan[]>([])
  const deliveryPlans = ref<ScmPurchaseDeliveryPlan[]>([])
  const clauses = ref<ScmPurchaseClause[]>([])
  const clauseOptions = computed(() => userStore.getDictMap?.scmContractClause ?? [])
  const discountOptions = computed(() => userStore.getDictMap?.scmDiscountMode ?? [])
  const eligibleQuotations = computed(() =>
    quotations.value.filter(
      (item) => item.projectId === header.projectId && item.status === 'effective'
    )
  )
  const eligibleSalesSources = computed(() =>
    kind.value === 'purchase_request' || kind.value === 'purchase_order'
      ? [
          ...eligibleQuotations.value,
          ...salesContracts.value.filter(
            (item) => item.projectId === header.projectId && item.status === 'effective'
          ),
          ...(kind.value === 'purchase_order'
            ? salesOrders.value.filter(
                (item) =>
                  item.projectId === header.projectId &&
                  ['approved', 'effective'].includes(item.status)
              )
            : [])
        ]
      : eligibleQuotations.value
  )
  const eligiblePurchaseContracts = computed(() =>
    kind.value === 'purchase_request' || kind.value === 'purchase_order'
      ? purchaseContracts.value.filter(
          (item) => item.projectId === header.projectId && item.status === 'effective'
        )
      : []
  )
  const eligiblePurchaseRequests = computed(() =>
    kind.value === 'purchase_order'
      ? sourceDocuments.value.filter(
          (item) => item.projectId === header.projectId && item.kind === 'purchase_request'
        )
      : []
  )
  const quotationColumns: ColumnOption<QuotationLineChoice>[] = [
    { type: 'selection', width: 48 },
    { prop: 'sourceKind', label: '来源类型', width: 105 },
    { prop: 'documentNo', label: '来源单号', minWidth: 160 },
    { prop: 'selectedLineNo', label: '源行号', width: 95 },
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 220, showOverflowTooltip: true },
    { prop: 'quantity', label: '来源数量', width: 105, align: 'right' }
  ]
  const filteredQuotationLines = computed(() => {
    const purchaseIds = new Set(
      materials.value.filter((item) => item.materialSource === 'purchase').map((item) => item.id)
    )
    const keyword = quotationKeyword.value.trim().toLocaleLowerCase()
    const salesLines = eligibleSalesSources.value.flatMap((quotation) =>
      quotation.lines
        .filter((line) => purchaseIds.has(line.materialId))
        .map((line, index) => ({
          ...line,
          choiceId: `${quotation.id}:${line.lineId || index}`,
          documentNo: quotation.documentNo,
          sourceKind:
            quotation.kind === 'sales_order'
              ? '销售订单'
              : quotation.kind === 'sales_contract'
                ? '销售合同'
                : '销售报价',
          sourceSalesDocumentId: quotation.id,
          selectedLineNo: line.lineNo ?? (index + 1) * 10
        }))
    )
    const contractLines: QuotationLineChoice[] = eligiblePurchaseContracts.value.flatMap(
      (contract) =>
        contract.lines
          .filter((line) => purchaseIds.has(line.materialId))
          .map((line, index) => ({
            lineId: line.lineId,
            materialId: line.materialId,
            materialCode: line.materialCode,
            materialDescription: line.materialDescription,
            specification: line.specification,
            salesUnit: line.unit,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            choiceId: `${contract.id}:${line.lineId || index}`,
            documentNo: contract.documentNo,
            sourceKind: '采购合同',
            sourcePurchaseDocumentId: contract.id,
            selectedLineNo: line.lineNo ?? (index + 1) * 10
          }))
    )
    const requestLines: QuotationLineChoice[] = eligiblePurchaseRequests.value.flatMap((request) =>
      request.lines
        .map((line, index) => ({
          lineId: line.lineId,
          materialId: line.materialId,
          materialCode: line.materialCode,
          materialDescription: line.materialDescription,
          specification: line.specification,
          salesUnit: line.unit,
          quantity: Number(line.remainingQuantity ?? line.quantity),
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          choiceId: `${request.id}:${line.lineId || index}`,
          documentNo: request.documentNo,
          sourceKind: '采购申请',
          sourcePurchaseRequestId: request.id,
          selectedLineNo: line.lineNo ?? (index + 1) * 10
        }))
        .filter((line) => line.quantity > 0)
    )
    return [...salesLines, ...contractLines, ...requestLines].filter(
      (line) =>
        !keyword ||
        `${line.documentNo} ${line.materialCode} ${line.materialDescription}`
          .toLocaleLowerCase()
          .includes(keyword)
    )
  })
  function selectQuotationLines(rows: QuotationLineChoice[]): void {
    selectedQuotationLines.value = rows
  }
  const projectPickerColumns: DataSelectColumn[] = [
    { prop: 'projectCode', label: '项目编码', minWidth: 150 },
    { prop: 'projectName', label: '项目名称', minWidth: 230 },
    { prop: 'customer.customerName', label: '客户', minWidth: 160 },
    { prop: 'salesperson.employeeName', label: '销售员', minWidth: 120 },
    { prop: 'owner.employeeName', label: '负责人', minWidth: 120 },
    {
      prop: 'projectStatus',
      label: '项目状态',
      minWidth: 110,
      formatter: (row) =>
        userStore.getDictMap?.mdmProjectStatus?.find((item) => item.value === row.projectStatus)
          ?.label ||
        row.projectStatus ||
        '—'
    }
  ]
  const projectPickerLabel = (row: { projectCode?: string; projectName?: string }): string =>
    `${row.projectName || '未命名项目'}（${row.projectCode || '无编码'}）`
  const supplierPickerColumns: DataSelectColumn[] = [
    { prop: 'supplierCode', label: '供应商编码', minWidth: 150 },
    { prop: 'supplierName', label: '供应商全称', minWidth: 260 }
  ]
  const receiptOrderColumns: DataSelectColumn[] = [
    { prop: 'sourceDocumentNo', label: '采购订单号', minWidth: 170 },
    { prop: 'sourceLineNo', label: '订单行号', width: 90 },
    { prop: 'projectName', label: '项目名称', minWidth: 145 },
    { prop: 'materialCode', label: '物料编码', minWidth: 125 },
    { prop: 'materialDescription', label: '物料名称', minWidth: 190 },
    { prop: 'quantity', label: '未交数量', minWidth: 105 },
    { prop: 'unit', label: '单位', width: 80 }
  ]
  const supplierPickerLabel = (row: { supplierCode?: string; supplierName?: string }): string =>
    `${row.supplierName || '未命名供应商'}（${row.supplierCode || '无编码'}）`
  const customerPickerColumns: DataSelectColumn[] = [
    { prop: 'customerCode', label: '客户编码', minWidth: 150 },
    { prop: 'customerName', label: '客户名称', minWidth: 260 }
  ]
  const customerPickerLabel = (row: { customerCode?: string; customerName?: string }): string =>
    `${row.customerName || '未命名客户'}（${row.customerCode || '无编码'}）`
  const batchPickerColumns: DataSelectColumn[] = [
    { prop: 'batchNo', label: '批号', minWidth: 190 },
    { prop: 'quantity', label: '现存数量', minWidth: 120 },
    { prop: 'receivedAt', label: '首次入库时间', minWidth: 180 }
  ]
  async function batchPickerApi(line: ScmPurchaseLine, params: DataSelectFetchParams) {
    if (!header.tenantId || !line.materialId) return { data: [], total: 0 }
    return fetchScmReceiptBatchOptions(header.tenantId, line.materialId, {
      keyword: params.keyword,
      warehouseId: line.warehouseId,
      ownerType: line.ownerType,
      ownerId: line.ownerId
    })
  }
  async function materialPickerApi(params: DataSelectFetchParams) {
    if (!header.tenantId) return { data: [], total: 0 }
    const selectedCategory = String(params.filters.categoryId || '')
    const categoryIds = selectedCategory
      ? (() => {
          const ids = [selectedCategory]
          for (let index = 0; index < ids.length; index++)
            ids.push(
              ...materialCategories.value
                .filter((category) => category.parentId === ids[index])
                .map((category) => category.id)
            )
          return ids
        })()
      : undefined
    const result = await fetchScmPurchaseMaterialCandidates(header.tenantId, {
      keyword: params.keyword,
      categoryIds,
      from: (params.page - 1) * params.pageSize,
      to: params.page * params.pageSize - 1
    })
    const names = new Map(
      materialCategories.value.map((category) => [category.id, category.categoryName])
    )
    return {
      ...result,
      data: result.data.map((material) => ({
        ...material,
        category: { categoryName: names.get(material.categoryId || '') || '未分类' }
      }))
    }
  }
  const filteredSourceLines = computed(() => {
    const source = sourceDocuments.value.find((item) => item.id === header.sourceId)
    const keyword = sourceLineKeyword.value.trim().toLocaleLowerCase()
    const [start, end] = sourceLineDateRange.value
    return availableSourceLines.value.filter((line) => {
      if (start && (!line.needDate || line.needDate < start)) return false
      if (end && (!line.needDate || line.needDate > end)) return false
      if (!keyword) return true
      return [
        line.materialCode,
        line.materialDescription,
        source?.project?.projectName,
        source?.details.buyerName,
        source?.details.applicantName,
        line.sourceDocumentNo,
        line.projectName
      ].some((value) => value?.toLocaleLowerCase().includes(keyword))
    })
  })
  const totalQuantity = computed(() =>
    lines.value.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
  )
  const totalAmount = computed(() => lines.value.reduce((sum, line) => sum + lineTotal(line), 0))
  function lineTotal(line: ScmPurchaseLine) {
    return lineSubtotal(line) + lineTaxAmount(line)
  }
  function lineSubtotal(line: ScmPurchaseLine) {
    if (line.gift) return 0
    if (kind.value === 'purchase_order')
      return (
        Math.round(
          (Number(line.quantity || 0) * Number(line.unitPrice || 0) - lineDiscountAmount(line)) *
            100
        ) / 100
      )
    return (
      Math.round(
        Number(line.quantity || 0) *
          Number(line.unitPrice || 0) *
          (1 - Number(line.discountRate || 0) / 100) *
          100
      ) / 100
    )
  }
  function lineDiscountAmount(line: ScmPurchaseLine) {
    if (line.gift) return 0
    if (kind.value === 'purchase_order')
      return (
        Math.round(
          Number(line.quantity || 0) * lineTaxedUnitPrice(line) * Number(line.discountRate || 0)
        ) / 100
      )
    return (
      Math.round(
        Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.discountRate || 0)
      ) / 100
    )
  }
  function lineTaxAmount(line: ScmPurchaseLine) {
    if (line.gift) return 0
    if (kind.value === 'purchase_order')
      return (
        Math.round(
          Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.taxRate || 0)
        ) / 100
      )
    return (
      Math.round(
        Number(line.quantity || 0) *
          Number(line.unitPrice || 0) *
          (1 - Number(line.discountRate || 0) / 100) *
          Number(line.taxRate || 0)
      ) / 100
    )
  }
  function lineTaxedUnitPrice(line: ScmPurchaseLine) {
    if (line.gift) return 0
    if (kind.value === 'purchase_order')
      return Number(
        line.taxInclusiveUnitPrice ??
          Math.round(Number(line.unitPrice || 0) * (1 + Number(line.taxRate || 0) / 100) * 10000) /
            10000
      )
    return (
      Number(line.unitPrice || 0) *
      (1 - Number(line.discountRate || 0) / 100) *
      (1 + Number(line.taxRate || 0) / 100)
    )
  }
  function updateTaxInclusiveUnitPrice(line: ScmPurchaseLine): void {
    line.taxInclusiveUnitPrice =
      Math.round(Number(line.unitPrice || 0) * (1 + Number(line.taxRate || 0) / 100) * 10000) /
      10000
  }
  function updateUnitPriceFromTaxInclusive(line: ScmPurchaseLine): void {
    line.unitPrice =
      Math.round(
        (Number(line.taxInclusiveUnitPrice || 0) / (1 + Number(line.taxRate || 0) / 100)) * 10000
      ) / 10000
  }

  const paymentColumns = computed<ColumnOption<ScmPurchasePaymentPlan>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 65 },
    ...(kind.value === 'purchase_order'
      ? ([
          {
            prop: 'contractNo',
            label: '合同编号',
            minWidth: 170,
            formatter: (row: ScmPurchasePaymentPlan) => (
              <ElInput v-model={row.contractNo} maxlength={80} placeholder="采购合同号" />
            )
          }
        ] as ColumnOption<ScmPurchasePaymentPlan>[])
      : []),
    {
      prop: 'isAdvance',
      label: '是否预付',
      width: 100,
      align: 'center',
      formatter: (row) => <ElCheckbox v-model={row.isAdvance} aria-label="是否预付" />
    },
    {
      prop: 'dueDate',
      label: '到期日',
      width: 175,
      formatter: (row) => (
        <ElDatePicker
          v-model={row.dueDate}
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          class="w-full!"
          aria-label="付款到期日"
        />
      )
    },
    {
      prop: 'ratio',
      label: '应付比例（%）',
      width: 150,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.ratio}
          min={0}
          max={100}
          precision={2}
          controls={false}
          disabled={details.paymentMode !== 'ratio'}
          class="w-full!"
          aria-label="应付比例"
        />
      )
    },
    {
      prop: 'amount',
      label: '应付金额（元）',
      width: 170,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.amount}
          min={0}
          precision={2}
          controls={false}
          disabled={details.paymentMode === 'ratio'}
          class="w-full!"
          aria-label="应付金额"
        />
      )
    },
    {
      prop: 'remark',
      label: '备注',
      minWidth: 170,
      formatter: (row) => <ElInput v-model={row.remark} maxlength={200} placeholder="可选" />
    },
    {
      prop: 'operation',
      label: '操作',
      width: 72,
      fixed: 'right',
      formatter: (row) => (
        <ArtIconButton
          icon="ri:delete-bin-line"
          label="移除付款计划"
          tone="danger"
          onClick={() => paymentPlans.value.splice(paymentPlans.value.indexOf(row), 1)}
        />
      )
    }
  ])
  const deliveryColumns = computed<ColumnOption<ScmPurchaseDeliveryPlan>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 65 },
    {
      prop: 'lineId',
      label: '订单物料',
      minWidth: 210,
      formatter: (row) => (
        <ElSelect
          v-model={row.lineId}
          filterable
          class="w-full!"
          placeholder="参选订单物料"
          onChange={() => fillDeliveryFromLine(row)}
        >
          {lines.value.map((line) => (
            <ElOption
              key={line.lineId}
              value={line.lineId}
              label={`${line.lineNo || '—'} · ${line.materialCode} · ${line.materialDescription}`}
            />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'plannedDate',
      label: '计划交货日期',
      width: 175,
      formatter: (row) => (
        <ElDatePicker
          v-model={row.plannedDate}
          type="date"
          valueFormat="YYYY-MM-DD"
          class="w-full!"
          aria-label="计划交货日期"
        />
      )
    },
    { prop: 'unit', label: '采购单位', width: 100, formatter: (row) => row.unit || '—' },
    {
      prop: 'quantity',
      label: '计划交货数量',
      width: 145,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.quantity}
          min={0.001}
          precision={3}
          controls={false}
          class="w-full!"
          aria-label="计划交货数量"
          onChange={() => updateDeliveryBaseQuantity(row)}
        />
      )
    },
    {
      prop: 'plannedBaseQuantity',
      label: '计划交货基本数量',
      width: 145,
      align: 'right',
      formatter: (row) => row.plannedBaseQuantity ?? '—'
    },
    {
      prop: 'deliveredQuantity',
      label: '已交货数量',
      width: 120,
      align: 'right',
      formatter: (row) => Number(row.deliveredQuantity || 0)
    },
    {
      prop: 'remainingQuantity',
      label: '未交货数量',
      width: 120,
      align: 'right',
      formatter: (row) =>
        Math.max(0, Number(row.quantity || 0) - Number(row.deliveredQuantity || 0))
    },
    {
      prop: 'recentDeliveryDate',
      label: '最近交货日期',
      width: 150,
      formatter: (row) => row.recentDeliveryDate || '—'
    },
    {
      prop: 'location',
      label: '交货地点',
      minWidth: 160,
      formatter: (row) => (
        <ElInput v-model={row.location} maxlength={120} placeholder="填写交货地点" />
      )
    },
    {
      prop: 'address',
      label: '交货地址',
      minWidth: 180,
      formatter: (row) => (
        <ElInput v-model={row.address} maxlength={200} placeholder="填写详细地址" />
      )
    },
    {
      prop: 'remark',
      label: '备注',
      minWidth: 170,
      formatter: (row) => <ElInput v-model={row.remark} maxlength={200} placeholder="可选" />
    },
    {
      prop: 'operation',
      label: '操作',
      width: 72,
      fixed: 'right',
      formatter: (row) => (
        <ArtIconButton
          icon="ri:delete-bin-line"
          label="移除交货计划"
          tone="danger"
          onClick={() => deliveryPlans.value.splice(deliveryPlans.value.indexOf(row), 1)}
        />
      )
    }
  ])
  const clauseColumns = computed<ColumnOption<ScmPurchaseClause>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 65 },
    {
      prop: 'title',
      label: '合同条款',
      width: 230,
      formatter: (row) => (
        <ElSelect v-model={row.title} placeholder="参选合同条款" class="w-full!">
          {clauseOptions.value.map((item) => (
            <ElOption key={item.value} value={item.value} label={item.label} />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'content',
      label: '条款内容',
      minWidth: 420,
      formatter: (row) => (
        <ElInput
          v-model={row.content}
          type="textarea"
          rows={2}
          maxlength={2000}
          placeholder="填写条款内容"
          aria-label="条款内容"
        />
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 72,
      fixed: 'right',
      formatter: (row) => (
        <ArtIconButton
          icon="ri:delete-bin-line"
          label="移除合同条款"
          tone="danger"
          onClick={() => clauses.value.splice(clauses.value.indexOf(row), 1)}
        />
      )
    }
  ])

  const lineColumns = computed<ColumnOption<ScmPurchaseLine>[]>(() => [
    {
      type: 'expand',
      prop: 'extra',
      label: '',
      width: 48,
      formatter: (row) => (
        <div class="grid min-w-0 grid-cols-2 gap-3 p-4 text-xs md:grid-cols-4">
          <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
            需求日期
            <ElDatePicker
              v-model={row.needDate}
              type="date"
              value-format="YYYY-MM-DD"
              class="w-full!"
            />
          </label>
          {kind.value === 'purchase_order' && (
            <>
              <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                需求部门
                <ElInput v-model={row.department} maxlength={120} placeholder="填写需求部门" />
              </label>
              <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                申请人
                <ArtEmployeeSelect
                  v-model={row.applicant}
                  tenantId={header.tenantId}
                  placeholder="参选员工"
                  onChange={(_, rows) => {
                    row.applicantName = rows[0]?.employeeName || ''
                  }}
                />
              </label>
            </>
          )}
          <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
            辅助数量
            <ElInputNumber
              v-model={row.auxiliaryQuantity}
              min={0}
              precision={3}
              controls={false}
              disabled={kind.value === 'receipt_notice' || kind.value === 'purchase_order'}
              class="w-full!"
            />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
            辅助单位
            <ElInput
              v-model={row.auxiliaryUnit}
              maxlength={30}
              placeholder="可选"
              disabled={kind.value === 'receipt_notice' || kind.value === 'purchase_order'}
            />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
            辅助数量（2）
            <ElInputNumber
              v-model={row.auxiliaryQuantity2}
              min={0}
              precision={3}
              controls={false}
              disabled={kind.value === 'receipt_notice' || kind.value === 'purchase_order'}
              class="w-full!"
            />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
            辅助单位（2）
            <ElInput
              v-model={row.auxiliaryUnit2}
              maxlength={30}
              placeholder="可选"
              disabled={kind.value === 'receipt_notice' || kind.value === 'purchase_order'}
            />
          </label>
          {(kind.value === 'purchase_order' || kind.value === 'receipt_notice') && (
            <>
              <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                仓库
                <ElSelect
                  v-model={row.warehouseId}
                  filterable
                  clearable
                  placeholder="参选仓库"
                  class="w-full!"
                  onChange={() => {
                    row.binId = undefined
                    row.location = ''
                  }}
                >
                  {warehouses.value.map((warehouse) => (
                    <ElOption
                      key={warehouse.id}
                      value={warehouse.id}
                      label={`${warehouse.warehouseCode} · ${warehouse.warehouseName}`}
                    />
                  ))}
                </ElSelect>
              </label>
              <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                仓位
                <ElSelect
                  v-model={row.binId}
                  filterable
                  clearable
                  placeholder="参选仓位"
                  class="w-full!"
                  disabled={!row.warehouseId}
                >
                  {bins.value
                    .filter((bin) => bin.warehouseId === row.warehouseId)
                    .map((bin) => (
                      <ElOption
                        key={bin.id}
                        value={bin.id}
                        label={`${bin.binCode} · ${bin.binName}`}
                      />
                    ))}
                </ElSelect>
              </label>
            </>
          )}
          {kind.value === 'receipt_notice' && (
            <>
              <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                批号
                <ArtTableSingleSelect
                  v-model={row.batchNo}
                  selectedData={row.batchNo ? [{ batchNo: row.batchNo }] : []}
                  apiFn={(params: DataSelectFetchParams) => batchPickerApi(row, params)}
                  columns={batchPickerColumns}
                  rowKey="batchNo"
                  labelKey="batchNo"
                  title="批号主档"
                  searchPlaceholder="搜索批号"
                  disabled={!header.tenantId || !row.materialId}
                  emptyText="暂无现有批号"
                  emptyDescription="可通过旁边的“生成批号”按物料规则创建新批号。"
                  dialogWidth="lg"
                  showPagination={false}
                />
              </label>
              <div class="flex flex-wrap items-end gap-2">
                {config.value.permissions.GenerateBatch &&
                  materials.value.find((material) => material.id === row.materialId)
                    ?.batchManagementEnabled &&
                  hasAuth(config.value.permissions.GenerateBatch) && (
                    <ElButton onClick={() => void generateBatch(row)}>生成批号</ElButton>
                  )}
                {config.value.permissions.GenerateSerial &&
                  hasAuth(config.value.permissions.GenerateSerial) && (
                    <ElButton onClick={() => generateSerial(row)}>生成序列号</ElButton>
                  )}
              </div>
              <span class="self-end text-[var(--art-gray-600)]">
                已生成 {row.serialNumbers?.length ?? 0} 个序列号
              </span>
            </>
          )}
          <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)] md:col-span-2">
            备注
            <ElInput v-model={row.remark} maxlength={200} placeholder="可选" />
          </label>
          <div class="flex items-end gap-4 text-[var(--art-gray-700)] md:col-span-2">
            <span>含税单价 {formatCurrencyValue(lineTaxedUnitPrice(row))}</span>
            <span>折扣额 {formatCurrencyValue(lineDiscountAmount(row))}</span>
          </div>
        </div>
      )
    },
    ...(kind.value === 'purchase_contract' ||
    kind.value === 'purchase_request' ||
    kind.value === 'purchase_order' ||
    kind.value === 'receipt_notice'
      ? [
          {
            prop: 'lineNo',
            label: '行号',
            width: 100,
            fixed: 'left' as const,
            required: true,
            formatter: (row: ScmPurchaseLine) => (
              <ElInputNumber
                v-model={row.lineNo}
                min={1}
                precision={0}
                controls={false}
                class="w-full!"
                aria-label="明细行号"
              />
            )
          }
        ]
      : []),
    {
      prop: 'materialId',
      label: '物料编码',
      width: 215,
      fixed: 'left',
      required: true,
      requiredMessage: ({ rowIndex }) => `第 ${rowIndex + 1} 行未选择物料`,
      formatter: (row) => (
        <div class="min-w-0 w-full">
          <ElSelect
            v-model={row.materialId}
            filterable
            disabled={Boolean(row.sourceLineId)}
            placeholder="选择物料"
            class="w-full!"
            aria-label="物料编码"
            onChange={(id: string) => selectMaterial(row, id)}
          >
            {materials.value.map((material) => (
              <ElOption
                key={material.id}
                value={material.id}
                label={`${material.materialCode} · ${material.materialDescription}`}
              />
            ))}
          </ElSelect>
          {row.sourceDocumentNo && (
            <small
              class="block truncate pt-1 text-[var(--art-gray-600)]"
              title={row.sourceDocumentNo}
            >
              来源 {row.sourceDocumentNo}
            </small>
          )}
        </div>
      )
    },
    { prop: 'materialDescription', label: '物料描述', minWidth: 180, showOverflowTooltip: true },
    {
      prop: 'quantity',
      label: '数量',
      width: 120,
      align: 'right',
      required: true,
      rules: {
        validator: ({ value }) => Number.isFinite(Number(value)) && Number(value) > 0,
        message: '数量必须大于 0'
      },
      formatter: (row) => (
        <ElInputNumber
          v-model={row.quantity}
          min={0.001}
          precision={3}
          controls={false}
          class="w-full!"
          aria-label="数量"
          onChange={() => {
            recalculateReceiptUnits(row)
            recalculateOrderUnits(row)
          }}
        />
      )
    },
    {
      prop: 'unit',
      label: '采购单位',
      width: 110,
      formatter: (row) => (
        <ElInput
          v-model={row.unit}
          maxlength={30}
          placeholder="计量单位"
          disabled={kind.value === 'purchase_request'}
          aria-label="采购单位"
        />
      )
    },
    ...(kind.value === 'receipt_notice' || kind.value === 'purchase_order'
      ? [
          {
            prop: 'stockUnit',
            label: '库存单位',
            width: 110,
            formatter: (row: ScmPurchaseLine) => row.stockUnit || '—'
          },
          {
            prop: 'baseQuantity',
            label: '基本数量',
            width: 115,
            align: 'right' as const,
            formatter: (row: ScmPurchaseLine) => row.baseQuantity ?? '—'
          }
        ]
      : []),
    ...(kind.value === 'purchase_contract' ||
    kind.value === 'purchase_order' ||
    kind.value === 'receipt_notice'
      ? [
          {
            prop: 'baseUnit',
            label: '基本单位',
            width: 120,
            formatter: (row: ScmPurchaseLine) => (
              <ElInput
                v-model={row.baseUnit}
                maxlength={30}
                placeholder="基本单位"
                aria-label="基本单位"
                disabled={kind.value === 'receipt_notice' || kind.value === 'purchase_order'}
              />
            )
          }
        ]
      : []),
    ...(kind.value === 'purchase_request'
      ? ([
          {
            prop: 'reason',
            label: '需求原因',
            minWidth: 180,
            formatter: (row: ScmPurchaseLine) => (
              <ElInput v-model={row.reason} maxlength={200} placeholder="填写需求原因" />
            )
          },
          {
            prop: 'suggestedSupplierId',
            label: '建议供应商',
            minWidth: 195,
            formatter: (row: ScmPurchaseLine) => (
              <ElSelect
                v-model={row.suggestedSupplierId}
                filterable
                clearable
                placeholder="参选供应商"
                class="w-full!"
              >
                {suppliers.value.map((supplier) => (
                  <ElOption
                    key={supplier.id}
                    value={supplier.id}
                    label={`${supplier.supplierName}（${supplier.supplierCode}）`}
                  />
                ))}
              </ElSelect>
            )
          },
          {
            prop: 'sourceDocumentNo',
            label: '源单据',
            minWidth: 155,
            showOverflowTooltip: true
          },
          {
            prop: 'sourceLineNo',
            label: '源单据行号',
            width: 115
          }
        ] as ColumnOption<ScmPurchaseLine>[])
      : []),
    ...(kind.value === 'receipt_notice'
      ? ([
          { prop: 'sourceDocumentNo', label: '源单据', minWidth: 155, showOverflowTooltip: true },
          { prop: 'sourceLineNo', label: '源单据行号', width: 115 },
          {
            prop: 'ownerType',
            label: '货主类型',
            width: 135,
            formatter: (row: ScmPurchaseLine) => (
              <ElSelect
                v-model={row.ownerType}
                class="w-full!"
                aria-label="货主类型"
                onChange={() => {
                  row.ownerId = undefined
                }}
              >
                <ElOption value="self" label="自有" />
                <ElOption value="supplier" label="供应商" />
                <ElOption value="customer" label="客户" />
              </ElSelect>
            )
          },
          {
            prop: 'ownerId',
            label: '货主',
            minWidth: 180,
            formatter: (row: ScmPurchaseLine) =>
              row.ownerType === 'self' || !row.ownerType ? (
                '—'
              ) : (
                <ElSelect
                  v-model={row.ownerId}
                  filterable
                  clearable
                  class="w-full!"
                  aria-label="货主"
                  placeholder="参选货主"
                >
                  {(row.ownerType === 'supplier'
                    ? suppliers.value.map((item) => ({
                        id: item.id,
                        label: `${item.supplierCode} · ${item.supplierName}`
                      }))
                    : customers.value.map((item) => ({
                        id: item.id,
                        label: `${item.customerCode} · ${item.customerName}`
                      }))
                  ).map((item) => (
                    <ElOption key={item.id} value={item.id} label={item.label} />
                  ))}
                </ElSelect>
              )
          }
        ] as ColumnOption<ScmPurchaseLine>[])
      : []),
    ...(kind.value === 'purchase_order'
      ? ([
          {
            prop: 'contractNo',
            label: '采购合同编号',
            minWidth: 165,
            formatter: (row: ScmPurchaseLine) => (
              <ElInput v-model={row.contractNo} maxlength={80} placeholder="自动带入或填写" />
            )
          },
          { prop: 'sourceDocumentNo', label: '来源单据', minWidth: 165, showOverflowTooltip: true },
          { prop: 'sourceLineNo', label: '源行号', width: 95 }
        ] as ColumnOption<ScmPurchaseLine>[])
      : []),
    {
      prop: 'unitPrice',
      label: '单价（元）',
      width: 140,
      align: 'right',
      required: kind.value !== 'purchase_request' && kind.value !== 'purchase_order',
      rules: {
        validator: ({ value }) => Number.isFinite(Number(value)) && Number(value) >= 0,
        message: '单价不能小于 0'
      },
      formatter: (row) => (
        <ElInputNumber
          v-model={row.unitPrice}
          min={0}
          precision={kind.value === 'purchase_order' ? 4 : 2}
          controls={false}
          class="w-full!"
          aria-label="单价"
          onChange={() => {
            if (kind.value === 'purchase_order') updateTaxInclusiveUnitPrice(row)
          }}
        />
      )
    },
    ...(kind.value === 'purchase_order'
      ? ([
          {
            prop: 'taxInclusiveUnitPrice',
            label: '含税单价（元）',
            width: 155,
            align: 'right' as const,
            formatter: (row: ScmPurchaseLine) => (
              <ElInputNumber
                v-model={row.taxInclusiveUnitPrice}
                min={0}
                precision={4}
                controls={false}
                class="w-full!"
                aria-label="含税单价"
                onChange={() => updateUnitPriceFromTaxInclusive(row)}
              />
            )
          }
        ] as ColumnOption<ScmPurchaseLine>[])
      : []),
    {
      prop: 'taxRate',
      label: '税率（%）',
      width: 120,
      align: 'right',
      required: kind.value !== 'purchase_request',
      rules: {
        validator: ({ value }) =>
          Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100,
        message: '税率须为 0–100%'
      },
      formatter: (row) =>
        kind.value === 'purchase_request' || kind.value === 'purchase_order' ? (
          <ElSelect
            v-model={row.taxRate}
            placeholder="参选税率"
            class="w-full!"
            aria-label="税率"
            onChange={() => {
              if (kind.value === 'purchase_order') updateTaxInclusiveUnitPrice(row)
            }}
          >
            {(userStore.getDictMap?.scmTaxRate ?? []).map((item) => (
              <ElOption key={item.value} value={Number(item.value)} label={item.label} />
            ))}
          </ElSelect>
        ) : (
          <ElInputNumber
            v-model={row.taxRate}
            min={0}
            max={100}
            precision={2}
            controls={false}
            class="w-full!"
            aria-label="税率"
          />
        )
    },
    {
      prop: 'discountMode',
      label: '折扣方式',
      width: 135,
      formatter: (row) => (
        <ElSelect
          v-model={row.discountMode}
          placeholder="无折扣"
          class="w-full!"
          aria-label="折扣方式"
          onChange={(value: string) => {
            if (value === 'none') row.discountRate = 0
          }}
        >
          {discountOptions.value.map((item) => (
            <ElOption key={item.value} value={item.value} label={item.label} />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'discountRate',
      label: kind.value === 'purchase_order' ? '单位折扣（率）' : '折扣率（%）',
      width: 135,
      align: 'right',
      formatter: (row) => (
        <ElInputNumber
          v-model={row.discountRate}
          min={0}
          max={100}
          precision={2}
          controls={false}
          disabled={!row.discountMode || row.discountMode === 'none'}
          class="w-full!"
          aria-label="折扣率"
        />
      )
    },
    ...(kind.value === 'purchase_order'
      ? ([
          {
            prop: 'discountAmount',
            label: '折扣额（元）',
            width: 135,
            align: 'right' as const,
            formatter: (row: ScmPurchaseLine) => (
              <span class="tabular-nums">{formatCurrencyValue(lineDiscountAmount(row))}</span>
            )
          }
        ] as ColumnOption<ScmPurchaseLine>[])
      : []),
    {
      prop: 'amount',
      label: '金额（元）',
      width: 135,
      align: 'right',
      formatter: (row) => (
        <strong class="tabular-nums">{formatCurrencyValue(lineSubtotal(row))}</strong>
      )
    },
    {
      prop: 'tax',
      label: '税额（元）',
      width: 125,
      align: 'right',
      formatter: (row) => (
        <span class="tabular-nums">{formatCurrencyValue(lineTaxAmount(row))}</span>
      )
    },
    {
      prop: 'total',
      label: '价税合计（元）',
      width: 155,
      align: 'right',
      formatter: (row) => (
        <strong class="tabular-nums">{formatCurrencyValue(lineTotal(row))}</strong>
      )
    },
    {
      prop: 'gift',
      label: '赠品',
      width: 78,
      align: 'center',
      formatter: (row) => <ElCheckbox v-model={row.gift} aria-label="赠品" />
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
          label="移除物料"
          tone="danger"
          onClick={() => lines.value.splice(lines.value.indexOf(row), 1)}
        />
      )
    }
  ])

  function lineSummaryMethod({ columns }: { columns: Array<{ property?: string }> }): string[] {
    return columns.map((column) => {
      if (column.property === 'materialId') return '合计'
      if (column.property === 'quantity') return String(totalQuantity.value)
      if (column.property === 'amount')
        return formatCurrencyValue(lines.value.reduce((sum, line) => sum + lineSubtotal(line), 0))
      if (column.property === 'tax')
        return formatCurrencyValue(lines.value.reduce((sum, line) => sum + lineTaxAmount(line), 0))
      if (column.property === 'total') return formatCurrencyValue(totalAmount.value)
      return ''
    })
  }

  const headerRules = computed<FormRules<HeaderModel>>(() => ({
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    documentNo: [],
    projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
    documentDate: [{ required: true, message: '请选择单据日期', trigger: 'change' }]
  }))
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
              placeholder: '选择所属租户'
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
        disabled:
          kind.value === 'purchase_contract' ||
          kind.value === 'purchase_request' ||
          kind.value === 'purchase_order' ||
          kind.value === 'receipt_notice',
        placeholder:
          kind.value === 'purchase_contract' ||
          kind.value === 'purchase_request' ||
          kind.value === 'purchase_order' ||
          kind.value === 'receipt_notice'
            ? '保存后按月度编号规则自动生成'
            : undefined
      }
    },
    {
      label: '单据类型',
      key: 'documentTypeId',
      type: 'select',
      props: {
        options: documentTypes.value
          .filter((item) => item.menuId === menuIds.value[kind.value])
          .map((item) => ({ label: item.documentTypeName, value: item.id })),
        filterable: true,
        clearable: true,
        loading: loading.value,
        placeholder: documentTypes.value.some((item) => item.menuId === menuIds.value[kind.value])
          ? '按 MDM 单据类型配置参选'
          : '当前租户尚未配置该单据类型（可留空）'
      }
    },
    {
      label: '项目名称',
      key: 'projectId',
      type: 'slot',
      props: {
        options: projects.value.map((item) => ({
          label: `${item.projectName}（${item.projectCode}）`,
          value: item.id
        })),
        filterable: true,
        disabled: !header.tenantId || Boolean(header.sourceId),
        loading: loading.value
      }
    },
    ...(kind.value !== 'purchase_request'
      ? [
          {
            label: '供应商全称',
            key: 'supplierId',
            type: 'slot',
            props: {
              options: suppliers.value.map((item) => ({
                label: `${item.supplierName}（${item.supplierCode}）`,
                value: item.id
              })),
              filterable: true,
              clearable: true,
              disabled:
                !header.tenantId || (kind.value === 'receipt_notice' && Boolean(header.sourceId)),
              loading: loading.value
            }
          } as FormItem
        ]
      : []),
    ...(config.value.sourceKind &&
    kind.value !== 'receipt_notice' &&
    kind.value !== 'purchase_order'
      ? [
          {
            label: '来源单据',
            key: 'sourceId',
            type: 'select',
            props: {
              options: sourceDocuments.value
                .filter(
                  (item) =>
                    (!header.projectId || item.projectId === header.projectId) &&
                    (!header.supplierId ||
                      !item.supplierId ||
                      item.supplierId === header.supplierId) &&
                    (kind.value === 'purchase_order' ||
                      ['approved', 'completed'].includes(item.status))
                )
                .map((item) => ({
                  label: `${item.documentNo} · ${item.project?.projectName || ''}`,
                  value: item.id
                })),
              filterable: true,
              clearable: true,
              disabled: !header.tenantId || Boolean(recordId.value),
              loading: loading.value,
              placeholder: '选择来源并带入未转换明细'
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
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const menuIds = ref<Record<string, string>>({})
  const detailItems = computed<FormItem[]>(() =>
    config.value.fields.map((field): FormItem => ({
      label: field.label,
      key: field.key,
      type: field.key === 'ownerId' ? 'slot' : field.type,
      span: field.span ?? 12,
      props:
        field.type === 'date'
          ? { type: 'date', valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
          : field.type === 'select'
            ? field.key === 'contractStatus'
              ? { options: userStore.getDictMap?.scmPurchaseContractStatus ?? [], disabled: true }
              : field.key === 'ownerType'
                ? { options: userStore.getDictMap?.mdmBusinessOwnerType ?? [] }
                : field.key === 'constructionNo'
                  ? {
                      options: projectSections.value
                        .filter((section) => section.projectId === header.projectId)
                        .map((section) => ({
                          label: `${section.constructionNo} · ${section.sectionName}`,
                          value: section.constructionNo,
                          disabled: section.status !== 'active'
                        })),
                      clearable: true,
                      filterable: true,
                      disabled: !header.projectId,
                      placeholder: header.projectId ? '选择项目施工号' : '请先选择项目'
                    }
                  : {
                      options: userStore.getDictMap?.scmContractEffectiveness ?? [],
                      disabled: true
                    }
            : { maxlength: field.span === 24 ? 500 : 120 }
    }))
  )

  async function loadReferences(tenantId: string): Promise<boolean> {
    const revision = ++referenceRevision
    referencesLoaded.value = false
    projects.value = []
    projectSections.value = []
    suppliers.value = []
    materials.value = []
    materialCategories.value = []
    warehouses.value = []
    bins.value = []
    customers.value = []
    documentTypes.value = []
    sourceDocuments.value = []
    quotations.value = []
    salesContracts.value = []
    salesOrders.value = []
    purchaseContracts.value = []
    if (!tenantId) return true
    loading.value = true
    try {
      const [
        projectResult,
        supplierResult,
        materialResult,
        typeResult,
        sourceResult,
        quoteResult,
        menusResult,
        categoryResult,
        contractResult,
        purchaseContractResult,
        warehouseResult,
        binResult,
        customerResult,
        salesOrderResult,
        projectSectionResult
      ] = await Promise.all([
        fetchScmPurchaseProjectOptions(tenantId),
        fetchScmSupplierOptions(tenantId),
        fetchScmMaterialOptions(tenantId),
        fetchScmDocumentTypeOptions(tenantId),
        config.value.sourceKind
          ? fetchScmPurchaseSourceOptions(config.value.sourceKind, tenantId)
          : Promise.resolve(null),
        ['purchase_contract', 'purchase_request', 'purchase_order'].includes(kind.value)
          ? fetchScmSourceOptions('sales_quotation', tenantId)
          : Promise.resolve(null),
        fetchScmPurchaseMenuIds(),
        kind.value === 'purchase_contract' ||
        kind.value === 'purchase_request' ||
        kind.value === 'purchase_order' ||
        kind.value === 'receipt_notice'
          ? fetchScmPurchaseMaterialCategories(tenantId)
          : Promise.resolve([]),
        kind.value === 'purchase_request' || kind.value === 'purchase_order'
          ? fetchScmSourceOptions('sales_contract', tenantId)
          : Promise.resolve(null),
        kind.value === 'purchase_request' || kind.value === 'purchase_order'
          ? fetchScmPurchaseSourceOptions('purchase_contract', tenantId)
          : Promise.resolve(null),
        kind.value === 'receipt_notice' || kind.value === 'purchase_order'
          ? fetchScmPurchaseWarehouseOptions(tenantId)
          : Promise.resolve([]),
        kind.value === 'receipt_notice' || kind.value === 'purchase_order'
          ? fetchScmPurchaseBinOptions(tenantId)
          : Promise.resolve([]),
        kind.value === 'receipt_notice' || kind.value === 'purchase_order'
          ? fetchScmPurchaseCustomerOptions(tenantId)
          : Promise.resolve([]),
        kind.value === 'purchase_order'
          ? fetchScmSourceOptions('sales_order', tenantId)
          : Promise.resolve(null),
        kind.value === 'receipt_notice' ? fetchScmProjectSections(tenantId) : Promise.resolve([])
      ])
      if (revision !== referenceRevision) return false
      projects.value = projectResult
      projectSections.value = projectSectionResult
      suppliers.value = supplierResult.data ?? []
      materials.value = materialResult.data ?? []
      if (
        kind.value === 'purchase_contract' ||
        kind.value === 'purchase_request' ||
        kind.value === 'purchase_order'
      ) {
        for (const line of lines.value) {
          const material = materials.value.find((item) => item.id === line.materialId)
          if (!material) continue
          if (kind.value === 'purchase_order') {
            if (line.unit !== material.purchaseUnit) {
              const converted = toPurchaseUnit(
                material,
                line.quantity,
                line.unitPrice,
                line.unit || material.baseUnitName || material.unit || ''
              )
              if (converted) {
                line.quantity = converted.quantity
                line.unitPrice = converted.unitPrice
                line.unit = material.purchaseUnit || material.baseUnitName || material.unit || ''
              }
            }
            line.department ||= details.department
            line.applicant ||= details.applicant
            line.applicantName ||= details.applicantName
            recalculateOrderUnits(line)
            updateTaxInclusiveUnitPrice(line)
            continue
          }
          if (!line.unit || line.unit === material.unit)
            line.unit = material.baseUnitName || material.unit || ''
          if (
            kind.value === 'purchase_contract' &&
            (!line.baseUnit || line.baseUnit === material.unit)
          )
            line.baseUnit = material.baseUnitName || material.unit || ''
        }
      }
      if (kind.value === 'purchase_order') {
        for (const plan of deliveryPlans.value) {
          const line = lines.value.find((item) => item.lineId === plan.lineId) || lines.value[0]
          if (!line) continue
          if (!plan.lineId && plan.plannedBaseQuantity && line.baseQuantity)
            plan.quantity =
              Math.round((plan.plannedBaseQuantity / line.baseQuantity) * line.quantity * 1000) /
              1000
          plan.lineId = line.lineId
          plan.unit = line.unit
          updateDeliveryBaseQuantity(plan)
        }
      }
      materialCategories.value = categoryResult
      warehouses.value = warehouseResult
      bins.value = binResult
      customers.value = customerResult
      documentTypes.value = typeResult.data ?? []
      sourceDocuments.value = sourceResult?.data ?? []
      quotations.value = quoteResult?.data ?? []
      salesContracts.value = contractResult?.data ?? []
      salesOrders.value = salesOrderResult?.data ?? []
      purchaseContracts.value = purchaseContractResult?.data ?? []
      menuIds.value = Object.fromEntries(
        (menusResult.data ?? []).map((item) => [
          Object.values(purchaseConfigs).find((config) => config.menuName === item.name)?.kind ??
            item.name,
          item.id
        ])
      )
      referencesLoaded.value = true
      return true
    } catch {
      return false
    } finally {
      if (revision === referenceRevision) loading.value = false
    }
  }

  function nextLineNo(): number {
    return Math.max(0, ...lines.value.map((line) => Number(line.lineNo) || 0)) + 10
  }
  function conversionFactor(material: ScmMaterialOption, unitId?: string | null): number | null {
    if (!unitId || unitId === material.baseUnitId) return 1
    const conversion = material.unitConversions?.find((item) => item.sourceUnitId === unitId)
    if (!conversion || conversion.sourceFactor <= 0 || conversion.baseFactor <= 0) return null
    return conversion.baseFactor / conversion.sourceFactor
  }
  function sourceUnitFactor(material: ScmMaterialOption, unitName: string): number | null {
    if (!unitName || unitName === material.baseUnitName || unitName === material.unit) return 1
    const sourceUnitId = [
      [material.purchaseUnit, material.purchaseUnitId],
      [material.salesUnit, material.salesUnitId],
      [material.stockUnit, material.inventoryUnitId],
      [material.auxiliaryUnit, material.auxiliaryUnitId],
      [material.auxiliaryUnit2, material.auxiliaryUnit2Id]
    ].find(([name]) => name === unitName)?.[1]
    if (!sourceUnitId) return null
    return conversionFactor(material, sourceUnitId)
  }
  function toPurchaseUnit(
    material: ScmMaterialOption,
    quantity: number,
    unitPrice: number,
    sourceUnit: string
  ): { quantity: number; unitPrice: number } | null {
    const sourceFactor = sourceUnitFactor(material, sourceUnit)
    const purchaseFactor = conversionFactor(material, material.purchaseUnitId)
    if (!sourceFactor || !purchaseFactor) return null
    const convertedQuantity = Math.round(((quantity * sourceFactor) / purchaseFactor) * 1000) / 1000
    if (convertedQuantity <= 0) return null
    return {
      quantity: convertedQuantity,
      unitPrice: Math.round(((unitPrice * purchaseFactor) / sourceFactor) * 10000) / 10000
    }
  }
  function recalculateReceiptUnits(line: ScmPurchaseLine): void {
    if (kind.value !== 'receipt_notice') return
    const material = materials.value.find((item) => item.id === line.materialId)
    if (!material) return
    const baseFactor = conversionFactor(material, material.purchaseUnitId)
    const baseQuantity =
      baseFactor === null ? 0 : Math.round(line.quantity * baseFactor * 1000) / 1000
    line.baseUnit = material.unit || ''
    line.stockUnit = material.stockUnit || material.unit || ''
    line.baseQuantity = baseQuantity
    const stockFactor = conversionFactor(material, material.inventoryUnitId)
    line.stockQuantity =
      stockFactor === null ? 0 : Math.round((baseQuantity / stockFactor) * 1000) / 1000
    line.auxiliaryUnit = material.auxiliaryUnit || ''
    line.auxiliaryUnit2 = material.auxiliaryUnit2 || ''
    const firstFactor = conversionFactor(material, material.auxiliaryUnitId)
    const secondFactor = conversionFactor(material, material.auxiliaryUnit2Id)
    line.auxiliaryQuantity =
      material.auxiliaryUnitId && firstFactor
        ? Math.round((baseQuantity / firstFactor) * 1000) / 1000
        : 0
    line.auxiliaryQuantity2 =
      material.auxiliaryUnit2Id && secondFactor
        ? Math.round((baseQuantity / secondFactor) * 1000) / 1000
        : 0
  }
  function recalculateOrderUnits(line: ScmPurchaseLine): void {
    if (kind.value !== 'purchase_order') return
    const material = materials.value.find((item) => item.id === line.materialId)
    if (!material) return
    const purchaseFactor = conversionFactor(material, material.purchaseUnitId)
    const baseQuantity =
      purchaseFactor === null ? 0 : Math.round(line.quantity * purchaseFactor * 1000) / 1000
    line.baseUnit = material.baseUnitName || material.unit || ''
    line.stockUnit = material.stockUnit || line.baseUnit
    line.baseQuantity = baseQuantity
    const stockFactor = conversionFactor(material, material.inventoryUnitId)
    line.stockQuantity = stockFactor ? Math.round((baseQuantity / stockFactor) * 1000) / 1000 : 0
    line.auxiliaryUnit = material.auxiliaryUnit || ''
    line.auxiliaryUnit2 = material.auxiliaryUnit2 || ''
    const firstFactor = conversionFactor(material, material.auxiliaryUnitId)
    const secondFactor = conversionFactor(material, material.auxiliaryUnit2Id)
    line.auxiliaryQuantity =
      material.auxiliaryUnitId && firstFactor
        ? Math.round((baseQuantity / firstFactor) * 1000) / 1000
        : 0
    line.auxiliaryQuantity2 =
      material.auxiliaryUnit2Id && secondFactor
        ? Math.round((baseQuantity / secondFactor) * 1000) / 1000
        : 0
  }
  function applyOrderContractPrice(line: ScmPurchaseLine): void {
    if (kind.value !== 'purchase_order' || !header.supplierId) return
    const contract = purchaseContracts.value.find(
      (item) =>
        item.projectId === header.projectId &&
        item.supplierId === header.supplierId &&
        item.status === 'effective' &&
        item.lines.some((candidate) => candidate.materialId === line.materialId)
    )
    const contractLine = contract?.lines.find(
      (candidate) => candidate.materialId === line.materialId
    )
    if (!contract || !contractLine) return
    const material = materials.value.find((item) => item.id === line.materialId)
    if (!material) return
    const converted = toPurchaseUnit(material, 1, Number(contractLine.unitPrice), contractLine.unit)
    if (!converted) return
    line.unitPrice = converted.unitPrice
    line.taxRate = Number(contractLine.taxRate)
    line.contractNo = contract.documentNo
    updateTaxInclusiveUnitPrice(line)
  }
  function newLine(material?: ScmMaterialOption): ScmPurchaseLine {
    const line: ScmPurchaseLine = {
      lineId: crypto.randomUUID(),
      lineNo:
        kind.value === 'purchase_contract' ||
        kind.value === 'purchase_request' ||
        kind.value === 'purchase_order' ||
        kind.value === 'receipt_notice'
          ? nextLineNo()
          : undefined,
      materialId: material?.id ?? '',
      materialCode: material?.materialCode ?? '',
      materialDescription: material?.materialDescription ?? '',
      specification: material?.specification ?? '',
      unit:
        kind.value === 'receipt_notice'
          ? material?.purchaseUnit || material?.baseUnitName || material?.unit || ''
          : kind.value === 'purchase_order'
            ? material?.purchaseUnit || material?.baseUnitName || material?.unit || ''
            : kind.value === 'purchase_contract' || kind.value === 'purchase_request'
              ? material?.baseUnitName || material?.unit || ''
              : (material?.unit ?? ''),
      baseUnit:
        kind.value === 'purchase_contract' ||
        kind.value === 'purchase_order' ||
        kind.value === 'receipt_notice'
          ? material?.baseUnitName || material?.unit || ''
          : undefined,
      quantity: 1,
      unitPrice: 0,
      taxRate: 0,
      discountMode: 'none',
      discountRate: 0,
      gift: false,
      ownerType: kind.value === 'receipt_notice' ? 'self' : undefined
    }
    recalculateReceiptUnits(line)
    recalculateOrderUnits(line)
    if (material) applyOrderContractPrice(line)
    if (kind.value === 'purchase_order') updateTaxInclusiveUnitPrice(line)
    return line
  }
  function selectMaterial(line: ScmPurchaseLine, id: string) {
    const material = materials.value.find((item) => item.id === id)
    line.materialCode = material?.materialCode ?? ''
    line.materialDescription = material?.materialDescription ?? ''
    line.specification = material?.specification ?? ''
    line.unit =
      kind.value === 'receipt_notice'
        ? material?.purchaseUnit || material?.baseUnitName || material?.unit || ''
        : kind.value === 'purchase_order'
          ? material?.purchaseUnit || material?.baseUnitName || material?.unit || ''
          : kind.value === 'purchase_contract' || kind.value === 'purchase_request'
            ? material?.baseUnitName || material?.unit || ''
            : (material?.unit ?? '')
    if (kind.value === 'purchase_contract' || kind.value === 'purchase_order')
      line.baseUnit = material?.baseUnitName || material?.unit || ''
    recalculateReceiptUnits(line)
    recalculateOrderUnits(line)
    applyOrderContractPrice(line)
  }
  function setEmployeeName(key: 'buyer' | 'applicant' | 'keeper', rows: EmployeeIntegrationItem[]) {
    details[`${key}Name`] = rows[0]?.employeeName ?? ''
  }
  async function addSelectedMaterials() {
    selectedMaterialIds.value = []
    await materialDialogRef.value?.handleOpen(undefined, {
      title: '参选物料',
      confirmText: '添加物料',
      onConfirm: () => {
        if (!selectedMaterialIds.value.length) {
          ElMessage.warning('请选择至少一项物料')
          return false
        }
        for (const id of selectedMaterialIds.value) {
          const material = materials.value.find((item) => item.id === id)
          if (material) lines.value.push(newLine(material))
        }
        return true
      }
    })
  }
  function addContractMaterials(
    _value: string | string[] | undefined,
    rows: MaterialSelectRecord[]
  ) {
    if (lines.value.length + rows.length > 200) {
      ElMessage.warning('合同明细最多 200 行')
      return
    }
    for (const row of rows) {
      const material = row as ScmPurchaseMaterialCandidate
      const option: ScmMaterialOption = {
        id: material.id,
        tenantId: material.tenantId,
        materialCode: material.materialCode,
        materialDescription: material.description || material.materialName,
        specification: material.specificationModel,
        unit: material.basicUnit,
        baseUnitName: material.baseUnitRecord?.unitName,
        materialSource: material.materialSource,
        baseUnitId: material.baseUnitId,
        purchaseUnitId: material.purchaseUnitId,
        inventoryUnitId: material.inventoryUnitId,
        stockUnit: material.inventoryUnit?.unitName,
        purchaseUnit: material.purchaseUnit?.unitName,
        auxiliaryUnitId: material.auxiliaryUnitId,
        auxiliaryUnit2Id: material.auxiliaryUnit2Id,
        auxiliaryUnit: material.auxiliaryUnit?.unitName,
        auxiliaryUnit2: material.auxiliaryUnit2?.unitName,
        unitConversions: material.unitConversions ?? [],
        batchManagementEnabled: material.batchManagementEnabled,
        batchRuleId: material.batchRuleId
      }
      if (!materials.value.some((item) => item.id === option.id)) materials.value.push(option)
      lines.value.push(newLine(option))
    }
  }
  async function loadSourceLines(): Promise<void> {
    const source = sourceLineSource.value
    if (!source) return
    sourceLineLoadError.value = false
    sourceLineDialogRef.value?.setLoading(true)
    try {
      const available = await fetchScmPurchaseRemainingLines(source)
      availableSourceLines.value = available.filter(
        (line) => !lines.value.some((current) => current.sourceLineId === line.sourceLineId)
      )
      if (!availableSourceLines.value.length) ElMessage.warning('来源单据已无未转换数量')
    } catch {
      sourceLineLoadError.value = true
    } finally {
      sourceLineDialogRef.value?.setLoading(false)
    }
  }
  async function importSourceLines() {
    if (kind.value === 'receipt_notice') {
      if (!header.supplierId) {
        ElMessage.warning('请先参选供应商')
        return
      }
      selectedSourceLineIds.value = []
      availableSourceLines.value = []
      receiptSourceLoading.value = true
      await nextTick()
      await receiptOrderSelectRef.value?.open()
      try {
        const choices = await fetchScmReceiptOrderLineChoices(
          header.tenantId,
          header.supplierId,
          header.projectId || undefined
        )
        const missingIds = uniq(choices.map((choice) => choice.materialId)).filter(
          (id) => !materials.value.some((material) => material.id === id)
        )
        if (missingIds.length) {
          const { data } = await fetchScmMaterialOptions(header.tenantId, missingIds)
          materials.value.push(...(data ?? []))
        }
        availableSourceLines.value = choices.filter(
          (choice) =>
            (!receiptSourceOrderId.value ||
              choice.sourcePurchaseDocumentId === receiptSourceOrderId.value) &&
            !lines.value.some(
              (line) =>
                line.sourcePurchaseDocumentId === choice.sourcePurchaseDocumentId &&
                line.sourceLineId === choice.sourceLineId
            )
        )
        await nextTick()
        await receiptOrderSelectRef.value?.reload()
      } catch {
        ElMessage.warning('采购订单明细加载失败，请重新参选')
      } finally {
        receiptSourceLoading.value = false
      }
      return
    }
    const source = sourceDocuments.value.find((item) => item.id === header.sourceId)
    if (!source) return
    sourceLineSource.value = source
    sourceLineLoadError.value = false
    availableSourceLines.value = []
    sourceLineKeyword.value = ''
    sourceLineDateRange.value = []
    selectedSourceLineIds.value = []
    await sourceLineDialogRef.value?.handleOpen(undefined, {
      title: `选择来源明细 · ${source.documentNo}`,
      confirmText: '带入选中明细',
      loading: true,
      loadingText: '正在加载来源明细…',
      onOpen: loadSourceLines,
      onConfirm: () => {
        if (sourceLineLoadError.value) return false
        const selected = availableSourceLines.value.filter((line) =>
          selectedSourceLineIds.value.includes(line.sourceLineId ?? '')
        )
        if (!selected.length) {
          ElMessage.warning('请选择至少一行来源明细')
          return false
        }
        header.projectId = source.projectId ?? ''
        header.supplierId = source.supplierId ?? header.supplierId
        if (kind.value === 'receipt_notice' && !details.contractNo)
          details.contractNo = source.paymentPlans.find((plan) => plan.contractNo)?.contractNo ?? ''
        let lineNo = nextLineNo()
        if (
          kind.value === 'purchase_order' &&
          selected.some((choice) => {
            const material = materials.value.find((item) => item.id === choice.materialId)
            return (
              !material || !toPurchaseUnit(material, choice.quantity, choice.unitPrice, choice.unit)
            )
          })
        ) {
          ElMessage.warning('来源物料缺少采购单位换算关系')
          return false
        }
        for (const choice of selected) {
          const material = materials.value.find((item) => item.id === choice.materialId)
          const converted =
            kind.value === 'purchase_order' && material
              ? toPurchaseUnit(material, choice.quantity, choice.unitPrice, choice.unit)
              : null
          const line: ScmPurchaseLine = {
            ...choice,
            lineId: crypto.randomUUID(),
            lineNo,
            quantity: converted?.quantity ?? choice.quantity,
            unitPrice: converted?.unitPrice ?? choice.unitPrice,
            sourcePurchaseDocumentId:
              kind.value === 'purchase_order' ? source.id : choice.sourcePurchaseDocumentId,
            sourceLineNo: choice.lineNo || undefined,
            sourceQuantity: kind.value === 'purchase_order' ? choice.quantity : undefined,
            unit:
              kind.value === 'purchase_order'
                ? material?.purchaseUnit || material?.baseUnitName || choice.unit
                : choice.unit,
            baseUnit:
              kind.value === 'purchase_order'
                ? material?.baseUnitName || material?.unit || ''
                : choice.baseUnit
          }
          lineNo += 10
          if (kind.value === 'purchase_order') {
            applyOrderContractPrice(line)
            recalculateOrderUnits(line)
            updateTaxInclusiveUnitPrice(line)
          }
          lines.value.push(line)
        }
        return true
      }
    })
  }
  function confirmReceiptOrderLines(
    value: string | number | Array<string | number> | undefined
  ): void {
    const selectedIds = Array.isArray(value) ? value.map(String) : []
    const selected = availableSourceLines.value.filter((line) =>
      selectedIds.includes(line.choiceId || '')
    ) as ScmReceiptOrderLineChoice[]
    if (!selected.length) {
      ElMessage.warning('请选择至少一行采购订单明细')
      return
    }
    if (lines.value.length + selected.length > 200) {
      ElMessage.warning('收料物料明细最多 200 行')
      return
    }
    if (selected.some((line) => line.projectId !== selected[0].projectId)) {
      ElMessage.warning('同一张收料通知单只能选择同一项目的采购订单')
      return
    }
    header.projectId = selected[0].projectId
    let lineNo = nextLineNo()
    for (const choice of selected) {
      const line: ScmPurchaseLine = {
        ...omit(choice, ['choiceId', 'projectId', 'projectName', 'supplierId']),
        lineId: crypto.randomUUID(),
        lineNo,
        ownerType: 'self'
      }
      lineNo += 10
      recalculateReceiptUnits(line)
      lines.value.push(line)
    }
  }
  async function importQuotationLines() {
    if (!filteredQuotationLines.value.length) {
      ElMessage.warning('当前项目暂无可参选的采购申请、合同或报价明细')
      return
    }
    if (kind.value !== 'receipt_notice') {
      quotationKeyword.value = ''
      selectedQuotationLines.value = []
      await quotationDialogRef.value?.handleOpen(undefined, {
        title: kind.value === 'purchase_contract' ? '参选报价明细' : '选单',
        subtitle:
          kind.value === 'purchase_contract'
            ? '仅显示当前项目已生效报价中的采购件，可多选明细批量带入。'
            : '从当前项目的采购申请、已生效采购合同、销售报价或销售订单中多选采购件明细。',
        confirmText: '带入选中明细',
        onConfirm: () => {
          const selected = selectedQuotationLines.value.filter(
            (choice) =>
              !lines.value.some(
                (line) =>
                  line.sourceDocumentNo === choice.documentNo &&
                  (line.quotationLineId === choice.lineId ||
                    line.purchaseContractLineId === choice.lineId)
              )
          )
          if (!selected.length) {
            ElMessage.warning('请选择尚未带入的来源明细')
            return false
          }
          if (lines.value.length + selected.length > 200) {
            ElMessage.warning('物料明细最多 200 行')
            return false
          }
          if (
            kind.value === 'purchase_order' &&
            selected.some((choice) => {
              const material = materials.value.find((item) => item.id === choice.materialId)
              return (
                !material ||
                !toPurchaseUnit(
                  material,
                  choice.quantity,
                  choice.unitPrice,
                  choice.salesUnit || material.baseUnitName || material.unit || ''
                )
              )
            })
          ) {
            ElMessage.warning('选中明细的单位换算关系不完整，请先维护物料单位')
            return false
          }
          for (const choice of selected) {
            const material = materials.value.find((item) => item.id === choice.materialId)
            const baseLine = newLine(material)
            const converted =
              kind.value === 'purchase_order' && material
                ? toPurchaseUnit(
                    material,
                    choice.quantity,
                    choice.unitPrice,
                    choice.salesUnit || material.baseUnitName || material.unit || ''
                  )
                : null
            const line: ScmPurchaseLine = {
              ...baseLine,
              lineNo:
                choice.sourceSalesDocumentId &&
                (kind.value === 'purchase_request' || kind.value === 'purchase_order') &&
                Number.isInteger(choice.selectedLineNo) &&
                choice.selectedLineNo > 0 &&
                !lines.value.some((item) => item.lineNo === choice.selectedLineNo)
                  ? choice.selectedLineNo
                  : baseLine.lineNo,
              materialId: choice.materialId,
              materialCode: choice.materialCode,
              materialDescription: choice.materialDescription,
              specification: choice.specification ?? '',
              unit:
                kind.value === 'purchase_order'
                  ? material?.purchaseUnit || material?.baseUnitName || material?.unit || ''
                  : kind.value === 'purchase_request'
                    ? material?.baseUnitName || material?.unit || ''
                    : material?.baseUnitName || material?.unit || choice.salesUnit || '',
              baseUnit:
                kind.value === 'purchase_contract' || kind.value === 'purchase_order'
                  ? material?.baseUnitName || material?.unit || ''
                  : undefined,
              quantity: converted?.quantity ?? choice.quantity,
              unitPrice:
                kind.value === 'purchase_order' &&
                baseLine.contractNo &&
                !choice.sourcePurchaseDocumentId
                  ? baseLine.unitPrice
                  : (converted?.unitPrice ?? choice.unitPrice),
              taxRate:
                kind.value === 'purchase_order' &&
                baseLine.contractNo &&
                !choice.sourcePurchaseDocumentId
                  ? baseLine.taxRate
                  : choice.taxRate,
              sourceDocumentNo: choice.documentNo,
              sourceSalesDocumentId: choice.sourceSalesDocumentId,
              sourcePurchaseDocumentId:
                choice.sourcePurchaseRequestId || choice.sourcePurchaseDocumentId,
              sourceLineId: choice.sourcePurchaseRequestId ? choice.lineId : undefined,
              sourceQuantity: choice.sourcePurchaseRequestId ? choice.quantity : undefined,
              quotationLineId: choice.sourceSalesDocumentId ? choice.lineId : undefined,
              purchaseContractLineId: choice.sourcePurchaseDocumentId ? choice.lineId : undefined,
              sourceLineNo: choice.selectedLineNo,
              contractNo: choice.sourcePurchaseDocumentId ? choice.documentNo : baseLine.contractNo
            }
            if (kind.value === 'purchase_order') {
              recalculateOrderUnits(line)
              updateTaxInclusiveUnitPrice(line)
            }
            lines.value.push(line)
          }
          return true
        }
      })
      return
    }
    selectedQuotationId.value = ''
    await quotationDialogRef.value?.handleOpen(undefined, {
      title: '选销售报价',
      confirmText: '带入明细',
      onConfirm: () => {
        const quote = eligibleQuotations.value.find((item) => item.id === selectedQuotationId.value)
        if (!quote) {
          ElMessage.warning('请选择销售报价单')
          return false
        }
        const purchaseIds = new Set(
          materials.value
            .filter((item) => item.materialSource === 'purchase')
            .map((item) => item.id)
        )
        const purchaseLines = quote.lines.filter((line) => purchaseIds.has(line.materialId))
        if (!purchaseLines.length) {
          ElMessage.warning('此报价单暂无标记为采购件的物料')
          return false
        }
        for (const line of purchaseLines) {
          const material = materials.value.find((item) => item.id === line.materialId)
          lines.value.push({
            ...newLine(material),
            materialId: line.materialId,
            materialCode: line.materialCode,
            materialDescription: line.materialDescription,
            specification: line.specification ?? '',
            unit: material?.baseUnitName || material?.unit || line.salesUnit || '',
            baseUnit: material?.baseUnitName || material?.unit || '',
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            sourceDocumentNo: quote.documentNo,
            sourceSalesDocumentId: quote.id,
            quotationLineId: line.lineId
          })
        }
        return true
      }
    })
  }
  async function applyRecentPrices() {
    const prices = await fetchScmRecentPurchasePrices(
      header.tenantId,
      lines.value.map((line) => line.materialId)
    )
    let count = 0
    for (const line of lines.value)
      if (prices.has(line.materialId)) {
        line.unitPrice = prices.get(line.materialId)!
        count++
      }
    ElMessage.success(count ? `已更新 ${count} 项最近采购价` : '暂无可用的历史采购价')
  }
  function addPayment() {
    paymentPlans.value.push({
      id: crypto.randomUUID(),
      isAdvance: false,
      dueDate: '',
      ratio: 0,
      amount: 0,
      remark: ''
    })
  }
  function addDelivery() {
    const line = kind.value === 'purchase_order' ? lines.value[0] : undefined
    deliveryPlans.value.push({
      id: crypto.randomUUID(),
      lineId: line?.lineId,
      unit: line?.unit,
      plannedDate: kind.value === 'purchase_order' ? dayjs().format('YYYY-MM-DD') : '',
      quantity: line?.quantity ?? 1,
      plannedBaseQuantity: line?.baseQuantity ?? 1,
      deliveredQuantity: 0,
      location: '',
      address: '',
      remark: ''
    })
  }
  function fillDeliveryFromLine(plan: ScmPurchaseDeliveryPlan): void {
    const line = lines.value.find((item) => item.lineId === plan.lineId)
    plan.unit = line?.unit || ''
    plan.quantity = line?.quantity || 0
    plan.plannedBaseQuantity = line?.baseQuantity || 0
  }
  function updateDeliveryBaseQuantity(plan: ScmPurchaseDeliveryPlan): void {
    const line = lines.value.find((item) => item.lineId === plan.lineId)
    if (line?.quantity && line.baseQuantity)
      plan.plannedBaseQuantity =
        Math.round(((plan.quantity * line.baseQuantity) / line.quantity) * 1000) / 1000
  }
  function copyDelivery(plan: ScmPurchaseDeliveryPlan) {
    deliveryPlans.value.push({ ...plan, id: crypto.randomUUID(), deliveredQuantity: 0 })
  }
  function addClause() {
    clauses.value.push({ id: crypto.randomUUID(), title: '', content: '' })
  }
  async function generateBatch(line: ScmPurchaseLine): Promise<void> {
    const material = materials.value.find((item) => item.id === line.materialId)
    if (!material?.batchManagementEnabled || !material.batchRuleId) {
      ElMessage.warning('此物料未启用批号管理或未配置批号规则')
      return
    }
    try {
      line.batchNo = await generateScmReceiptBatchNo(line.materialId)
    } catch {
      // API 层已提示错误。
    }
  }
  function generateSerial(line: ScmPurchaseLine) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 200) {
      ElMessage.warning('生成序列号需要 1–200 的整数数量')
      return
    }
    const stamp = dayjs().format('YYYYMMDD')
    line.serialNumbers = Array.from(
      { length: line.quantity },
      () => `SN-${stamp}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    )
  }

  function validateBusiness() {
    if (
      kind.value === 'receipt_notice' &&
      header.projectId &&
      !projectSections.value.some(
        (section) =>
          section.projectId === header.projectId &&
          section.constructionNo === details.constructionNo &&
          section.status === 'active'
      )
    ) {
      ElMessage.warning('请选择当前项目下启用的施工号')
      return false
    }
    if (kind.value !== 'purchase_request' && !header.supplierId) {
      ElMessage.warning('请选择供应商')
      return false
    }
    if (kind.value === 'purchase_order' && !details.buyer) {
      ElMessage.warning('请选择采购员')
      return false
    }
    if (
      kind.value === 'purchase_order' &&
      (details.ownerType === 'supplier' || details.ownerType === 'customer') &&
      !details.ownerId
    ) {
      ElMessage.warning('请选择货主')
      return false
    }
    if (!lines.value.length) {
      activeTab.value = 'lines'
      ElMessage.warning('请添加至少一行物料明细')
      return false
    }
    if (
      lines.value.some(
        (line) =>
          !line.materialId ||
          !line.materialDescription.trim() ||
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          line.unitPrice < 0 ||
          line.taxRate < 0 ||
          line.taxRate > 100 ||
          line.discountRate < 0 ||
          line.discountRate > 100
      )
    ) {
      activeTab.value = 'lines'
      ElMessage.warning('请核对物料、正数数量、单价、税率和折扣率')
      return false
    }
    if (
      (kind.value === 'purchase_contract' ||
        kind.value === 'purchase_request' ||
        kind.value === 'purchase_order' ||
        kind.value === 'receipt_notice') &&
      (lines.value.some(
        (line) =>
          !Number.isInteger(line.lineNo) ||
          Number(line.lineNo) < 1 ||
          (kind.value === 'purchase_contract' && !line.baseUnit?.trim())
      ) ||
        new Set(lines.value.map((line) => line.lineNo)).size !== lines.value.length)
    ) {
      activeTab.value = 'lines'
      ElMessage.warning('请填写不重复的正整数行号，并核对基本单位')
      return false
    }
    if (
      kind.value === 'purchase_order' &&
      lines.value.some((line) => {
        recalculateOrderUnits(line)
        const material = materials.value.find((item) => item.id === line.materialId)
        return (
          !material ||
          !line.baseUnit ||
          !line.baseQuantity ||
          !Number.isFinite(Number(line.taxInclusiveUnitPrice)) ||
          lineSubtotal(line) < 0 ||
          (line.binId &&
            !bins.value.some(
              (bin) => bin.id === line.binId && bin.warehouseId === line.warehouseId
            ))
        )
      })
    ) {
      activeTab.value = 'lines'
      ElMessage.warning('请核对订单单位换算、含税单价、折扣与仓位')
      return false
    }
    if (
      kind.value === 'receipt_notice' &&
      lines.value.some((line) => {
        recalculateReceiptUnits(line)
        return (
          !line.baseUnit?.trim() ||
          !line.baseQuantity ||
          !line.stockQuantity ||
          (line.binId &&
            !bins.value.some(
              (bin) => bin.id === line.binId && bin.warehouseId === line.warehouseId
            )) ||
          ((line.ownerType === 'supplier' || line.ownerType === 'customer') && !line.ownerId)
        )
      })
    ) {
      activeTab.value = 'lines'
      ElMessage.warning('请核对基本单位换算、仓位和货主')
      return false
    }
    if (paymentPlans.value.some((plan) => !plan.dueDate || plan.ratio < 0 || plan.amount < 0)) {
      activeTab.value = 'payments'
      ElMessage.warning('请完整填写付款计划')
      return false
    }
    if (deliveryPlans.value.some((plan) => !plan.plannedDate || plan.quantity <= 0)) {
      activeTab.value = 'deliveries'
      ElMessage.warning('请完整填写交货计划')
      return false
    }
    if (clauses.value.some((clause) => !clause.title || !clause.content.trim())) {
      activeTab.value = 'clauses'
      ElMessage.warning('请完整填写合同条款')
      return false
    }
    return true
  }
  async function handleSubmit() {
    if (initializationError.value || !referencesLoaded.value) {
      ElMessage.warning('基础数据尚未加载完成，请重新加载后再创建单据')
      return false
    }
    try {
      if (!(await headerFormRef.value?.validate())) return false
      const lineValidation = await lineTableRef.value?.validate()
      if (lineValidation && !lineValidation.valid) {
        activeTab.value = 'lines'
        ElMessage.warning(lineValidation.firstError?.message ?? '请完善物料明细')
        return false
      }
      if (!validateBusiness()) return false
      const input: ScmPurchaseWrite = {
        tenantId: header.tenantId,
        kind: kind.value,
        documentNo: header.documentNo,
        documentTypeId: header.documentTypeId || null,
        projectId: header.projectId || null,
        supplierId: header.supplierId || null,
        sourceId: header.sourceId || null,
        documentDate: header.documentDate,
        deliveryDate: header.deliveryDate || null,
        details: { ...details },
        lines: lines.value.map((line) => {
          if (kind.value !== 'receipt_notice' && kind.value !== 'purchase_order') return line
          if (kind.value === 'receipt_notice') recalculateReceiptUnits(line)
          else recalculateOrderUnits(line)
          return {
            ...line,
            warehouse:
              warehouses.value.find((item) => item.id === line.warehouseId)?.warehouseName || '',
            location: bins.value.find((item) => item.id === line.binId)?.binName || ''
          }
        }),
        paymentPlans: paymentPlans.value,
        deliveryPlans: deliveryPlans.value,
        clauses: clauses.value,
        remark: header.remark
      }
      if (recordId.value) await updateScmPurchaseDocument(recordId.value, input)
      else await createScmPurchaseDocument(input)
      emit('success', recordId.value ? 'edit' : 'add')
      return true
    } catch {
      return false
    }
  }
  async function handleOpen(options: OpenOptions) {
    const revision = ++openRevision
    currentOpenOptions = options
    initializationError.value = ''
    preparing = true
    kind.value = options.kind
    receiptSourceOrderId.value = ''
    selectAfterSupplier.value = Boolean(
      options.openLineSelector && options.kind === 'receipt_notice'
    )
    recordId.value = options.copy ? undefined : options.record?.id
    tenantOptions.value = options.tenantOptions
    Object.assign(header, emptyHeader(), options.record ?? {}, {
      tenantId: options.record?.tenantId ?? options.effectiveTenantId ?? '',
      documentNo: options.copy ? '' : (options.record?.documentNo ?? ''),
      documentTypeId: options.record?.documentTypeId ?? '',
      projectId: options.record?.projectId ?? '',
      supplierId: options.record?.supplierId ?? '',
      sourceId: options.copy ? '' : (options.record?.sourceId ?? ''),
      deliveryDate: options.record?.deliveryDate ?? '',
      remark: options.record?.remark ?? ''
    })
    for (const key of Object.keys(details)) delete details[key as keyof ScmPurchaseDetails]
    Object.assign(details, options.record?.details ?? {}, {
      paymentMode: options.record?.details.paymentMode ?? 'amount',
      ...(kind.value === 'purchase_order' && !options.record
        ? {
            ownerType: 'self' as const,
            buyer:
              (userStore.getUserInfo.hrEmployee?.tenantId || userStore.getUserInfo.tenantId) ===
              header.tenantId
                ? userStore.getUserInfo.hrEmployeeId || undefined
                : undefined,
            buyerName:
              (userStore.getUserInfo.hrEmployee?.tenantId || userStore.getUserInfo.tenantId) ===
              header.tenantId
                ? userStore.getUserInfo.hrEmployee?.employeeName
                : undefined
          }
        : {}),
      ...(kind.value === 'purchase_contract'
        ? {
            contractStatus:
              options.record?.details.contractStatus ??
              (options.record?.status === 'submitted'
                ? 'SUBM'
                : options.record?.status === 'effective' || options.record?.status === 'approved'
                  ? 'APRV'
                  : options.record?.status === 'expired'
                    ? 'CNCL'
                    : 'DRFT')
          }
        : {}),
      ...(kind.value === 'purchase_contract' && !options.record
        ? {
            signedDate: dayjs().format('YYYY-MM-DD'),
            startDate: dayjs().format('YYYY-MM-DD'),
            effectiveness: 'inactive'
          }
        : {})
    })
    for (const key of ['buyer', 'applicant', 'keeper'] as const) {
      selectedEmployees[key] =
        details[key] && details[`${key}Name`]
          ? [
              {
                id: details[key]!,
                tenantId: header.tenantId,
                employeeName: details[`${key}Name`]!,
                employeeNo: '',
                employmentStatus: ''
              }
            ]
          : []
    }
    lines.value =
      options.record?.lines.map((line, index) => ({
        ...line,
        lineNo:
          kind.value === 'purchase_contract' ||
          kind.value === 'purchase_request' ||
          kind.value === 'purchase_order' ||
          kind.value === 'receipt_notice'
            ? (line.lineNo ?? (index + 1) * 10)
            : line.lineNo,
        baseUnit: kind.value === 'purchase_contract' ? line.baseUnit || line.unit : line.baseUnit,
        lineId: options.copy ? crypto.randomUUID() : line.lineId,
        sourceLineId: options.copy ? undefined : line.sourceLineId,
        sourceQuantity: options.copy ? undefined : line.sourceQuantity,
        sourcePurchaseDocumentId: options.copy ? undefined : line.sourcePurchaseDocumentId,
        sourceSalesDocumentId: options.copy ? undefined : line.sourceSalesDocumentId,
        quotationLineId: options.copy ? undefined : line.quotationLineId,
        purchaseContractLineId: options.copy ? undefined : line.purchaseContractLineId,
        sourceLineNo: options.copy ? undefined : line.sourceLineNo,
        sourceDocumentNo:
          options.copy && (kind.value === 'purchase_order' || kind.value === 'receipt_notice')
            ? undefined
            : line.sourceDocumentNo,
        batchNo: options.copy ? undefined : line.batchNo,
        serialNumbers: options.copy ? undefined : line.serialNumbers
      })) ?? []
    paymentPlans.value =
      options.record?.paymentPlans.map((item) => ({
        ...item,
        id: options.copy ? crypto.randomUUID() : item.id
      })) ?? []
    deliveryPlans.value =
      options.record?.deliveryPlans.map((item) => ({
        ...item,
        id: options.copy ? crypto.randomUUID() : item.id
      })) ?? []
    clauses.value =
      options.record?.clauses.map((item) => ({
        ...item,
        id: options.copy ? crypto.randomUUID() : item.id
      })) ?? []
    activeTab.value = 'lines'
    if (options.initialSource && options.kind === 'purchase_order') {
      header.sourceId = options.initialSource.id
      header.projectId = options.initialSource.projectId ?? ''
    }
    if (options.initialSource && options.kind === 'receipt_notice') {
      selectAfterSupplier.value = false
      receiptSourceOrderId.value = options.initialSource.id
      header.projectId = options.initialSource.projectId ?? ''
      header.supplierId = options.initialSource.supplierId ?? ''
    }
    await dialogRef.value?.handleOpen(options, {
      title: options.copy
        ? `复制${config.value.title} · ${options.record?.documentNo}`
        : options.record
          ? `编辑${config.value.title} · ${options.record.documentNo}`
          : `新增${config.value.title}`,
      confirmText: recordId.value ? '保存更改' : '创建单据',
      loading: true,
      loadingText: '正在准备采购单据…',
      onConfirm: handleSubmit,
      onOpen: async (_openData, api) => {
        preparing = false
        headerFormRef.value?.clearValidate()
        await initializeOpeningData(options, api, revision)
      },
      onClose: () => {
        ++openRevision
        ++referenceRevision
        loading.value = false
      },
      dialogProps: { closeOnClickModal: false }
    })
  }

  async function initializeOpeningData(
    options: OpenOptions,
    api: ArtDialogExpose<OpenOptions>,
    revision: number
  ): Promise<void> {
    initializationError.value = ''
    api.setLoading(true)
    try {
      if (options.initialSourceId) {
        const { data: source } = await fetchScmPurchaseDocument(options.initialSourceId)
        if (revision !== openRevision || !api.visible.value) return
        const expectedKind =
          options.kind === 'purchase_order' ? 'purchase_request' : 'purchase_order'
        if (
          !source ||
          source.kind !== expectedKind ||
          (options.kind === 'receipt_notice' &&
            !['approved', 'completed'].includes(source.status)) ||
          !source.lines.some((line) => Number(line.remainingQuantity ?? line.quantity) > 0)
        ) {
          initializationError.value = '来源单据已变化或没有可引用明细，请关闭后重新选择。'
          return
        }
        header.tenantId = source.tenantId
        header.projectId = source.projectId ?? ''
        if (options.kind === 'purchase_order') header.sourceId = source.id
        else {
          selectAfterSupplier.value = false
          receiptSourceOrderId.value = source.id
          header.supplierId = source.supplierId ?? ''
        }
      }
      await Promise.all(
        [
          'scmContractClause',
          'scmContractEffectiveness',
          'scmPurchaseContractStatus',
          'scmDiscountMode',
          'scmTaxRate',
          'mdmBusinessOwnerType',
          'mdmProjectStatus'
        ].map((code) => userStore.ensureDictLoaded(code))
      )
      if (revision !== openRevision || !api.visible.value) return
      if (!(await loadReferences(header.tenantId))) {
        initializationError.value = '关联主数据暂时不可用，请重新加载后继续填写。'
        return
      }
      if (revision !== openRevision || !api.visible.value) return
      if (options.generate) {
        for (const line of lines.value) {
          if (options.generate === 'batch') {
            if (
              materials.value.find((material) => material.id === line.materialId)
                ?.batchManagementEnabled
            )
              await generateBatch(line)
          } else generateSerial(line)
        }
      }
    } catch {
      if (revision === openRevision) {
        initializationError.value = '采购基础配置暂时不可用，请重新加载后继续填写。'
      }
    } finally {
      if (revision === openRevision && api.visible.value) api.setLoading(false)
    }
    if (revision !== openRevision || !api.visible.value || initializationError.value) return
    if (options.openLineSelector) {
      if (options.kind === 'purchase_order' && header.sourceId) void importSourceLines()
      else if (options.kind === 'purchase_request') void importQuotationLines()
      else if (options.kind === 'receipt_notice' && header.supplierId) {
        selectAfterSupplier.value = false
        void importSourceLines()
      }
    }
  }

  function retryOpeningData(): void {
    if (currentOpenOptions && dialogRef.value) {
      void initializeOpeningData(currentOpenOptions, dialogRef.value, openRevision)
    }
  }
  watch(
    () => header.tenantId,
    (tenantId, previous) => {
      if (preparing || tenantId === previous) return
      header.projectId = ''
      header.supplierId = ''
      header.sourceId = ''
      lines.value = []
      void loadReferences(tenantId)
    }
  )
  watch(
    () => header.sourceId,
    (sourceId, previous) => {
      if (!preparing && sourceId !== previous)
        lines.value = lines.value.filter((line) => !line.sourceLineId)
      if (!preparing && sourceId && kind.value !== 'purchase_order') void importSourceLines()
    }
  )
  watch(
    () => header.supplierId,
    (supplierId, previous) => {
      if (preparing || kind.value !== 'receipt_notice' || supplierId === previous) return
      lines.value = lines.value.filter((line) => !line.sourcePurchaseDocumentId)
      if (supplierId && selectAfterSupplier.value) {
        selectAfterSupplier.value = false
        void importSourceLines()
      }
    }
  )
  watch(
    () => details.ownerType,
    (ownerType, previous) => {
      if (!preparing && ownerType !== previous) details.ownerId = undefined
    }
  )
  watch(
    [() => details.paymentMode, totalAmount, paymentPlans],
    () => {
      for (const plan of paymentPlans.value) {
        if (details.paymentMode === 'ratio')
          plan.amount = Math.round(totalAmount.value * plan.ratio) / 100
        else
          plan.ratio =
            totalAmount.value > 0 ? Math.round((plan.amount / totalAmount.value) * 10000) / 100 : 0
      }
    },
    { deep: true }
  )
  defineExpose({ handleOpen })
</script>
