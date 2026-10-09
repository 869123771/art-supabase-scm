<template>
  <ArtDialog ref="dialogRef" size="sm">
    <ArtForm
      ref="formRef"
      v-model="form.data"
      :items="form.items"
      :rules="form.rules"
      :span="24"
      :show-submit="false"
      :show-reset="false"
    >
      <template #buyer>
        <ArtEmployeeSelect
          v-model="form.data.buyer"
          :tenant-id="form.tenantId"
          placeholder="选择采购员"
        />
      </template>
    </ArtForm>
  </ArtDialog>
</template>
<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import { batchScmPurchaseDocuments, type ScmPurchaseSelection } from '@scm/api'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { ElMessage } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  defineOptions({ name: 'ScmPurchaseBuyerDialog' })
  const emit = defineEmits<{ success: [] }>()
  const { hasAuth } = useAuth()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = reactive({
    data: { buyer: '' },
    tenantId: '',
    selections: [] as ScmPurchaseSelection[],
    items: [{ key: 'buyer', label: '采购员', type: 'slot' }] as FormItem[],
    rules: { buyer: [{ required: true, message: '请选择采购员', trigger: 'change' }] }
  })
  async function handleOpen(selections: ScmPurchaseSelection[], tenantId: string): Promise<void> {
    if (!hasAuth('ScmPurchaseRequest:Edit')) return
    Object.assign(form, { data: { buyer: '' }, tenantId, selections })
    await dialogRef.value?.handleOpen(undefined, {
      title: '批量设置采购员',
      subtitle: `修改 ${selections.length} 份采购申请草稿的采购员。`,
      confirmText: '保存采购员',
      onConfirm: async () => {
        try {
          await formRef.value?.validate()
          await batchScmPurchaseDocuments('buyer', form.selections, form.data.buyer)
          ElMessage.success('采购员已更新')
          emit('success')
          return true
        } catch (error) {
          notifyFriendlyError(error, '采购员更新失败，请刷新后重试')
          return false
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
