<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtSectionCard
        title="报价 BOM 父件"
        subtitle="选择已建档的成品或半成品物料作为父件；报价明细将成为组件。"
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
          :span="24"
          label-width="96px"
          :show-reset="false"
          :show-submit="false"
        />
      </ArtSectionCard>
      <ArtSectionCard
        title="报价明细"
        :subtitle="`共 ${quotation?.lines.length ?? 0} 行。全部明细须已有物料编码；生成后可在 BOM 维护中复核。`"
      >
        <ArtTable
          :data="quotation?.lines ?? []"
          :columns="lineColumns"
          :pagination="false"
          row-key="lineId"
          :max-height="290"
          class="w-full!"
        />
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
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import type { ColumnOption } from '@/types'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import {
    convertScmQuotationToBom,
    fetchScmMaterialOptions,
    type ScmDocumentLine,
    type ScmMaterialOption,
    type ScmSalesDocument
  } from '@scm/api'

  defineOptions({ name: 'QuotationBomDialog' })

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<ScmSalesDocument>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const quotation = ref<ScmSalesDocument>()
  const { detail, loading, loadError, openDetail, loadDetail, retryLoad } = useDetailRecord<
    ScmMaterialOption[]
  >(fetchScmMaterialOptions, '父件物料加载失败，请重试')
  const materials = computed(() => detail.value ?? [])
  let openRevision = 0
  const route = useRoute()
  watch(
    () => route.fullPath,
    () => {
      openRevision += 1
      openDetail('')
    }
  )
  const form = reactive({ parentMaterialId: '' })
  const componentIds = computed(
    () => new Set(quotation.value?.lines.map((line) => line.materialId) ?? [])
  )
  const formItems = computed<FormItem[]>(() => [
    {
      label: '父件物料',
      key: 'parentMaterialId',
      type: 'select',
      props: {
        options: materials.value
          .filter((item) => item.baseUnitId && !componentIds.value.has(item.id))
          .map((item) => ({
            label: `${item.materialCode} · ${item.materialDescription}`,
            value: item.id
          })),
        filterable: true,
        placeholder: '请选择有基本单位的父件物料'
      }
    }
  ])
  const rules: FormRules = {
    parentMaterialId: [{ required: true, message: '请选择父件物料', trigger: 'change' }]
  }
  const lineColumns: ColumnOption<ScmDocumentLine>[] = [
    { prop: 'lineNo', label: '行号', width: 78 },
    { prop: 'materialCode', label: '物料编码', minWidth: 160, showOverflowTooltip: true },
    { prop: 'materialDescription', label: '物料描述', minWidth: 210, showOverflowTooltip: true },
    { prop: 'quantity', label: '用量', width: 110, align: 'right' }
  ]

  async function handleConfirm(): Promise<boolean> {
    const source = quotation.value
    const revision = openRevision
    if (!source || loading.value || loadError.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (revision !== openRevision) return false
      await convertScmQuotationToBom(source.id, form.parentMaterialId)
      if (revision !== openRevision) return false
      emit('success')
      return true
    } catch (error) {
      if (revision === openRevision)
        notifyFriendlyError(error, '转报价 BOM 失败，请检查父件、报价明细和权限后重试')
      return false
    }
  }

  async function handleOpen(record: ScmSalesDocument): Promise<void> {
    if (
      record.status !== 'effective' ||
      !record.lines.length ||
      record.lines.some((line) => !line.materialId)
    ) {
      ElMessage.warning('请选择已审批通过且所有明细已有物料编码的报价单')
      return
    }
    quotation.value = record
    openRevision += 1
    openDetail(record.tenantId)
    form.parentMaterialId = ''
    await dialogRef.value?.handleOpen(record, {
      title: `转报价 BOM · ${record.documentNo}`,
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

  defineExpose({ handleOpen })
</script>
