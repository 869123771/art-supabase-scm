<template>
  <ArtDialog
    ref="dialogRef"
    size="lg"
    :loading="loading || quantityLoading"
    loading-text="正在加载转单资料…"
  >
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
        :error="loadError"
        :empty="!loading && !loadError && suppliers.length === 0"
        empty-title="暂无可选供应商"
        empty-description="请先维护报价所属租户的供应商资料。"
        @retry="retryLoad"
      >
        <label class="flex min-w-0 flex-col gap-1 text-sm text-[var(--art-gray-700)]">
          供应商
          <ElSelect v-model="supplierId" filterable placeholder="请选择采购订单供应商">
            <ElOption
              v-for="supplier in suppliers"
              :key="supplier.id"
              :label="`${supplier.supplierName} · ${supplier.supplierCode}`"
              :value="supplier.id"
            />
          </ElSelect>
        </label>
      </ArtSectionCard>

      <ArtSectionCard
        v-if="targetKind !== 'sales_contract'"
        title="本批转单明细"
        subtitle="选择本批物料并填写数量；各目标单据分别累计，不得超过报价数量。"
        :error="quantityError"
        @retry="retryQuantities"
      >
        <ArtTable
          ref="lineTableRef"
          :data="conversionLines"
          :columns="lineColumns"
          :pagination="false"
          row-key="lineId"
          :max-height="300"
          class="w-full!"
          @selection-change="selectedLines = $event"
        />
        <p class="mt-2 text-xs text-[var(--art-gray-600)]">已选 {{ selectedLines.length }} 行</p>
      </ArtSectionCard>
      <ElAlert :title="targetDescription" type="info" :closable="false" show-icon />
    </div>
  </ArtDialog>
</template>

<script setup lang="tsx">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import { ElMessage, ElInputNumber } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { computed, ref, watch } from 'vue'
  import type { ColumnOption } from '@/types'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import {
    convertScmStandardQuotation,
    fetchScmSupplierOptions,
    fetchScmQuotationConversionQuantities,
    type ScmDocumentLine,
    type ScmQuotationConversionQuantity,
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
  type ConversionLine = ScmDocumentLine & {
    convertedQuantity: number
    remainingQuantity: number
    transferQuantity: number
  }
  const conversionLines = ref<ConversionLine[]>([])
  const selectedLines = ref<ConversionLine[]>([])
  const lineTableRef = ref<ArtTableExpose>()
  const requestId = ref(crypto.randomUUID())
  const {
    detail: quantities,
    loading: quantityLoading,
    loadError: quantityError,
    openDetail: openQuantities,
    loadDetail: loadQuantities,
    retryLoad: retryQuantities
  } = useDetailRecord<ScmQuotationConversionQuantity[]>(
    fetchScmQuotationConversionQuantities,
    '已转数量加载失败，请重试'
  )
  const lineColumns: ColumnOption<ConversionLine>[] = [
    {
      type: 'selection',
      width: 48,
      selectable: (row: ConversionLine) => row.remainingQuantity > 0
    },
    { prop: 'lineNo', label: '行号', width: 70 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 200, showOverflowTooltip: true },
    { prop: 'quantity', label: '报价数量', width: 105, align: 'right' },
    { prop: 'convertedQuantity', label: '已转数量', width: 105, align: 'right' },
    { prop: 'remainingQuantity', label: '剩余可转', width: 105, align: 'right' },
    {
      prop: 'transferQuantity',
      label: '本次数量',
      minWidth: 155,
      rules: {
        validator: ({ row }) =>
          !selectedLines.value.some((line) => line.lineId === row.lineId) ||
          (row.transferQuantity > 0 && row.transferQuantity <= row.remainingQuantity),
        message: '本次数量须大于零且不超过剩余可转数量'
      },
      formatter: (row) => (
        <ElInputNumber
          v-model={row.transferQuantity}
          min={0}
          max={row.remainingQuantity}
          precision={3}
          controls={false}
          disabled={row.remainingQuantity <= 0}
          aria-label={`第${row.lineNo}行本次转单数量`}
          class="w-full!"
        />
      )
    }
  ]
  function resetConversionLines() {
    selectedLines.value = []
    conversionLines.value = (quotation.value?.lines ?? []).map((line) => {
      const convertedQuantity = (quantities.value ?? [])
        .filter((item) => item.targetKind === targetKind.value && item.lineId === line.lineId)
        .reduce((sum, item) => sum + Number(item.quantity), 0)
      const remainingQuantity = Math.max(
        0,
        Number((Number(line.quantity) - convertedQuantity).toFixed(3))
      )
      return { ...line, convertedQuantity, remainingQuantity, transferQuantity: remainingQuantity }
    })
  }
  watch([quantities, targetKind], resetConversionLines)
  watch(
    [targetKind, supplierId, selectedLines, conversionLines],
    () => {
      requestId.value = crypto.randomUUID()
    },
    { deep: true }
  )
  let openRevision = 0
  const route = useRoute()
  watch(
    () => route.fullPath,
    () => {
      openRevision += 1
      openDetail('')
      openQuantities('')
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
    if (targetKind.value === 'sales_order')
      return '将自动生成销售订单草稿。单据类型可在草稿中补充，下达前必须填写。'
    if (targetKind.value === 'sales_contract')
      return '生成销售合同草稿，继续维护合同条款与收款计划。'
    if (targetKind.value === 'purchase_request')
      return '生成采购申请草稿，仅转换已关联物料编码的报价明细。'
    return '生成采购订单草稿并绑定供应商。采购员未指定时仅提醒，可在草稿中补充。'
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
    if (
      targetKind.value !== 'sales_contract' &&
      (quantityLoading.value || quantityError.value || !selectedLines.value.length)
    ) {
      ElMessage.warning(quantityError.value ? '请重试加载剩余数量' : '请选择本批转单明细')
      return false
    }
    try {
      if (
        targetKind.value !== 'sales_contract' &&
        (await lineTableRef.value?.validate())?.valid === false
      )
        return false
      const { data } = await convertScmStandardQuotation(
        source.id,
        targetKind.value,
        supplierId.value || null,
        selectedLines.value.map((line) => ({
          lineId: line.lineId,
          quantity: line.transferQuantity
        })),
        requestId.value
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
    openQuantities(options.quotation.id)
    requestId.value = crypto.randomUUID()
    resetConversionLines()
    openRevision += 1
    allowedTargets.value = options.targets
    targetKind.value = options.targets[0]
    supplierId.value = ''
    openDetail(options.quotation.tenantId)
    await dialogRef.value?.handleOpen(options, {
      title: `报价转单 · ${options.quotation.documentNo}`,
      subtitle: '按明细分批转单；同一批重试不会重复建单。',
      confirmText: '生成目标单据',
      onOpen: () => {
        void loadQuantities(options.quotation.id)
        if (targetKind.value === 'purchase_order' && !loading.value)
          void loadDetail(options.quotation.tenantId)
      },
      onClose: () => {
        openRevision += 1
        openDetail('')
        openQuantities('')
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
