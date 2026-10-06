<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtSectionCard
        title="选择目标单据"
        subtitle="系统复制报价的项目、客户、物料、数量与价格，并保留转单审计关系。"
      >
        <ElSegmented
          v-model="targetKind"
          :options="targetOptions"
          class="max-w-full"
          aria-label="报价转单目标"
        />
      </ArtSectionCard>

      <ArtSectionCard
        v-if="targetKind === 'purchase_order'"
        title="采购信息"
        subtitle="采购订单必须指定供应商；采购申请可在后续询比价后再确定供应商。"
        :loading="loading"
        :error="loadError"
        :empty="!loading && !loadError && suppliers.length === 0"
        empty-title="暂无可选供应商"
        empty-description="请先维护报价所属租户的供应商资料。"
        @retry="retryLoad"
      >
        <label class="flex min-w-0 flex-col gap-1 text-sm text-[var(--art-gray-700)]">
          供应商
          <ElSelect
            v-model="supplierId"
            filterable
            :loading="loading"
            placeholder="请选择采购订单供应商"
          >
            <ElOption
              v-for="supplier in suppliers"
              :key="supplier.id"
              :label="`${supplier.supplierName} · ${supplier.supplierCode}`"
              :value="supplier.id"
            />
          </ElSelect>
        </label>
      </ArtSectionCard>

      <ElAlert :title="targetDescription" type="info" :closable="false" show-icon />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import {
    convertScmStandardQuotation,
    fetchScmSupplierOptions,
    type ScmQuotationConversionResult,
    type ScmQuotationConversionTarget,
    type ScmSalesDocument,
    type ScmSupplierOption
  } from '@scm/api'

  defineOptions({ name: 'QuotationConversionDialog' })

  interface OpenOptions {
    quotation: ScmSalesDocument
    targets: ScmQuotationConversionTarget[]
  }

  const emit = defineEmits<{ success: [result: ScmQuotationConversionResult] }>()
  const dialogRef = ref<ArtDialogExpose<OpenOptions>>()
  const quotation = ref<ScmSalesDocument>()
  const {
    detail: supplierOptions,
    loading,
    loadError,
    openDetail,
    loadDetail,
    retryLoad
  } = useDetailRecord<ScmSupplierOption[]>(
    (tenantId) => fetchScmSupplierOptions(tenantId),
    '供应商列表加载失败，请重试'
  )
  const suppliers = computed(() => supplierOptions.value ?? [])
  const targetKind = ref<ScmQuotationConversionTarget>('sales_order')
  const supplierId = ref('')
  let openRevision = 0
  const route = useRoute()
  watch(
    () => route.fullPath,
    () => {
      openRevision += 1
      openDetail('')
    }
  )
  const allowedTargets = ref<ScmQuotationConversionTarget[]>([])

  const targetLabels: Record<ScmQuotationConversionTarget, string> = {
    sales_order: '销售订单',
    sales_contract: '销售合同',
    purchase_request: '采购申请',
    purchase_order: '采购订单'
  }
  const targetOptions = computed(() =>
    allowedTargets.value.map((value) => ({ label: targetLabels[value], value }))
  )
  const targetDescription = computed(() => {
    if (targetKind.value === 'sales_order') return '生成销售订单草稿，继续维护交付与收款计划。'
    if (targetKind.value === 'sales_contract')
      return '生成销售合同草稿，继续维护合同条款与收款计划。'
    if (targetKind.value === 'purchase_request')
      return '生成采购申请草稿，仅转换已关联物料编码的报价明细。'
    return '生成采购订单草稿，仅转换已关联物料编码的报价明细，并绑定所选供应商。'
  })

  async function handleConfirm(): Promise<boolean> {
    const source = quotation.value
    const revision = openRevision
    if (!source) return false
    if (!allowedTargets.value.includes(targetKind.value)) {
      ElMessage.warning('当前账号没有目标单据的新增权限')
      return false
    }
    if (targetKind.value === 'purchase_order' && !supplierId.value) {
      ElMessage.warning('请选择采购订单供应商')
      return false
    }
    if (targetKind.value === 'purchase_order' && (loading.value || loadError.value)) {
      ElMessage.warning('请等待供应商列表加载成功后重试')
      return false
    }
    try {
      const { data } = await convertScmStandardQuotation(
        source.id,
        targetKind.value,
        supplierId.value || null
      )
      if (revision !== openRevision) return false
      if (!data) {
        ElMessage.error('转单未返回目标单据，请刷新报价后重试')
        return false
      }
      emit('success', data)
      return true
    } catch (error) {
      if (revision === openRevision)
        notifyFriendlyError(error, '报价转单失败，请检查报价状态和目标单据权限后重试')
      return false
    }
  }

  async function handleOpen(options: OpenOptions): Promise<void> {
    if (!options.targets.length) {
      ElMessage.warning('请先为当前角色分配目标单据的新增权限')
      return
    }
    quotation.value = options.quotation
    openRevision += 1
    allowedTargets.value = options.targets
    targetKind.value = options.targets[0]
    supplierId.value = ''
    openDetail(options.quotation.tenantId)
    await dialogRef.value?.handleOpen(options, {
      title: `报价转单 · ${options.quotation.documentNo}`,
      subtitle: '一次选择一个目标单据；重复提交会返回已生成的草稿，不会重复建单。',
      confirmText: '生成目标单据',
      onOpen: () => {
        if (targetKind.value === 'purchase_order' && !loading.value)
          void loadDetail(options.quotation.tenantId)
      },
      onClose: () => {
        openRevision += 1
        openDetail('')
        quotation.value = undefined
      },
      onConfirm: handleConfirm,
      dialogProps: { closeOnClickModal: false }
    })
  }

  watch(targetKind, (target) => {
    const tenantId = quotation.value?.tenantId
    if (target === 'purchase_order' && tenantId && !supplierOptions.value && !loading.value)
      void loadDetail(tenantId)
  })

  defineExpose({ handleOpen })
</script>
