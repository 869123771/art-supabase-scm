<template>
  <ArtDialog ref="dialogRef" size="xl">
    <template #subtitle
      >选择项目、填写报价数量与单价，并按需添加费用。总价在保存时由数据库重新核算。</template
    >
    <div class="flex min-w-0 flex-col gap-4">
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :validate-on-rule-change="false"
        :span="12"
        :gutter="20"
        label-width="110px"
        :show-reset="false"
        :show-submit="false"
      />

      <ArtSectionCard
        title="附加费用"
        subtitle="费用定义来自当前租户；同一费用只能添加一次。"
        :empty="!form.tenantId || !form.feeItems.length"
        :empty-title="form.tenantId ? '暂无附加费用' : '请先选择所属租户'"
        :empty-description="
          form.tenantId ? '可添加费用，也可直接保存报价项。' : '选择租户后可添加费用。'
        "
      >
        <template #actions>
          <ElButton
            type="primary"
            plain
            :disabled="!form.tenantId || !availableExpenses.length || form.feeItems.length >= 30"
            @click="addFee"
          >
            <ArtSvgIcon icon="ri:add-line" />
            添加费用
          </ElButton>
        </template>
        <div class="flex flex-col gap-2">
          <div
            v-for="(fee, index) in form.feeItems"
            :key="index"
            class="grid min-w-0 grid-cols-1 items-center gap-2 rounded-lg border border-[var(--el-border-color-light)] p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto]"
          >
            <ElSelect
              v-model="fee.expenseId"
              filterable
              :loading="referencesLoading"
              placeholder="选择报价费用"
              class="w-full"
              :aria-label="`第 ${index + 1} 项费用名称`"
            >
              <ElOption
                v-for="expense in availableExpenses"
                :key="expense.id"
                :label="`${expense.expenseName}（${expense.expenseCode}）`"
                :value="expense.id"
                :disabled="
                  form.feeItems.some(
                    (item, itemIndex) => itemIndex !== index && item.expenseId === expense.id
                  )
                "
              />
            </ElSelect>
            <ElInputNumber
              v-model="fee.amount"
              :min="0"
              :precision="2"
              :controls="false"
              class="w-full!"
              :aria-label="`第 ${index + 1} 项费用金额`"
            />
            <ElButton
              type="danger"
              text
              :aria-label="`移除第 ${index + 1} 项费用`"
              @click="removeFee(index)"
            >
              移除
            </ElButton>
          </div>
        </div>
      </ArtSectionCard>

      <div
        class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--el-fill-color-light)] px-4 py-3 text-sm"
      >
        <span class="text-[var(--art-gray-600)]">数量 × 单价 + 附加费用</span>
        <strong class="text-lg font-semibold text-[var(--el-color-primary)]">{{
          formatCurrencyValue(previewTotal)
        }}</strong>
      </div>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    createQuoteCategory,
    fetchQuoteExpenses,
    fetchScmProjectOptions,
    updateQuoteCategory,
    type QuoteCategoryWrite,
    type ScmProjectOption,
    type ScmQuoteCategory,
    type ScmQuoteExpense
  } from '@scm/api'

  defineOptions({ name: 'ScmQuoteCategoryDialog' })

  interface OpenOptions {
    record?: ScmQuoteCategory
    copy?: boolean
    tenantOptions: Array<{ label: string; value: string }>
    effectiveTenantId: string | null
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const { shouldExposeTenantField } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<OpenOptions>>()
  const formRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const recordId = ref<string>()
  const tenantOptions = ref<OpenOptions['tenantOptions']>([])
  const availableProjects = ref<ScmProjectOption[]>([])
  const availableExpenses = ref<ScmQuoteExpense[]>([])
  const referencesLoading = ref(false)
  let loadingRevision = 0
  let preparing = false

  const initialForm = (): QuoteCategoryWrite => ({
    tenantId: '',
    projectId: '',
    categoryName: '',
    quantity: 1,
    unitPrice: 0,
    feeItems: [],
    remark: ''
  })
  const form = reactive<QuoteCategoryWrite>(initialForm())

  const previewTotal = computed(
    () =>
      Number(form.quantity || 0) * Number(form.unitPrice || 0) +
      form.feeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  )

  const rules = computed<FormRules<QuoteCategoryWrite>>(() => ({
    tenantId: [{ required: true, message: '请选择所属租户', trigger: 'change' }],
    projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
    categoryName: [
      { required: true, message: '请输入报价项分类', trigger: 'blur' },
      { max: 120, message: '分类名称不能超过 120 个字符', trigger: 'blur' }
    ],
    quantity: [
      { required: true, message: '请输入报价数量', trigger: 'change' },
      { type: 'number', min: 0.001, message: '报价数量须大于 0', trigger: 'change' }
    ],
    unitPrice: [
      { required: true, message: '请输入单价', trigger: 'change' },
      { type: 'number', min: 0, message: '单价不能小于 0', trigger: 'change' }
    ],
    remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
  }))

  const items = computed<FormItem[]>(() => [
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
              placeholder: '选择报价项所属租户'
            }
          } as FormItem
        ]
      : []),
    { label: '报价项', key: 'definitionSection', type: 'divider', span: 24 },
    {
      label: '项目名称',
      key: 'projectId',
      type: 'select',
      span: 12,
      props: {
        options: availableProjects.value.map((project) => ({
          label: `${project.projectName}（${project.projectCode}）`,
          value: project.id
        })),
        filterable: true,
        loading: referencesLoading.value,
        disabled: !form.tenantId,
        placeholder: form.tenantId ? '请选择项目' : '请先选择租户'
      }
    },
    { label: '报价项分类', key: 'categoryName', type: 'input', props: { maxlength: 120 } },
    {
      label: '报价数量',
      key: 'quantity',
      type: 'number',
      props: { min: 0.001, precision: 3, controlsPosition: 'right', class: 'w-full!' }
    },
    {
      label: '单价（元）',
      key: 'unitPrice',
      type: 'number',
      props: { min: 0, precision: 2, controlsPosition: 'right', class: 'w-full!' }
    },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])

  async function loadReferences(tenantId: string): Promise<void> {
    const revision = ++loadingRevision
    availableProjects.value = []
    availableExpenses.value = []
    if (!tenantId) return
    referencesLoading.value = true
    try {
      const [projects, expenses] = await Promise.all([
        fetchScmProjectOptions(tenantId),
        fetchQuoteExpenses({ tenantId, enabled: true })
      ])
      if (revision !== loadingRevision) return
      availableProjects.value = projects.data ?? []
      availableExpenses.value = expenses.data ?? []
    } catch {
      if (revision === loadingRevision) {
        availableProjects.value = []
        availableExpenses.value = []
      }
    } finally {
      if (revision === loadingRevision) referencesLoading.value = false
    }
  }

  function addFee(): void {
    if (form.feeItems.length >= 30) return
    const next = availableExpenses.value.find(
      (expense) => !form.feeItems.some((item) => item.expenseId === expense.id)
    )
    if (next) form.feeItems.push({ expenseId: next.id, amount: 0 })
  }

  function removeFee(index: number): void {
    form.feeItems.splice(index, 1)
  }

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await formRef.value?.validate())) return false
      if (
        form.feeItems.some(
          (item) => !item.expenseId || !Number.isFinite(item.amount) || item.amount < 0
        )
      ) {
        ElMessage.warning('请完整选择报价费用并填写非负金额')
        return false
      }
      if (recordId.value) await updateQuoteCategory(recordId.value, form)
      else await createQuoteCategory(form)
      emit('success', recordId.value ? 'edit' : 'add')
      return true
    } catch {
      // API 边界已给出业务安全的错误提示，保留表单供修正。
      return false
    }
  }

  async function handleOpen(options: OpenOptions): Promise<void> {
    preparing = true
    recordId.value = options.copy ? undefined : options.record?.id
    tenantOptions.value = options.tenantOptions
    Object.assign(form, initialForm(), options.record ?? {}, {
      tenantId: options.record?.tenantId ?? options.effectiveTenantId ?? '',
      feeItems: options.record?.feeItems.map((fee) => ({ ...fee })) ?? [],
      remark: options.record?.remark ?? ''
    })
    await nextTick()
    preparing = false
    await loadReferences(form.tenantId)
    await dialogRef.value?.handleOpen(options, {
      title: options.copy
        ? `复制报价项 · ${options.record?.categoryName ?? ''}`
        : options.record
          ? `编辑报价项 · ${options.record.categoryName}`
          : '新增报价项分类',
      confirmText: recordId.value ? '保存更改' : '创建报价项',
      onConfirm: handleSubmit,
      onOpen: () => formRef.value?.clearValidate(),
      dialogProps: { closeOnClickModal: false }
    })
  }

  watch(
    () => form.tenantId,
    (tenantId, previous) => {
      if (preparing || tenantId === previous) return
      form.projectId = ''
      form.feeItems = []
      void loadReferences(tenantId)
    }
  )

  defineExpose({ handleOpen })
</script>
