<template>
  <ArtPermissionGuard permission="ScmProjectQuotation:View" resource-name="项目报价">
    <div v-if="legacyVisible" class="flex h-full min-h-0 flex-col gap-3">
      <div
        ><ElButton @click="legacyVisible = false"
          ><ArtSvgIcon icon="ri:arrow-left-line" />返回项目汇总</ElButton
        ></div
      >
      <LegacyWorkspace kind="project_quotation" class="min-h-0 flex-1" />
    </div>
    <div v-else class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        eyebrow="PROJECT QUOTATIONS"
        title="项目报价"
        description="审批通过的报价按项目归集，查看分类、明细、合同、采购与实时库存。"
        icon="ri:briefcase-4-line"
        :tags="[
          { label: '审批自动归集', type: 'primary' },
          { label: '项目业务追溯', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :api-fn="fetchPage"
        :columns-factory="columnsFactory"
        :search-items="searchItems"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 8, labelWidth: 82, showExpand: false }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '暂无项目报价',
          emptyDescription: '销售报价审批通过后，项目与相关业务资料将自动归集至此。'
        }"
        focusable
      />
      <ProjectDetailDrawer ref="detailRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
  import { ElButton } from 'element-plus'
  import { storeToRefs } from 'pinia'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { formatDateTimeValue, formatCompactNumberValue } from '@/utils/ui/format'
  import type { ColumnOption } from '@/types'
  import {
    fetchProjectQuotationProjects,
    type ProjectQuotationSummary,
    type ProjectQuotationQuery
  } from '@scm/api'
  import ProjectDetailDrawer from './project-detail-drawer.vue'

  defineOptions({ name: 'ScmProjectQuotationWorkspace' })
  const LegacyWorkspace = defineAsyncComponent(
    () => import('@scm/views/sales-document/scm-document-workspace.vue')
  )
  const legacyVisible = ref(false)
  const tableRef = ref<ArtTableQueryExpose>()
  const detailRef = ref<InstanceType<typeof ProjectDetailDrawer>>()
  const search = ref({ keyword: '', tenantId: '' })
  const userStore = useUserStore()
  const { isPlatformSuper } = storeToRefs(userStore)
  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId, tenantOptions } = storeToRefs(tenantScopeStore)
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      label: '项目报价单',
      permission: 'ScmProjectQuotation:View',
      icon: 'ri:file-list-3-line',
      onClick: () => {
        legacyVisible.value = true
      }
    }
  ]
  const searchItems = computed<SearchFormItem[]>(() => [
    ...(isPlatformSuper.value && !effectiveTenantId.value
      ? [
          {
            key: 'tenantId',
            label: '所属租户',
            type: 'select' as const,
            props: {
              options: tenantOptions.value.map((tenant) => ({
                value: tenant.id,
                label: `${tenant.tenantName}（${tenant.tenantCode}）`
              })),
              clearable: true,
              filterable: true,
              placeholder: '全部租户'
            }
          }
        ]
      : []),
    {
      key: 'keyword',
      label: '项目/客户',
      type: 'input',
      props: { placeholder: '项目编码、名称或客户', clearable: true }
    }
  ])
  function fetchPage(query: ProjectQuotationQuery) {
    return fetchProjectQuotationProjects({
      ...query,
      tenantId: effectiveTenantId.value || query.tenantId || undefined
    })
  }
  function openProject(row: ProjectQuotationSummary) {
    void detailRef.value?.handleOpen(row)
  }
  const columnsFactory = (): ColumnOption<ProjectQuotationSummary>[] => [
    {
      prop: 'projectName',
      label: '项目',
      minWidth: 260,
      fixed: 'left',
      formatter: (row) => (
        <div class="min-w-0 leading-5">
          <strong class="block truncate font-medium">{row.projectName}</strong>
          <small class="block truncate text-[var(--art-gray-600)]">{row.projectCode}</small>
        </div>
      ),
      link: { permission: 'ScmProjectQuotation:View', onClick: openProject }
    },
    { prop: 'customerName', label: '客户', minWidth: 210, showOverflowTooltip: true },
    {
      prop: 'quotationCount',
      label: '审批报价次数',
      width: 130,
      align: 'right',
      formatter: (row) => formatCompactNumberValue(row.quotationCount, 0)
    },
    { prop: 'latestQuotationNo', label: '最近报价单号', minWidth: 190, showOverflowTooltip: true },
    {
      prop: 'latestQuotationDate',
      label: '最近报价日期',
      width: 130,
      formatter: (row) => formatDateTimeValue(row.latestQuotationDate, { format: 'YYYY-MM-DD' })
    },
    {
      prop: 'projectStatus',
      label: '项目状态',
      width: 110,
      dict: { code: 'mdmProjectStatus', display: 'auto' }
    },
    {
      prop: 'operation',
      label: '操作',
      width: 72,
      fixed: 'right',
      formatter: (row) => (
        <ArtButtonTable
          permission="ScmProjectQuotation:View"
          type="view"
          onClick={() => openProject(row)}
        />
      )
    }
  ]
  onMounted(() => {
    void tenantScopeStore
      .loadTenantOptions()
      .catch((error) => notifyFriendlyError(error, '租户选项加载失败，请刷新重试'))
    void userStore
      .ensureDictLoaded('mdmProjectStatus')
      .catch((error) => notifyFriendlyError(error, '项目状态加载失败，请刷新重试'))
  })
</script>
