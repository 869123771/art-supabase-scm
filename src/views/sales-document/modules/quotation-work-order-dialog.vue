<template>
  <ArtDialog ref="dialogRef" :loading="loading" loading-text="正在加载工单配置…" size="lg">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtSectionCard
        title="选择报价物料清单"
        :subtitle="`仅能选择已关联物料编码的明细，当前可选 ${availableLines.length} 行。`"
      >
        <ArtTable
          :data="availableLines"
          :columns="lineColumns"
          :pagination="false"
          row-key="key"
          :max-height="300"
          class="w-full!"
          empty-text="暂无已编码的报价明细"
          @selection-change="selectedLines = $event"
        />
        <p class="mt-2 text-xs text-[var(--art-gray-600)]">已选 {{ selectedLines.length }} 行</p>
      </ArtSectionCard>
      <ArtSectionCard
        title="生产工单配置"
        subtitle="每条选中明细生成一张工单，项目从报价单带入。"
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
          label-width="112px"
          :show-reset="false"
          :show-submit="false"
        />
      </ArtSectionCard>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue'
  import {
    quotationActionLines,
    selectedQuotationDocuments,
    normalizeQuotationSelection,
    type QuotationActionLine
  } from '../quotation-selection'
  import { replaceReactiveModel } from '@/utils/form/model'
  import dayjs from 'dayjs'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import type { ColumnOption } from '@/types'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import {
    batchScmQuotationAction,
    fetchScmDocumentTypeOptions,
    type ScmDocumentTypeOption,
    type ScmQuotationWorkOrderConfig,
    type ScmSalesDocument
  } from '@scm/api'

  defineOptions({ name: 'QuotationWorkOrderDialog' })

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<ScmSalesDocument>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const quotation = ref<ScmSalesDocument>()
  const quotations = ref<ScmSalesDocument[]>([])
  const { detail, loading, loadError, openDetail, loadDetail, retryLoad } = useDetailRecord<
    ScmDocumentTypeOption[]
  >((tenantId) => fetchScmDocumentTypeOptions(tenantId, 'MesWorkOrder'), '工单类型加载失败，请重试')
  const documentTypes = computed(() => detail.value ?? [])
  let openRevision = 0
  const route = useRoute()
  watch(
    () => route.fullPath,
    () => {
      openRevision += 1
      openDetail('')
    }
  )
  const selectedLines = ref<QuotationActionLine[]>([])
  const form = reactive<ScmQuotationWorkOrderConfig>({
    workOrderTypeId: '',
    constructionNo: '',
    plannedStartDate: dayjs().format('YYYY-MM-DD'),
    plannedEndDate: ''
  })
  const availableLines = computed(() =>
    quotationActionLines(quotations.value).filter((line) => line.materialId)
  )
  const lineColumns: ColumnOption<QuotationActionLine>[] = [
    { type: 'selection', width: 48, fixed: 'left' },
    { prop: 'documentNo', label: '报价单号', minWidth: 160 },
    { prop: 'lineNo', label: '行号', width: 78 },
    { prop: 'materialCode', label: '物料编码', minWidth: 150, showOverflowTooltip: true },
    { prop: 'materialDescription', label: '物料描述', minWidth: 190, showOverflowTooltip: true },
    { prop: 'quantity', label: '下单数量', width: 115, align: 'right' }
  ]
  const formItems = computed<FormItem[]>(() => [
    {
      label: '工单类型',
      key: 'workOrderTypeId',
      type: 'select',
      props: {
        options: documentTypes.value.map((item) => ({
          label: item.documentTypeName,
          value: item.id
        })),
        filterable: true,
        placeholder: '请选择工单类型'
      }
    },
    { label: '项目', key: 'projectName', type: 'text', props: { disabled: true } },
    { label: '施工号', key: 'constructionNo', type: 'input', props: { placeholder: '选填' } },
    {
      label: '计划开始日期',
      key: 'plannedStartDate',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD' }
    },
    {
      label: '计划完工日期',
      key: 'plannedEndDate',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD' }
    }
  ])
  const rules: FormRules<ScmQuotationWorkOrderConfig> = {
    workOrderTypeId: [{ required: true, message: '请选择工单类型', trigger: 'change' }],
    plannedStartDate: [{ required: true, message: '请选择计划开始日期', trigger: 'change' }],
    plannedEndDate: [{ required: true, message: '请选择计划完工日期', trigger: 'change' }]
  }

  async function handleConfirm(): Promise<boolean> {
    const source = quotation.value
    const revision = openRevision
    if (!source || loading.value || loadError.value) return false
    if (!selectedLines.value.length) {
      ElMessage.warning('请先选择报价明细')
      return false
    }
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (revision !== openRevision) return false
      if (form.plannedEndDate < form.plannedStartDate) {
        ElMessage.warning('计划完工日期不能早于计划开始日期')
        return false
      }
      await batchScmQuotationAction(
        'work_orders',
        selectedQuotationDocuments(quotations.value, selectedLines.value),
        { ...form }
      )
      if (revision !== openRevision) return false
      emit('success')
      return true
    } catch (error) {
      if (revision === openRevision)
        notifyFriendlyError(error, '生产工单生成失败，请检查报价状态、物料编码和工单类型后重试')
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
    if (record.status !== 'effective' || !record.lines.some((line) => line.materialId)) {
      ElMessage.warning('请选择已审批通过且有物料编码的报价单')
      return
    }
    quotation.value = record
    openRevision += 1
    openDetail(record.tenantId)
    selectedLines.value = []
    Object.assign(form, {
      workOrderTypeId: '',
      constructionNo: '',
      plannedStartDate: dayjs().format('YYYY-MM-DD'),
      plannedEndDate: '',
      projectName: records.length > 1 ? '随各报价单带入' : (record.project?.projectName ?? '')
    })
    await dialogRef.value?.handleOpen(record, {
      title: `转生产工单 · ${records.length} 张报价`,
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

  watch(detail, (types) => {
    if (types && !form.workOrderTypeId)
      form.workOrderTypeId = types.find((item) => item.isDefault)?.id ?? ''
  })

  defineExpose({ handleOpen })
</script>
