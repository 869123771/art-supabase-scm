<template>
  <div class="min-w-0">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-[var(--art-gray-600)]">{{
        shipping
          ? '选单可批量带入销售订单明细；直接添加物料时不关联销售订单。辅助数量按物料单位换算。'
          : contract || order
            ? '参选来源明细或批量添加物料；金额随输入实时核算。'
            : '直接新增空行，或从物料编码批量参选。金额随输入实时核算。'
      }}</p>
      <div class="flex flex-wrap gap-2">
        <ElButton
          v-if="!contract && !order && !shipping"
          :disabled="disabled || manualDisabled || lines.length >= 200"
          @click="addBlankLine"
        >
          <ArtSvgIcon icon="ri:add-line" /> 手工新增
        </ElButton>
        <ElButton
          type="primary"
          plain
          :disabled="disabled || manualDisabled || !materials.length"
          @click="openPicker"
        >
          <ArtSvgIcon icon="ri:list-check-2" />
          {{ contract || order || shipping ? '添加物料' : '参选物料' }}
        </ElButton>
        <ElButton v-if="shipping" type="primary" :disabled="disabled" @click="emit('selectOrder')">
          <ArtSvgIcon icon="ri:file-list-3-line" /> 选单
        </ElButton>
        <ElButton
          v-if="contract || order"
          type="primary"
          :disabled="disabled || !quotationDocuments.length"
          @click="openQuotationPicker"
        >
          <ArtSvgIcon icon="ri:file-list-3-line" /> 参选报价明细
        </ElButton>
        <ElButton
          v-if="order"
          type="primary"
          :disabled="disabled || !contractDocuments.length"
          @click="openSourcePicker('sales_contract')"
        >
          <ArtSvgIcon icon="ri:file-text-line" /> 参选销售合同
        </ElButton>
      </div>
    </div>
    <ArtTable
      ref="tableRef"
      :data="lines"
      :columns="columns"
      :pagination="false"
      row-key="lineId"
      table-layout="fixed"
      border
      show-summary
      :summary-method="summaryMethod"
      :height="Math.min(450, 94 + lines.length * 53)"
      scrollbar-always-on
      class="scm-quotation-summary-table w-full"
      :empty-text="shipping ? '暂无发货明细' : '暂无物料明细'"
      :empty-description="
        shipping ? '点击“选单”或“添加物料”开始填写。' : '点击“手工新增”或“参选物料”开始填写。'
      "
    />
    <ArtTableMultipleSelect
      ref="pickerRef"
      v-model="selectedMaterialIds"
      :data="materials"
      :columns="materialPickerColumns"
      :title="shipping ? '添加物料' : '参选物料编码'"
      :subtitle="
        shipping
          ? '可多选物料批量添加；描述和数量可在发货明细中调整。'
          : '可多选物料批量添加；描述和价格仍可在明细表中调整。'
      "
      row-key="id"
      :label-key="materialPickerLabel"
      description-key="materialCode"
      search-placeholder="搜索物料编码或描述"
      :show-pagination="false"
      reset-draft-on-open
      @confirm="confirmMaterials"
    >
      <template #trigger><span class="hidden" /></template>
    </ArtTableMultipleSelect>
    <ArtDialog ref="quotationPickerRef" size="xl">
      <div class="flex min-w-0 flex-col gap-3">
        <ElInput
          v-model="quotationKeyword"
          clearable
          :placeholder="`搜索${sourcePickerKind === 'sales_contract' ? '合同' : '报价'}单号、物料编码或描述`"
          aria-label="搜索报价明细"
        />
        <ArtTable
          :data="filteredSourceLines"
          :columns="quotationColumns"
          :pagination="false"
          :max-height="420"
          :row-key="quotationChoiceKey"
          border
          :empty-text="`暂无可参选的${sourcePickerKind === 'sales_contract' ? '合同' : '报价'}明细`"
          empty-description="请调整搜索条件或先创建有效的来源单据。"
          @selection-change="selectQuotationLines"
        />
        <p class="text-xs text-[var(--art-gray-600)]"
          >已选 {{ selectedQuotationLines.length }} 行 · 最多 200 行</p
        >
      </div>
    </ArtDialog>
  </div>
</template>

