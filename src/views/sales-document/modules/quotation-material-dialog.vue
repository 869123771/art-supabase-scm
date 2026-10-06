<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtSectionCard
        title="待生成报价明细"
        :subtitle="`将为以下 ${pendingLines.length} 行生成独立物料编码，并返填到报价明细。`"
      >
        <ArtTable
          :data="pendingLines"
          :columns="lineColumns"
          :pagination="false"
          row-key="lineId"
          :max-height="240"
          class="w-full!"
        />
      </ArtSectionCard>
      <ArtSectionCard
        title="物料编码配置"
        subtitle="选项与 MDM 物料编码主数据一致。"
        :loading="loading"
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

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { ElMessage, type FormRules } from 'element-plus'
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
    generateScmQuotationMaterials,
    type ScmDocumentLine,
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
  const pendingLines = computed(
    () => quotation.value?.lines.filter((line) => !line.materialId) ?? []
  )
  const lineColumns: ColumnOption<ScmDocumentLine>[] = [
    { prop: 'lineNo', label: '行号', width: 80 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 210, showOverflowTooltip: true },
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
        options: references.value.categories.map((item) => ({
          label: `${item.name} · ${item.code}`,
          value: item.id
        })),
        filterable: true,
        placeholder: '请选择物料分类'
      }
    },
    {
      label: '基本单位',
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
    baseUnitId: [{ required: true, message: '请选择基本单位', trigger: 'change' }],
    codeRuleId: [{ required: true, message: '请选择编码策略', trigger: 'change' }]
  }

  async function handleConfirm(): Promise<boolean> {
    const source = quotation.value
    const revision = openRevision
    if (!source || loading.value || loadError.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (revision !== openRevision) return false
      await generateScmQuotationMaterials(
        source.id,
        pendingLines.value.map((line) => line.lineId),
        { ...form, imageUrls: [...form.imageUrls] }
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

  async function handleOpen(record: ScmSalesDocument): Promise<void> {
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
      title: `生成物料编码 · ${record.documentNo}`,
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
  defineExpose({ handleOpen })
</script>
