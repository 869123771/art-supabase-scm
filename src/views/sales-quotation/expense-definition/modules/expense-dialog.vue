<template>
  <ArtDialog ref="dialogRef" size="md">
    <template #subtitle>维护报价可选费用的稳定编码、状态和显示方式。</template>
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="items"
      :rules="rules"
      :validate-on-rule-change="false"
      :span="12"
      :gutter="20"
      label-width="106px"
      :show-reset="false"
      :show-submit="false"
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useTenantScopeFormPolicy } from '@/hooks/core/useTenantScopeFormPolicy'
  import {
    createQuoteExpense,
    updateQuoteExpense,
    type QuoteExpenseWrite,
    type ScmQuoteExpense
  } from '@scm/api'

  defineOptions({ name: 'ScmQuoteExpenseDialog' })

  interface OpenOptions {
    record?: ScmQuoteExpense
    tenantOptions: Array<{ label: string; value: string }>
    effectiveTenantId: string | null
  }

  const emit = defineEmits<{ success: [mode: 'add' | 'edit'] }>()
  const { shouldExposeTenantField } = useTenantScopeFormPolicy()
  const dialogRef = ref<ArtDialogExpose<OpenOptions>>()
  const formRef = ref<{ validate: () => Promise<boolean>; clearValidate: () => void }>()
  const recordId = ref<string>()
  const tenantOptions = ref<OpenOptions['tenantOptions']>([])

  const initialForm = (): QuoteExpenseWrite => ({
    tenantId: '',
    expenseCode: '',
    expenseName: '',
    enabled: true,
    remark: '',
    sortOrder: 100,
    textColor: '',
    tagStyle: 'plain'
  })
  const form = reactive<QuoteExpenseWrite>(initialForm())

  const rules = computed<FormRules<QuoteExpenseWrite>>(() => ({
    tenantId: [
      { required: shouldExposeTenantField.value, message: '请选择所属租户', trigger: 'change' }
    ],
    expenseCode: [
      { required: true, message: '请输入报价费用编码', trigger: 'blur' },
      {
        pattern: /^[A-Za-z0-9_-]{2,40}$/,
        message: '编码限 2–40 位字母、数字、下划线或中横线',
        trigger: 'blur'
      }
    ],
    expenseName: [
      { required: true, message: '请输入报价费用名称', trigger: 'blur' },
      { min: 2, max: 80, message: '名称长度应为 2–80 个字符', trigger: 'blur' }
    ],
    textColor: [{ pattern: /^(|#[0-9A-Fa-f]{6})$/, message: '请输入六位十六进制颜色值' }],
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
              placeholder: '请选择本条费用定义所属租户'
            }
          } as FormItem
        ]
      : []),
    { label: '费用定义', key: 'definitionSection', type: 'divider', span: 24 },
    { label: '费用编码', key: 'expenseCode', type: 'input', props: { maxlength: 40 } },
    { label: '费用名称', key: 'expenseName', type: 'input', props: { maxlength: 80 } },
    {
      label: '启用状态',
      key: 'enabled',
      type: 'radioGroup',
      props: {
        options: [
          { label: '启用', value: true },
          { label: '禁用', value: false }
        ]
      }
    },
    {
      label: '排序',
      key: 'sortOrder',
      type: 'number',
      props: { min: 0, max: 9999, controlsPosition: 'right', class: 'w-full!' }
    },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 3, maxlength: 500, showWordLimit: true }
    },
    { label: '显示设置', key: 'displaySection', type: 'divider', span: 24 },
    {
      label: '文字颜色',
      key: 'textColor',
      type: 'input',
      props: { placeholder: '跟随主题，或输入 #RRGGBB', maxlength: 7 }
    },
    {
      label: '标签样式',
      key: 'tagStyle',
      type: 'radioGroup',
      props: {
        options: [
          { label: '描边', value: 'plain' },
          { label: '浅色', value: 'light' },
          { label: '深色', value: 'dark' }
        ]
      }
    }
  ])

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await formRef.value?.validate())) return false
      if (recordId.value) await updateQuoteExpense(recordId.value, form)
      else await createQuoteExpense(form)
      emit('success', recordId.value ? 'edit' : 'add')
      return true
    } catch {
      // API 边界已显示业务安全的错误；保留表单供用户修正。
      return false
    }
  }

  async function handleOpen(options: OpenOptions): Promise<void> {
    recordId.value = options.record?.id
    tenantOptions.value = options.tenantOptions
    Object.assign(form, initialForm(), options.record ?? {}, {
      tenantId: options.record?.tenantId ?? options.effectiveTenantId ?? '',
      remark: options.record?.remark ?? ''
    })
    await dialogRef.value?.handleOpen(options, {
      title: options.record ? `编辑报价费用 · ${options.record.expenseName}` : '新增报价费用',
      confirmText: options.record ? '保存更改' : '创建费用',
      onConfirm: handleSubmit,
      onOpen: () => formRef.value?.clearValidate(),
      dialogProps: { closeOnClickModal: false }
    })
  }

  defineExpose({ handleOpen })
</script>
