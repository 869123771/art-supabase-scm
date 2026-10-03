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
      <ArtSectionCard title="物料编码配置" subtitle="选项与 MDM 物料编码主数据一致。">
        <ArtForm
          ref="formRef"
          v-model="form"
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
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
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
  const references = ref<ScmEngineeringReferenceOptions>({
    categories: [],
    materialTypes: [],
    units: [],
    codeRules: []
  })
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
    if (!quotation.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await generateScmQuotationMaterials(
        quotation.value.id,
        pendingLines.value.map((line) => line.lineId),
        { ...form, imageUrls: [...form.imageUrls] }
      )
      emit('success')
      return true
    } catch (error) {
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
      loading: true,
      loadingText: '正在加载物料主数据…',
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          await userStore.ensureDictLoaded('mdmMaterialSource')
          const response = await fetchScmEngineeringReferenceOptions(record.tenantId)
          references.value = response.data ?? {
            categories: [],
            materialTypes: [],
            units: [],
            codeRules: []
          }
          form.materialTypeId =
            references.value.materialTypes.find((item) => item.name === '半成品')?.id ?? ''
          form.categoryId =
            references.value.categories.find((item) => item.name === '配件')?.id ?? ''
          form.baseUnitId = references.value.units.find((item) => item.name === '件')?.id ?? ''
          form.codeRuleId =
            references.value.codeRules.find((item) => item.name.includes('半成品'))?.id ??
            references.value.codeRules[0]?.id ??
            ''
          form.materialSource = String(
            (userStore.getDictMap?.mdmMaterialSource ?? []).find((item) => item.label === '自制')
              ?.value ?? 'self_made'
          )
        } catch {
          ElMessage.warning('物料主数据加载失败，请关闭弹窗后重试')
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleConfirm,
      dialogProps: { closeOnClickModal: false }
    })
  }

  defineExpose({ handleOpen })
</script>