<script setup lang="tsx">
  import {
    ElCheckbox,
    ElDatePicker,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElOption,
    ElSelect
  } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectColumn
  } from '@/components/core/forms/art-data-select/types'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type { ColumnOption } from '@/types'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { normalizeStringList } from '@/utils/form/normalize'
  import type { ScmDocumentLine, ScmMaterialOption, ScmSalesDocument } from '@scm/api'
  import '../quotation-summary-table.css'
  import {
    calculateContractLine,
    calculateQuotationLine,
    contractAuxiliaryQuantity,
    quotationTaxExclusivePrice,
    quotationTaxInclusivePrice
  } from '../quotation-pricing'

  defineOptions({ name: 'QuotationLineTable' })
  const lines = defineModel<ScmDocumentLine[]>('lines', { required: true })
  const props = withDefaults(
    defineProps<{
      materials: ScmMaterialOption[]
      disabled: boolean
      contract?: boolean
      order?: boolean
      engineering?: boolean
      operational?: boolean
      shipping?: boolean
      manualDisabled?: boolean
      quotationDocuments?: ScmSalesDocument[]
      contractDocuments?: ScmSalesDocument[]
      projectId?: string
      customerId?: string
      sourceOptions: Array<{ label: string; value: string }>
      taxRates: Array<{ label: string; value: string | number }>
      discountOptions: Array<{ label: string; value: string }>
    }>(),
    {
      contract: false,
      order: false,
      engineering: false,
      operational: false,
      shipping: false,
      manualDisabled: false,
      quotationDocuments: () => [],
      contractDocuments: () => []
    }
  )
  const emit = defineEmits<{
    sourceSelected: [source: Pick<ScmSalesDocument, 'projectId' | 'customerId' | 'currency'>]
    selectOrder: []
  }>()
  const pickerRef = ref<ArtDataSelectExpose>()
  const quotationPickerRef = ref<ArtDialogExpose>()
  const tableRef = ref<ArtTableExpose>()
  const selectedMaterialIds = ref<string[]>([])
  const materialPickerLabel = (row: { materialDescription?: string }): string =>
    row.materialDescription || '未命名物料'
  const materialPickerColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 220 },
    { prop: 'specification', label: '规格型号', minWidth: 160 },
    { prop: 'unit', label: '单位', width: 90 }
  ]
  const quotationKeyword = ref('')
  const sourcePickerKind = ref<'sales_quotation' | 'sales_contract'>('sales_quotation')
  interface QuotationLineChoice extends ScmDocumentLine {
    documentNo: string
    sourceDocumentId: string
    lineNo: number
  }
  const selectedQuotationLines = ref<QuotationLineChoice[]>([])
  const quotationColumns: ColumnOption<QuotationLineChoice>[] = [
    { type: 'selection', width: 48 },
    { prop: 'documentNo', label: '来源单号', minWidth: 160 },
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    {
      prop: 'materialDescription',
      label: '物料描述',
      minWidth: 210,
      showOverflowTooltip: true
    },
    { prop: 'quantity', label: '数量', width: 90, align: 'right' }
  ]
  const quotationChoiceKey = (row: QuotationLineChoice): string =>
    `${row.sourceDocumentId}:${row.lineId || row.lineNo}`
  const filteredSourceLines = computed(() => {
    const keyword = quotationKeyword.value.trim().toLocaleLowerCase()
    const documents =
      sourcePickerKind.value === 'sales_contract'
        ? props.contractDocuments
        : props.quotationDocuments
    return documents
      .filter(
        (document) =>
          (!props.projectId || document.projectId === props.projectId) &&
          (!props.customerId || document.customerId === props.customerId)
      )
      .flatMap((document) =>
        document.lines.map((line, index) => ({
          ...line,
          documentNo: document.documentNo,
          sourceDocumentId: document.id,
          lineNo: index + 1
        }))
      )
      .filter(
        (line) =>
          !keyword ||
          `${line.documentNo} ${line.materialCode} ${line.materialDescription}`
            .toLocaleLowerCase()
            .includes(keyword)
      )
  })
  const calculateLine = (line: ScmDocumentLine) =>
    props.contract || props.order ? calculateContractLine(line) : calculateQuotationLine(line)
  const materialFor = (line: ScmDocumentLine) =>
    props.materials.find((material) => material.id === line.materialId)
  const auxiliaryQuantity = (line: ScmDocumentLine, second = false) => {
    const calculated = contractAuxiliaryQuantity(
      line.quantity,
      second ? materialFor(line)?.auxiliaryUnit2Id : materialFor(line)?.auxiliaryUnitId,
      materialFor(line)
    )
    return props.shipping
      ? calculated
      : (calculated ?? (second ? line.auxiliaryQuantity2 : line.auxiliaryQuantity))
  }

  function newLine(): ScmDocumentLine {
    return {
      lineId: crypto.randomUUID(),
      materialId: '',
      materialCode: '',
      materialDescription: '',
      materialSource: '',
      quantity: 1,
      unitPrice: 0,
      taxRate: 13,
      costUnitPrice: 0,
      gift: false,
      discountMode: 'none',
      discountRate: 0
    }
  }
  function addBlankLine(): void {
    if (lines.value.length < 200) lines.value = [...lines.value, newLine()]
  }
  function removeLine(index: number): void {
    lines.value = lines.value.filter((_, lineIndex) => lineIndex !== index)
  }
  function applyMaterial(line: ScmDocumentLine, id: string): void {
    const material = props.materials.find((item) => item.id === id)
    line.materialCode = material?.materialCode ?? ''
    if (material) {
      line.materialDescription = material.materialDescription
      line.specification = material.specification ?? ''
      line.salesUnit = material.unit ?? ''
      line.materialSource = material.materialSource ?? ''
      line.auxiliaryUnit = material.auxiliaryUnit ?? ''
      line.auxiliaryUnit2 = material.auxiliaryUnit2 ?? ''
    }
  }
  function updateInclusivePrice(line: ScmDocumentLine, price?: number): void {
    line.unitPrice = quotationTaxExclusivePrice(price ?? 0, line.taxRate)
  }
  function resetDiscount(line: ScmDocumentLine): void {
    if (!line.discountMode || line.discountMode === 'none') line.discountRate = 0
  }

  const columns = computed<ColumnOption<ScmDocumentLine>[]>(() => [
    {
      prop: 'lineId',
      label: '#',
      width: 52,
      fixed: 'left',
      align: 'center',
      formatter: (row) => String(lines.value.findIndex((line) => line.lineId === row.lineId) + 1)
    },
    ...(props.engineering || props.operational
      ? [
          {
            type: 'expand' as const,
            prop: 'extra',
            label: '',
            width: 48,
            formatter: (row: ScmDocumentLine) => (
              <div class="grid min-w-0 grid-cols-2 gap-3 p-4 text-xs md:grid-cols-4">
                <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                  规格型号
                  <ElInput v-model={row.specification} maxlength={100} placeholder="可选" />
                </label>
                {props.engineering && (
                  <>
                    <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                      品牌
                      <ElInput v-model={row.brand} maxlength={100} placeholder="可选" />
                    </label>
                    <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                      分部工程
                      <ElSelect
                        v-model={row.division}
                        filterable
                        allowCreate
                        defaultFirstOption
                        clearable
                        placeholder="天花 / 地面 / 墙面"
                        class="w-full!"
                      >
                        {['天花', '地面', '墙面'].map((division) => (
                          <ElOption key={division} value={division} label={division} />
                        ))}
                      </ElSelect>
                    </label>
                    <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                      单台数量 / 辅助数量
                      <ElInputNumber
                        v-model={row.unitQuantity}
                        min={0}
                        precision={3}
                        controls={false}
                        class="w-full!"
                      />
                    </label>
                  </>
                )}
                <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                  生产厂家
                  <ElInput v-model={row.manufacturer} maxlength={100} placeholder="可选" />
                </label>
                <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                  销售单位
                  <ElInput v-model={row.salesUnit} maxlength={30} placeholder="单位" />
                </label>
                <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                  成本单价（元）
                  <ElInputNumber
                    v-model={row.costUnitPrice}
                    min={0}
                    precision={2}
                    controls={false}
                    class="w-full!"
                  />
                </label>
                {props.operational && (
                  <>
                    <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                      仓库
                      <ElInput v-model={row.warehouse} maxlength={100} placeholder="可选" />
                    </label>
                    <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                      仓位
                      <ElInput v-model={row.location} maxlength={100} placeholder="可选" />
                    </label>
                    <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)]">
                      要货日期
                      <ElDatePicker
                        v-model={row.needDate}
                        type="date"
                        valueFormat="YYYY-MM-DD"
                        class="w-full!"
                      />
                    </label>
                  </>
                )}
                <label class="flex min-w-0 flex-col gap-1 text-[var(--art-gray-600)] md:col-span-2">
                  备注
                  <ElInput v-model={row.remark} maxlength={300} placeholder="可选" />
                </label>
              </div>
            )
          }
        ]
      : []),
    {
      prop: 'materialId',
      label: '物料编码',
      width: 180,
      fixed: 'left',
      formatter: (row) => (
        <ElSelect
          v-model={row.materialId}
          filterable
          clearable
          placeholder="手填或参选"
          style={{ width: '100%' }}
          aria-label="物料编码"
          onChange={(id: string) => applyMaterial(row, id)}
        >
          {props.materials.map((material) => (
            <ElOption
              key={material.id}
              value={material.id}
              label={`${material.materialCode} · ${material.materialDescription}`}
            />
          ))}
        </ElSelect>
      )
    },
    {
      prop: 'materialDescription',
      label: '物料描述',
      minWidth: 190,
      required: true,
      requiredMessage: ({ rowIndex }) => `第 ${rowIndex + 1} 行缺少物料描述`,
      formatter: (row) => (
        <ElInput
          v-model={row.materialDescription}
          maxlength={200}
          placeholder="填写描述"
          aria-label="物料描述"
        />
      )
    },
    ...(props.contract || props.order
      ? [
          {
            prop: 'auxiliaryQuantity',
            label: '辅助数量',
            width: 105,
            align: 'right' as const,
            formatter: (row: ScmDocumentLine) => String(auxiliaryQuantity(row) ?? '—')
          },
          {
            prop: 'auxiliaryUnit',
            label: '辅助单位',
            width: 100,
            formatter: (row: ScmDocumentLine) =>
              materialFor(row)?.auxiliaryUnit ?? row.auxiliaryUnit ?? '—'
          },
          {
            prop: 'auxiliaryQuantity2',
            label: '辅助数量2',
            width: 105,
            align: 'right' as const,
            formatter: (row: ScmDocumentLine) => String(auxiliaryQuantity(row, true) ?? '—')
          },
          {
            prop: 'auxiliaryUnit2',
            label: '辅助单位2',
            width: 100,
            formatter: (row: ScmDocumentLine) =>
              materialFor(row)?.auxiliaryUnit2 ?? row.auxiliaryUnit2 ?? '—'
          }
        ]
      : []),
    {
      prop: 'materialSource',
      label: '物料来源',
      width: 125,
      required: !props.contract && !props.order && !props.operational,
      requiredMessage: ({ rowIndex }) => `第 ${rowIndex + 1} 行未选择物料来源`,
      rules: {
        validator: ({ value }) =>
          props.contract ||
          props.order ||
          props.operational ||
          props.sourceOptions.some((item) => item.value === value),
        message: '请选择有效的物料来源'
      },
      formatter: (row) => (
        <ElSelect
          v-model={row.materialSource}
          placeholder="请选择"
          style={{ width: '100%' }}
          aria-label="物料来源"
        >
          {props.sourceOptions.map((item) => (
            <ElOption key={item.value} value={item.value} label={item.label} />
          ))}
        </ElSelect>
      )
    },
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
        />
      )
    },
    ...(props.shipping
      ? [
          {
            prop: 'auxiliaryQuantity',
            label: '辅助数量',
            width: 110,
            align: 'right' as const,
            formatter: (row: ScmDocumentLine) => String(auxiliaryQuantity(row) ?? '—')
          },
          {
            prop: 'auxiliaryUnit',
            label: '辅助单位',
            width: 100,
            formatter: (row: ScmDocumentLine) => materialFor(row)?.auxiliaryUnit ?? '—'
          }
        ]
      : []),
    ...(props.shipping
      ? []
      : [
          {
            prop: 'unitPrice',
            label: '单价（元）',
            width: 135,
            align: 'right',
            required: true,
            rules: {
              validator: ({ value }: { value: unknown }) =>
                Number.isFinite(Number(value)) && Number(value) >= 0,
              message: '单价不能小于 0'
            },
            formatter: (row: ScmDocumentLine) => (
              <ElInputNumber
                v-model={row.unitPrice}
                min={0}
                precision={4}
                controls={false}
                class="w-full!"
                aria-label="未税单价"
              />
            )
          },
          {
            prop: 'taxInclusivePrice',
            label: '含税单价（元）',
            width: 150,
            align: 'right',
            formatter: (row: ScmDocumentLine) => (
              <ElInputNumber
                modelValue={quotationTaxInclusivePrice(row)}
                min={0}
                precision={4}
                controls={false}
                class="w-full!"
                aria-label="含税单价"
                onUpdate:modelValue={(price: number | undefined) =>
                  updateInclusivePrice(row, price)
                }
              />
            )
          },
          {
            prop: 'taxRate',
            label: '税率（%）',
            width: 120,
            required: true,
            rules: {
              validator: ({ value }: { value: unknown }) =>
                props.taxRates.some((rate) => Number(rate.value) === Number(value)),
              message: '请选择有效的税率'
            },
            formatter: (row: ScmDocumentLine) => (
              <ElSelect
                v-model={row.taxRate}
                placeholder="请选择"
                style={{ width: '100%' }}
                aria-label="税率"
              >
                {props.taxRates.map((rate) => (
                  <ElOption key={rate.value} value={Number(rate.value)} label={rate.label} />
                ))}
              </ElSelect>
            )
          },
          {
            prop: 'discountMode',
            label: '折扣方式',
            width: 130,
            formatter: (row: ScmDocumentLine) => (
              <ElSelect
                v-model={row.discountMode}
                style={{ width: '100%' }}
                aria-label="折扣方式"
                onChange={() => resetDiscount(row)}
              >
                {props.discountOptions.map((option) => (
                  <ElOption key={option.value} value={option.value} label={option.label} />
                ))}
              </ElSelect>
            )
          },
          {
            prop: 'discountRate',
            label: '单位折扣（率）',
            width: 145,
            align: 'right',
            formatter: (row: ScmDocumentLine) => (
              <ElInputNumber
                v-model={row.discountRate}
                min={0}
                max={100}
                precision={2}
                controls={false}
                disabled={!row.discountMode || row.discountMode === 'none'}
                class="w-full!"
                aria-label="单位折扣率"
              />
            )
          },
          {
            prop: 'discount',
            label: '折扣额（元）',
            width: 130,
            align: 'right',
            formatter: (row: ScmDocumentLine) => (
              <span class="tabular-nums">{formatCurrencyValue(calculateLine(row).discount)}</span>
            )
          },
          {
            prop: 'amount',
            label: '金额（元）',
            width: 130,
            align: 'right',
            formatter: (row: ScmDocumentLine) => (
              <strong class="tabular-nums">{formatCurrencyValue(calculateLine(row).amount)}</strong>
            )
          },
          {
            prop: 'tax',
            label: '税额（元）',
            width: 120,
            align: 'right',
            formatter: (row: ScmDocumentLine) => (
              <span class="tabular-nums">{formatCurrencyValue(calculateLine(row).tax)}</span>
            )
          },
          {
            prop: 'total',
            label: '价税合计（元）',
            width: 150,
            align: 'right',
            formatter: (row: ScmDocumentLine) => (
              <strong class="tabular-nums">{formatCurrencyValue(calculateLine(row).total)}</strong>
            )
          },
          {
            prop: 'gift',
            label: '赠品',
            width: 76,
            align: 'center',
            formatter: (row: ScmDocumentLine) => <ElCheckbox v-model={row.gift} aria-label="赠品" />
          }
        ]),
    ...(props.contract || props.order || props.shipping
      ? [
          {
            prop: 'sourceDocumentNo',
            label: '来源单据',
            width: 165,
            formatter: (row: ScmDocumentLine) => row.sourceDocumentNo || '—'
          },
          {
            prop: 'sourceLineNo',
            label: '源行号',
            width: 80,
            formatter: (row: ScmDocumentLine) => row.sourceLineNo || '—'
          }
        ]
      : []),
    {
      prop: 'operation',
      label: '操作',
      width: 68,
      fixed: 'right',
      align: 'center',
      formatter: (row) => (
        <ArtIconButton
          icon="ri:delete-bin-line"
          label="移除明细"
          tone="danger"
          onClick={() => removeLine(lines.value.indexOf(row))}
        />
      )
    }
  ])
  function summaryMethod({ columns }: { columns: Array<{ property?: string }> }): string[] {
    const totals = lines.value.reduce(
      (result, line) => {
        const calculated = calculateLine(line)
        result.quantity += line.quantity
        result.auxiliaryQuantity += auxiliaryQuantity(line) ?? 0
        result.amount += calculated.amount
        result.tax += calculated.tax
        result.total += calculated.total
        return result
      },
      { quantity: 0, auxiliaryQuantity: 0, amount: 0, tax: 0, total: 0 }
    )
    return columns.map((column) => {
      if (column.property === 'materialId') return '合计'
      if (column.property === 'quantity') return String(Math.round(totals.quantity * 1000) / 1000)
      if (column.property === 'auxiliaryQuantity')
        return String(Math.round(totals.auxiliaryQuantity * 1000) / 1000)
      if (column.property === 'amount') return formatCurrencyValue(totals.amount)
      if (column.property === 'tax') return formatCurrencyValue(totals.tax)
      if (column.property === 'total') return formatCurrencyValue(totals.total)
      return ''
    })
  }
  async function openPicker(): Promise<void> {
    selectedMaterialIds.value = []
    await pickerRef.value?.open()
  }
  function confirmMaterials(value: unknown): void {
    const ids = normalizeStringList(value)
    if (!ids.length) {
      ElMessage.warning('请至少选择一项物料')
      return
    }
    if (lines.value.length + ids.length > 200) {
      ElMessage.warning('物料明细最多 200 行')
      return
    }
    lines.value = [
      ...lines.value,
      ...ids.map((id) => {
        const line = newLine()
        line.materialId = id
        applyMaterial(line, id)
        return line
      })
    ]
  }

  function selectQuotationLines(rows: QuotationLineChoice[]): void {
    selectedQuotationLines.value = rows
  }
  async function openQuotationPicker(): Promise<void> {
    await openSourcePicker('sales_quotation')
  }
  async function openSourcePicker(sourceKind: 'sales_quotation' | 'sales_contract'): Promise<void> {
    sourcePickerKind.value = sourceKind
    quotationKeyword.value = ''
    selectedQuotationLines.value = []
    await quotationPickerRef.value?.handleOpen(undefined, {
      title: sourceKind === 'sales_contract' ? '参选销售合同明细' : '参选报价明细',
      confirmText: '添加所选明细',
      onConfirm: () => {
        if (!selectedQuotationLines.value.length) {
          ElMessage.warning('请选择至少一行来源明细')
          return false
        }
        if (lines.value.length + selectedQuotationLines.value.length > 200) {
          ElMessage.warning('单据明细最多 200 行')
          return false
        }
        const sourceDocuments =
          sourceKind === 'sales_contract' ? props.contractDocuments : props.quotationDocuments
        const chosenDocuments = sourceDocuments.filter((document) =>
          selectedQuotationLines.value.some((line) => line.sourceDocumentId === document.id)
        )
        const first = chosenDocuments[0]
        if (
          !first ||
          chosenDocuments.some(
            (document) =>
              document.projectId !== first.projectId || document.customerId !== first.customerId
          )
        ) {
          ElMessage.warning('所选明细须属于同一个项目和客户')
          return false
        }
        emit('sourceSelected', first)
        lines.value = [
          ...lines.value,
          ...selectedQuotationLines.value.map((source) => ({
            ...source,
            lineId: crypto.randomUUID(),
            discountMode: source.discountMode === 'fixed' ? 'percentage' : source.discountMode,
            sourceLineId: source.lineId,
            sourceDocumentId: source.sourceDocumentId,
            sourceLineNo: source.lineNo,
            sourceDocumentNo: source.documentNo
          }))
        ]
        return true
      }
    })
  }

  async function validate(): Promise<boolean> {
    const result = await tableRef.value?.validate()
    if (!result?.valid) {
      ElMessage.warning(result?.firstError?.message ?? '请完善物料明细')
      return false
    }
    return true
  }

  defineExpose({ validate, openSourcePicker })
</script>
