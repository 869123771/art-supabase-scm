<template>
  <ArtDialog ref="dialogRef" size="xl">
    <template #subtitle>维护单据表头、物料明细与履约安排；金额由数据库统一核算。</template>
    <div class="flex min-w-0 flex-col gap-4">
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
        />
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
        </ArtForm>
      </ArtSectionCard>
      <ElTabs v-model="activeTab" class="min-w-0">
        <ElTabPane label="物料明细" name="lines">
          <ArtSectionCard
            title="物料明细"
            subtitle="可多选物料；选单时按剩余数量筛选来源明细。"
            :empty="!lines.length"
            empty-title="暂无物料明细"
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
                  :disabled="!header.sourceId || Boolean(recordId)"
                  @click="importSourceLines"
                  ><ArtSvgIcon icon="ri:file-list-3-line" />选择来源明细</ElButton
                >
                <ElButton
                  v-if="kind === 'purchase_contract' || kind === 'purchase_request'"
                  :disabled="!header.projectId"
                  @click="importQuotationLines"
                  ><ArtSvgIcon icon="ri:file-search-line" />选销售报价</ElButton
                >
                <ElButton
                  v-if="config.permissions.RecentPrice"
                  v-auth="config.permissions.RecentPrice"
                  :disabled="!lines.length"
                  @click="applyRecentPrices"
                  ><ArtSvgIcon icon="ri:price-tag-3-line" />获取最近采购价</ElButton
                >
                <ElButton
                  type="primary"
                  plain
                  :disabled="!header.tenantId || !materials.length"
                  @click="addSelectedMaterials"
                >
                  <ArtSvgIcon icon="ri:add-line" />参选物料
                </ElButton>
              </div>
            </template>
            <div class="flex flex-col gap-3">
              <div
                v-for="(line, index) in lines"
                :key="line.lineId"
                class="min-w-0 rounded-xl border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-extra-light)] p-4"
              >
                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div class="flex min-w-0 items-start gap-3">
                    <span
                      class="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--el-color-primary-light-9)] text-xs font-semibold text-[var(--el-color-primary)]"
                      >{{ index + 1 }}</span
                    >
                    <div class="min-w-0">
                      <strong class="block break-words text-sm">{{
                        line.materialDescription || '新物料'
                      }}</strong>
                      <span class="mt-1 block break-words text-xs text-[var(--art-gray-600)]"
                        >{{ line.materialCode || '请选择物料'
                        }}<span v-if="line.specification"> · {{ line.specification }}</span
                        ><span v-if="line.sourceDocumentNo">
                          · 来源 {{ line.sourceDocumentNo }}</span
                        ></span
                      >
                    </div>
                  </div>
                  <ElButton type="danger" text @click="lines.splice(index, 1)">
                    <ArtSvgIcon icon="ri:delete-bin-line" />移除
                  </ElButton>
                </div>
                <div class="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >物料编码
                    <ElSelect
                      v-model="line.materialId"
                      filterable
                      class="w-full"
                      :disabled="Boolean(line.sourceLineId)"
                      placeholder="选择物料"
                      @change="(id: string) => selectMaterial(line, id)"
                    >
                      <ElOption
                        v-for="material in materials"
                        :key="material.id"
                        :value="material.id"
                        :label="`${material.materialCode} · ${material.materialDescription}`"
                      />
                    </ElSelect>
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >数量
                    <ElInputNumber
                      v-model="line.quantity"
                      :min="0.001"
                      :precision="3"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >采购单位
                    <ElInput v-model="line.unit" maxlength="30" placeholder="单位" />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >需求日期
                    <ElDatePicker
                      v-model="line.needDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >单价（元）
                    <ElInputNumber
                      v-model="line.unitPrice"
                      :min="0"
                      :precision="2"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >税率（%）
                    <ElInputNumber
                      v-model="line.taxRate"
                      :min="0"
                      :max="100"
                      :precision="2"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >折扣方式
                    <ElSelect
                      v-model="line.discountMode"
                      clearable
                      class="w-full"
                      placeholder="无折扣"
                    >
                      <ElOption
                        v-for="option in discountOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </ElSelect>
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >折扣率（%）
                    <ElInputNumber
                      v-model="line.discountRate"
                      :min="0"
                      :max="100"
                      :precision="2"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >辅助数量
                    <ElInputNumber
                      v-model="line.auxiliaryQuantity"
                      :min="0"
                      :precision="3"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >辅助单位
                    <ElInput v-model="line.auxiliaryUnit" maxlength="30" placeholder="可选" />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >辅助数量（2）
                    <ElInputNumber
                      v-model="line.auxiliaryQuantity2"
                      :min="0"
                      :precision="3"
                      :controls="false"
                      class="w-full!"
                    />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >辅助单位（2）
                    <ElInput v-model="line.auxiliaryUnit2" maxlength="30" placeholder="可选" />
                  </label>
                  <div class="flex min-w-0 items-end"
                    ><ElCheckbox v-model="line.gift">赠品</ElCheckbox></div
                  >
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >价税合计
                    <span
                      class="flex min-h-8 items-center font-semibold text-[var(--el-color-primary)]"
                      >{{ formatCurrencyValue(lineTotal(line)) }}</span
                    >
                  </label>
                  <label
                    v-if="kind === 'purchase_order' || kind === 'receipt_notice'"
                    class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >仓库
                    <ElInput v-model="line.warehouse" maxlength="80" placeholder="收货仓库" />
                  </label>
                  <label
                    v-if="kind === 'purchase_order' || kind === 'receipt_notice'"
                    class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >仓位
                    <ElInput v-model="line.location" maxlength="80" placeholder="收货仓位" />
                  </label>
                  <label
                    v-if="kind === 'purchase_request'"
                    class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >需求原因
                    <ElInput v-model="line.reason" maxlength="200" placeholder="说明采购用途" />
                  </label>
                  <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                    >备注
                    <ElInput v-model="line.remark" maxlength="200" placeholder="可选" />
                  </label>
                  <template v-if="kind === 'receipt_notice'">
                    <label class="flex min-w-0 flex-col gap-1 text-xs text-[var(--art-gray-600)]"
                      >批号
                      <ElInput
                        v-model="line.batchNo"
                        v-auth="config.permissions.GenerateBatch"
                        maxlength="80"
                        placeholder="可手填或生成"
                      />
                    </label>
                    <div class="flex min-w-0 flex-col justify-end gap-1">
                      <ElButton
                        v-auth="config.permissions.GenerateBatch"
                        plain
                        @click="generateBatch(line)"
                        ><ArtSvgIcon icon="ri:barcode-line" />生成批号</ElButton
                      >
                    </div>
                    <div class="flex min-w-0 flex-col justify-end gap-1">
                      <ElButton
                        v-auth="config.permissions.GenerateSerial"
                        plain
                        @click="generateSerial(line)"
                        ><ArtSvgIcon icon="ri:hashtag" />生成序列号</ElButton
                      >
                    </div>
                    <div class="flex min-w-0 items-center text-xs text-[var(--art-gray-600)]">
                      已生成 {{ line.serialNumbers?.length ?? 0 }} 个序列号
                    </div>
                  </template>
                </div>
                <div
                  class="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--el-border-color-light)] pt-3 text-xs sm:grid-cols-4"
                >
                  <div
                    ><span class="text-[var(--art-gray-600)]">含税单价</span
                    ><strong class="mt-1 block tabular-nums">{{
                      formatCurrencyValue(lineTaxedUnitPrice(line))
                    }}</strong></div
                  >
                  <div
                    ><span class="text-[var(--art-gray-600)]">金额</span
                    ><strong class="mt-1 block tabular-nums">{{
                      formatCurrencyValue(lineSubtotal(line))
                    }}</strong></div
                  >
                  <div
                    ><span class="text-[var(--art-gray-600)]">折扣额</span
                    ><strong class="mt-1 block tabular-nums">{{
                      formatCurrencyValue(lineDiscountAmount(line))
                    }}</strong></div
                  >
                  <div
                    ><span class="text-[var(--art-gray-600)]">税金额</span
                    ><strong class="mt-1 block tabular-nums">{{
                      formatCurrencyValue(lineTaxAmount(line))
                    }}</strong></div
                  >
                </div>
              </div>
            </div>
          </ArtSectionCard>
        </ElTabPane>
        <ElTabPane v-if="config.tabs.includes('payments')" label="付款计划" name="payments">
          <ArtSectionCard
            title="付款计划"
            subtitle="按比例或金额安排应付款，切换方式时自动换算。"
            :empty="!paymentPlans.length"
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
            <div class="mb-4 flex items-center gap-3 text-sm"
              ><span>计划方式</span
              ><ElRadioGroup v-model="details.paymentMode">
                <ElRadioButton label="ratio" value="ratio">按比例</ElRadioButton
                ><ElRadioButton label="amount" value="amount">按金额</ElRadioButton>
              </ElRadioGroup></div
            >
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
              <ElButton type="danger" text @click="paymentPlans.splice(index, 1)">
                <ArtSvgIcon icon="ri:delete-bin-line" />删除
              </ElButton>
              <template v-if="kind === 'purchase_order'">
                <ElInput v-model="plan.contractNo" placeholder="采购合同号" />
                <ElInputNumber
                  v-model="plan.contractLine"
                  :min="1"
                  :precision="0"
                  :controls="false"
                  class="w-full!"
                  aria-label="合同行号"
                />
              </template>
              <ElInput
                v-model="plan.remark"
                placeholder="计划备注"
                class="sm:col-span-2 xl:col-span-5"
              />
            </div>
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
            <div
              v-for="(plan, index) in deliveryPlans"
              :key="plan.id"
              class="mb-3 rounded-lg border border-[var(--el-border-color-light)] p-3"
            >
              <div class="mb-3 flex items-center justify-between gap-2">
                <strong class="text-sm">第 {{ index + 1 }} 期交货</strong>
                <div
                  ><ElButton text @click="copyDelivery(plan)"
                    ><ArtSvgIcon icon="ri:file-copy-line" />复制</ElButton
                  ><ElButton type="danger" text @click="deliveryPlans.splice(index, 1)"
                    ><ArtSvgIcon icon="ri:delete-bin-line" />删除</ElButton
                  ></div
                >
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
            :empty="!clauses.length"
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
            <div
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
                ><ElButton type="danger" text @click="clauses.splice(index, 1)"
                  ><ArtSvgIcon icon="ri:delete-bin-line" />删除</ElButton
                ></div
              >
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
  <ArtDialog ref="materialDialogRef" size="md">
    <div class="mb-3 text-sm text-[var(--art-gray-600)]">选择同一租户的物料，可一次添加多项。</div>
    <ElSelect
      v-model="selectedMaterialIds"
      multiple
      filterable
      class="w-full"
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
  <ArtDialog ref="quotationDialogRef" size="md">
    <div class="mb-3 text-sm text-[var(--art-gray-600)]">仅显示当前项目的已生效销售报价物料。</div>
    <ElSelect v-model="selectedQuotationId" filterable class="w-full" placeholder="选择销售报价单">
      <ElOption
        v-for="quotation in eligibleQuotations"
        :key="quotation.id"
        :label="quotation.documentNo"
        :value="quotation.id"
      />
    </ElSelect>
  </ArtDialog>
  <ArtDialog ref="sourceLineDialogRef" size="lg">
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
        :key="line.sourceLineId"
        :value="line.sourceLineId"
        class="h-auto! w-full! rounded-lg border border-[var(--el-border-color-light)] p-3!"
      >
        <div class="min-w-0 whitespace-normal">
          <strong class="block break-words">{{ line.materialDescription }}</strong>
          <span class="text-xs text-[var(--art-gray-600)]">
            {{ line.materialCode }} · 可转换 {{ line.quantity }} {{ line.unit }}
            <span v-if="line.needDate"> · 需求 {{ line.needDate }}</span>
          </span>
        </div>
      </ElCheckbox>
    </ElCheckboxGroup>
  </ArtDialog>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { useUserStore } from '@/store/modules/user'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    createScmPurchaseDocument,
    fetchScmDocumentTypeOptions,
    fetchScmMaterialOptions,
    fetchScmPurchaseMenuIds,
    fetchScmProjectOptions,
    fetchScmPurchaseRemainingLines,
    fetchScmPurchaseSourceOptions,
    fetchScmRecentPurchasePrices,
    fetchScmSourceOptions,
    fetchScmSupplierOptions,
    updateScmPurchaseDocument,
    type ScmDocumentTypeOption,
    type ScmMaterialOption,
    type ScmProjectOption,
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

  interface OpenOptions {
    kind: ScmPurchaseKind
    record?: ScmPurchaseDocument
    copy?: boolean
    generate?: 'batch' | 'serial'
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
  const { shouldExposeTenantField } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<OpenOptions>>()
  const materialDialogRef = ref<ArtDialogExpose>()
  const quotationDialogRef = ref<ArtDialogExpose>()
  const sourceLineDialogRef = ref<ArtDialogExpose>()
  const headerFormRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const kind = ref<ScmPurchaseKind>('purchase_contract')
  const config = computed(() => purchaseConfigs[kind.value])
  const recordId = ref<string>()
  const tenantOptions = ref<OpenOptions['tenantOptions']>([])
  const projects = ref<ScmProjectOption[]>([])
  const suppliers = ref<ScmSupplierOption[]>([])
  const materials = ref<ScmMaterialOption[]>([])
  const documentTypes = ref<ScmDocumentTypeOption[]>([])
  const sourceDocuments = ref<ScmPurchaseDocument[]>([])
  const quotations = ref<ScmSalesDocument[]>([])
  const selectedMaterialIds = ref<string[]>([])
  const selectedQuotationId = ref('')
  const availableSourceLines = ref<ScmPurchaseLine[]>([])
  const selectedSourceLineIds = ref<string[]>([])
  const sourceLineKeyword = ref('')
  const sourceLineDateRange = ref<string[]>([])
  const activeTab = ref('lines')
  const loading = ref(false)
  const referencesLoaded = ref(false)
  let preparing = false
  let referenceRevision = 0

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
        source?.details.applicantName
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
    return (
      Math.round(
        Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.discountRate || 0)
      ) / 100
    )
  }
  function lineTaxAmount(line: ScmPurchaseLine) {
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
    return (
      Number(line.unitPrice || 0) *
      (1 - Number(line.discountRate || 0) / 100) *
      (1 + Number(line.taxRate || 0) / 100)
    )
  }

  const headerRules: FormRules<HeaderModel> = {
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    documentNo: [{ required: true, message: '请输入单据编号', trigger: 'blur' }],
    projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
    documentDate: [{ required: true, message: '请选择单据日期', trigger: 'change' }]
  }
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
    { label: config.value.numberLabel, key: 'documentNo', type: 'input', props: { maxlength: 60 } },
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
      type: 'select',
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
            type: 'select',
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
    ...(config.value.sourceKind
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
      type: field.type,
      span: field.span ?? 12,
      props:
        field.type === 'date'
          ? { type: 'date', valueFormat: 'YYYY-MM-DD', class: 'w-full!' }
          : field.type === 'select'
            ? { options: userStore.getDictMap?.scmContractEffectiveness ?? [], clearable: true }
            : { maxlength: field.span === 24 ? 500 : 120 }
    }))
  )

  async function loadReferences(tenantId: string) {
    const revision = ++referenceRevision
    referencesLoaded.value = false
    projects.value = []
    suppliers.value = []
    materials.value = []
    documentTypes.value = []
    sourceDocuments.value = []
    quotations.value = []
    if (!tenantId) return
    loading.value = true
    try {
      const [
        projectResult,
        supplierResult,
        materialResult,
        typeResult,
        sourceResult,
        quoteResult,
        menusResult
      ] = await Promise.all([
        fetchScmProjectOptions(tenantId),
        fetchScmSupplierOptions(tenantId),
        fetchScmMaterialOptions(tenantId),
        fetchScmDocumentTypeOptions(tenantId),
        config.value.sourceKind
          ? fetchScmPurchaseSourceOptions(config.value.sourceKind, tenantId)
          : Promise.resolve(null),
        ['purchase_contract', 'purchase_request'].includes(kind.value)
          ? fetchScmSourceOptions('sales_quotation', tenantId)
          : Promise.resolve(null),
        fetchScmPurchaseMenuIds()
      ])
      if (revision !== referenceRevision) return
      projects.value = projectResult.data ?? []
      suppliers.value = supplierResult.data ?? []
      materials.value = materialResult.data ?? []
      documentTypes.value = typeResult.data ?? []
      sourceDocuments.value = sourceResult?.data ?? []
      quotations.value = quoteResult?.data ?? []
      menuIds.value = Object.fromEntries(
        (menusResult.data ?? []).map((item) => [
          Object.values(purchaseConfigs).find((config) => config.menuName === item.name)?.kind ??
            item.name,
          item.id
        ])
      )
      referencesLoaded.value = true
    } catch {
      if (revision === referenceRevision) ElMessage.warning('关联主数据加载失败，请稍后重试')
    } finally {
      if (revision === referenceRevision) loading.value = false
    }
  }

  function newLine(material?: ScmMaterialOption): ScmPurchaseLine {
    return {
      lineId: crypto.randomUUID(),
      materialId: material?.id ?? '',
      materialCode: material?.materialCode ?? '',
      materialDescription: material?.materialDescription ?? '',
      specification: material?.specification ?? '',
      unit: material?.unit ?? '',
      quantity: 1,
      unitPrice: 0,
      taxRate: 0,
      discountMode: 'none',
      discountRate: 0,
      gift: false
    }
  }
  function selectMaterial(line: ScmPurchaseLine, id: string) {
    const material = materials.value.find((item) => item.id === id)
    line.materialCode = material?.materialCode ?? ''
    line.materialDescription = material?.materialDescription ?? ''
    line.specification = material?.specification ?? ''
    line.unit = material?.unit ?? ''
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
  async function importSourceLines() {
    const source = sourceDocuments.value.find((item) => item.id === header.sourceId)
    if (!source) return
    const available = await fetchScmPurchaseRemainingLines(source)
    availableSourceLines.value = available.filter(
      (line) => !lines.value.some((current) => current.sourceLineId === line.sourceLineId)
    )
    if (!availableSourceLines.value.length) {
      ElMessage.warning('来源单据已无未转换数量')
      return
    }
    sourceLineKeyword.value = ''
    sourceLineDateRange.value = []
    selectedSourceLineIds.value = []
    await sourceLineDialogRef.value?.handleOpen(undefined, {
      title: `选择来源明细 · ${source.documentNo}`,
      confirmText: '带入选中明细',
      onConfirm: () => {
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
        lines.value.push(...selected)
        return true
      }
    })
  }
  async function importQuotationLines() {
    if (!eligibleQuotations.value.length) {
      ElMessage.warning('当前项目暂无已生效的销售报价单')
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
        lines.value.push(
          ...purchaseLines.map((line) => ({
            ...newLine(),
            materialId: line.materialId,
            materialCode: line.materialCode,
            materialDescription: line.materialDescription,
            specification: line.specification ?? '',
            unit: line.salesUnit ?? '',
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            sourceDocumentNo: quote.documentNo
          }))
        )
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
    deliveryPlans.value.push({
      id: crypto.randomUUID(),
      plannedDate: '',
      quantity: 1,
      plannedBaseQuantity: 1,
      deliveredQuantity: 0,
      location: '',
      address: '',
      remark: ''
    })
  }
  function copyDelivery(plan: ScmPurchaseDeliveryPlan) {
    deliveryPlans.value.push({ ...plan, id: crypto.randomUUID(), deliveredQuantity: 0 })
  }
  function addClause() {
    clauses.value.push({ id: crypto.randomUUID(), title: '', content: '' })
  }
  function generateBatch(line: ScmPurchaseLine) {
    line.batchNo = `LOT-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
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
    if (kind.value !== 'purchase_request' && !header.supplierId) {
      ElMessage.warning('请选择供应商')
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
    try {
      if (!(await headerFormRef.value?.validate()) || !validateBusiness()) return false
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
        lines: lines.value,
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
    try {
      await Promise.all(
        ['scmContractClause', 'scmContractEffectiveness', 'scmDiscountMode'].map((code) =>
          userStore.ensureDictLoaded(code)
        )
      )
    } catch {
      ElMessage.warning('采购字典加载失败，请刷新页面重试')
      return
    }
    preparing = true
    kind.value = options.kind
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
      paymentMode: options.record?.details.paymentMode ?? 'amount'
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
      options.record?.lines.map((line) => ({
        ...line,
        lineId: options.copy ? crypto.randomUUID() : line.lineId,
        sourceLineId: options.copy ? undefined : line.sourceLineId,
        sourceDocumentNo:
          options.copy && (kind.value === 'purchase_order' || kind.value === 'receipt_notice')
            ? undefined
            : line.sourceDocumentNo,
        batchNo: options.copy ? undefined : line.batchNo,
        serialNumbers: options.copy ? undefined : line.serialNumbers
      })) ?? []
    if (options.generate) {
      for (const line of lines.value) {
        if (options.generate === 'batch') generateBatch(line)
        else generateSerial(line)
      }
    }
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
    await nextTick()
    preparing = false
    void loadReferences(header.tenantId)
    await dialogRef.value?.handleOpen(options, {
      title: options.copy
        ? `复制${config.value.title} · ${options.record?.documentNo}`
        : options.record
          ? `编辑${config.value.title} · ${options.record.documentNo}`
          : `新增${config.value.title}`,
      confirmText: recordId.value ? '保存更改' : '创建单据',
      onConfirm: handleSubmit,
      onOpen: () => headerFormRef.value?.clearValidate(),
      dialogProps: { closeOnClickModal: false }
    })
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
      if (!preparing && sourceId) void importSourceLines()
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
