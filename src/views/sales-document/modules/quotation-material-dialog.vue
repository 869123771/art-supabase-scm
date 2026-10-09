<template>
  <ArtDialog ref="dialogRef" :loading="loading" loading-text="正在加载物料配置…" size="xl">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtSectionCard
        title="待生成报价明细"
        :subtitle="`共 ${pendingLines.length} 行待生成。选择本批明细；各业务单位默认等于基本单位，可逐行修改。`"
      >
        <ArtTable
          ref="lineTableRef"
          :data="pendingLines"
          :columns="lineColumns"
          :pagination="false"
          row-key="key"
          @selection-change="selectedLines = $event"
          :max-height="240"
          class="w-full!"
        />
      </ArtSectionCard>
      <ArtSectionCard
        title="物料编码配置"
        subtitle="选项与 MDM 物料编码主数据一致。"
        :error="loadError"
        @retry="retryLoad"
      >
        <ArtForm
          ref="formRef"
          :model-value="form"
          @update:model-value="replaceReactiveModel(form, $event)"
          :items="formItems"
          :rules="rules"
          :span="12"
          :gutter="20"
          label-width="110px"
          :show-reset="false"
          :show-submit="false"
        >
          <template #imageUrls>
            <ArtUploadImage
              v-model="form.imageUrls"
              :resource-tenant-id="quotation?.tenantId ?? ''"
              multiple
              :limit="5"
              :size="92"
              tip="支持上传或从资源库选择，最多 5 张"
            />
          </template>
        </ArtForm>
      </ArtSectionCard>
    </div>
  </ArtDialog>
</template>

<script setup lang="tsx">
  import { toNameCodeOption } from '@/utils/form/option'

  import {
    quotationActionLines,
    selectedQuotationDocuments,
    normalizeQuotationSelection,
    type QuotationActionLine
  } from '../quotation-selection'
  import type { ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import { computed, reactive, ref, watch } from 'vue'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { ElMessage, ElSelect, ElOption, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import { useUserStore } from '@/store/modules/user'
  import type { ColumnOption } from '@/types'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import {
    fetchScmEngineeringReferenceOptions,
    batchScmQuotationAction,
    type ScmQuotationMaterialLineConfig,
    type ScmEngineeringReferenceOptions,
    type ScmQuotationMaterialConfig,
    type ScmSalesDocument
  } from '@scm/api'

  defineOptions({ name: 'QuotationMaterialDialog' })

  const emit = defineEmits<{ success: [] }>()
  const userStore = useUserStore()
  const dialogRef = ref<ArtDialogExpose<ScmSalesDocument>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const quotation = ref<ScmSalesDocument>()
  const quotations = ref<ScmSalesDocument[]>([])
  type MaterialRow = QuotationActionLine & ScmQuotationMaterialLineConfig
  const pendingLines = ref<MaterialRow[]>([])
  const selectedLines = ref<MaterialRow[]>([])
  const lineTableRef = ref<ArtTableExpose>()
  const unitKeys = [
    'purchaseUnitId',
    'salesUnitId',
    'inventoryUnitId',
    'productionUnitId',
    'costUnitId'
  ] as const
  const { detail, loading, loadError, openDetail, loadDetail, retryLoad } =
    useDetailRecord<ScmEngineeringReferenceOptions>(async (tenantId) => {
      await userStore.ensureDictLoaded('mdmMaterialSource')
      return await fetchScmEngineeringReferenceOptions(tenantId)
    }, '物料主数据加载失败，请重试')
  const references = computed(
    () =>
      detail.value ?? {
        categories: [],
        materialTypes: [],
        units: [],
        codeRules: []
      }
  )
  let openRevision = 0
  const route = useRoute()
  watch(
    () => route.fullPath,
    () => {
      openRevision += 1
      openDetail('')
    }
  )
  const form = reactive<ScmQuotationMaterialConfig>({
    materialTypeId: '',
    materialSource: 'self_made',
    categoryId: '',
    baseUnitId: '',
    codeRuleId: '',
    imageUrls: []
  })
  function changeBaseUnit(row: MaterialRow, previous: string) {
    for (const key of unitKeys) if (!row[key] || row[key] === previous) row[key] = row.baseUnitId
  }
  const unitColumns: Array<{ key: (typeof unitKeys)[number] | 'baseUnitId'; label: string }> = [
    { key: 'baseUnitId', label: '基本单位' },
    { key: 'purchaseUnitId', label: '采购单位' },
    { key: 'salesUnitId', label: '销售单位' },
    { key: 'inventoryUnitId', label: '库存单位' },
    { key: 'productionUnitId', label: '生产单位' },
    { key: 'costUnitId', label: '成本单位' }
  ]
  const lineColumns: ColumnOption<MaterialRow>[] = [
    { type: 'selection', width: 48 },
    { prop: 'documentNo', label: '报价单号', minWidth: 165 },
    { prop: 'lineNo', label: '行号', width: 75 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 210, showOverflowTooltip: true },
    { prop: 'specification', label: '规格型号', minWidth: 150, showOverflowTooltip: true },
    { prop: 'brand', label: '品牌', minWidth: 120, showOverflowTooltip: true },
    ...unitColumns.map(({ key, label }): ColumnOption<MaterialRow> => ({
      prop: key,
      label,
      minWidth: 135,
      rules: {
        validator: ({ row }) =>
          !selectedLines.value.some((line) => line.key === row.key) || Boolean(row[key]),
        message: `请选择${label}`
      },
      formatter: (row) => {
        const previous = row.baseUnitId
        return (
          <ElSelect
            v-model={row[key]}
            filterable
            aria-label={`第${row.lineNo}行${label}`}
            onChange={() => {
              if (key === 'baseUnitId') changeBaseUnit(row, previous)
            }}
          >
            {references.value.units.map((unit) => (
              <ElOption key={unit.id} value={unit.id} label={unit.name} />
            ))}
          </ElSelect>
        )
      }
    })),
    { prop: 'quantity', label: '数量', width: 100, align: 'right' }
  ]
  const formItems = computed<FormItem[]>(() => [
    {
      label: '物料类型',
      key: 'materialTypeId',
      type: 'select',
      props: {
        options: references.value.materialTypes.map((item) => ({
          label: item.name,
          value: item.id
        })),
        filterable: true,
        placeholder: '请选择物料类型'
      }
    },
    {
      label: '物料来源',
      key: 'materialSource',
      type: 'select',
      props: {
        options: userStore.getDictMap?.mdmMaterialSource ?? [],
        placeholder: '请选择物料来源'
      }
    },
    {
      label: '物料分类',
      key: 'categoryId',
      type: 'select',
      props: {
        options: references.value.categories.map(toNameCodeOption),
        filterable: true,
        placeholder: '请选择物料分类'
      }
    },
    {
      label: '缺省基本单位',
      key: 'baseUnitId',
      type: 'select',
      props: {
        options: references.value.units.map((item) => ({ label: item.name, value: item.id })),
        filterable: true,
        placeholder: '请选择基本单位'
      }
    },
    {
      label: '编码策略',
      key: 'codeRuleId',
      type: 'select',
      span: 24,
      props: {
        options: references.value.codeRules.map((item) => ({
          label: item.name,
          value: item.id
        })),
        filterable: true,
        placeholder: '请选择编码策略'
      }
    },
    { label: '图片', key: 'imageUrls', type: 'slot', span: 24 }
  ])
  const rules: FormRules<ScmQuotationMaterialConfig> = {
    materialTypeId: [{ required: true, message: '请选择物料类型', trigger: 'change' }],
    materialSource: [{ required: true, message: '请选择物料来源', trigger: 'change' }],
    categoryId: [{ required: true, message: '请选择物料分类', trigger: 'change' }],
    codeRuleId: [{ required: true, message: '请选择编码策略', trigger: 'change' }]
  }

  async function handleConfirm(): Promise<boolean> {
    const source = quotation.value
    const revision = openRevision
    if (!source || loading.value || loadError.value) return false
    if (!selectedLines.value.length) {
      ElMessage.warning('请先选择本批待生成明细')
      return false
    }
    try {
      if ((await lineTableRef.value?.validate())?.valid === false) return false
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (revision !== openRevision) return false
      await batchScmQuotationAction(
        'materials',
        selectedQuotationDocuments(quotations.value, selectedLines.value),
        {
          ...form,
          imageUrls: [...form.imageUrls],
          lineConfigs: selectedLines.value.map((row) => ({
            quotationId: row.quotationId,
            lineId: row.lineId,
            baseUnitId: row.baseUnitId,
            purchaseUnitId: row.purchaseUnitId,
            salesUnitId: row.salesUnitId,
            inventoryUnitId: row.inventoryUnitId,
            productionUnitId: row.productionUnitId,
            costUnitId: row.costUnitId
          }))
        }
      )
      if (revision !== openRevision) return false
      emit('success')
      return true
    } catch (error) {
      if (revision === openRevision)
        notifyFriendlyError(error, '物料编码生成失败，请检查配置、报价状态和权限后重试')
      return false
    }
  }

  async function handleOpen(input: ScmSalesDocument | ScmSalesDocument[]): Promise<void> {
    const records = normalizeQuotationSelection(input)
    const record = records[0]
    if (!record || new Set(records.map((item) => item.tenantId)).size !== 1) {
      ElMessage.warning('请按租户分别选择报价单')
      return
    }
    quotations.value = records
    selectedLines.value = []
    pendingLines.value = quotationActionLines(records)
      .filter((line) => !line.materialId)
      .map((line) => ({
        ...line,
        baseUnitId: '',
        purchaseUnitId: '',
        salesUnitId: '',
        inventoryUnitId: '',
        productionUnitId: '',
        costUnitId: ''
      }))
    if (record.status !== 'draft' || !record.lines.some((line) => !line.materialId)) {
      ElMessage.warning('请选择有未编码明细的报价草稿')
      return
    }
    quotation.value = record
    openRevision += 1
    openDetail(record.tenantId)
    Object.assign(form, {
      materialTypeId: '',
      materialSource: 'self_made',
      categoryId: '',
      baseUnitId: '',
      codeRuleId: '',
      imageUrls: []
    })
    await dialogRef.value?.handleOpen(record, {
      title: `生成物料编码 · ${records.length} 张报价`,
      confirmText: '执行生成',
      onOpen: () => loadDetail(record.tenantId),
      onClose: () => {
        openRevision += 1
        openDetail('')
        quotation.value = undefined
      },
      onConfirm: handleConfirm,
      dialogProps: { closeOnClickModal: false }
    })
  }

  watch(detail, (options) => {
    if (!options) return
    form.materialTypeId ||= options.materialTypes.find((item) => item.name === '半成品')?.id ?? ''
    form.categoryId ||= options.categories.find((item) => item.name === '配件')?.id ?? ''
    form.baseUnitId ||= options.units.find((item) => item.name === '件')?.id ?? ''
    for (const row of pendingLines.value) {
      if (!row.baseUnitId)
        row.baseUnitId =
          options.units.find(
            (unit) =>
              unit.id === row.baseUnit || unit.code === row.baseUnit || unit.name === row.baseUnit
          )?.id || form.baseUnitId
      changeBaseUnit(row, '')
    }
    form.codeRuleId ||=
      options.codeRules.find((item) => item.name.includes('半成品'))?.id ??
      options.codeRules[0]?.id ??
      ''
    if (form.materialSource === 'self_made')
      form.materialSource = String(
        (userStore.getDictMap?.mdmMaterialSource ?? []).find((item) => item.label === '自制')
          ?.value ?? 'self_made'
      )
  })
  watch(
    () => form.baseUnitId,
    (value) => {
      for (const row of pendingLines.value)
        if (!row.baseUnitId) {
          row.baseUnitId = value
          changeBaseUnit(row, '')
        }
    }
  )
  defineExpose({ handleOpen })
</script>
