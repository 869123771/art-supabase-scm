<template>
  <Teleport to="body">
    <div class="purchase-request-print-batch" aria-hidden="true">
      <article v-for="record in records" :key="record.id" class="purchase-request-print-sheet">
        <h1>采购申请单</h1>
        <p class="purchase-request-print-sheet__number">{{ record.documentNo }}</p>
        <div class="purchase-request-print-sheet__meta">
          <span
            >日期：{{ formatDateTimeValue(record.documentDate, { format: 'YYYY-MM-DD' }) }}</span
          >
          <span>申请人：{{ record.details.applicantName || '—' }}</span>
          <span>申请部门：{{ record.details.department || '—' }}</span>
        </div>
        <table>
          <thead
            ><tr
              ><th>物料编号</th><th>物料描述</th><th>单位</th><th>数量</th><th>价格</th
              ><th>用途</th></tr
            ></thead
          >
          <tbody>
            <tr v-for="line in record.lines" :key="line.lineId">
              <td>{{ line.materialCode }}</td
              ><td>{{ line.materialDescription }}</td>
              <td>{{ unitDisplayName(record.tenantId, line.unit) }}</td>
              <td>{{ formatNumberValue(line.quantity) }}</td
              ><td>{{ formatNumberValue(line.unitPrice) }}</td
              ><td>{{ line.reason || '' }}</td>
            </tr>
            <tr
              ><td>备注</td><td colspan="5">{{ record.remark || '' }}</td></tr
            >
          </tbody>
        </table>
        <div class="purchase-request-print-sheet__signatures"
          ><span>审核：</span><span>负责人：</span
          ><span>采购员：{{ record.details.buyerName || '' }}</span
          ><span>部门领导：</span></div
        >
      </article>
    </div>
  </Teleport>
</template>
<script setup lang="ts">
  import type { ScmPurchaseDocument } from '@scm/api'
  import { formatDateTimeValue, formatNumberValue } from '@/utils/ui/format'
  import { useUnitDisplayNames } from '@/hooks/core/useUnitDisplayNames'
  defineOptions({ name: 'ScmPurchaseRequestPrintSheet' })
  const records = ref<ScmPurchaseDocument[]>([])
  const { loadUnitDisplayNames, unitDisplayName } = useUnitDisplayNames()
  async function print(rows: ScmPurchaseDocument[]): Promise<void> {
    await loadUnitDisplayNames(rows.map((row) => row.tenantId))
    records.value = rows
    await nextTick()
    document.body.classList.add('is-purchase-request-printing')
    const cleanup = () => {
      document.body.classList.remove('is-purchase-request-printing')
      records.value = []
    }
    window.addEventListener('afterprint', cleanup, { once: true })
    try {
      window.print()
    } catch (error) {
      cleanup()
      throw error
    }
  }
  onBeforeUnmount(() => document.body.classList.remove('is-purchase-request-printing'))
  defineExpose({ print })
</script>
<style lang="scss">
  .purchase-request-print-batch {
    display: none;
  }

  @media print {
    body.is-purchase-request-printing {
      color: #000;
      background: #fff;

      > *:not(.purchase-request-print-batch) {
        display: none !important;
      }

      > .purchase-request-print-batch {
        display: block !important;
      }
    }

    .purchase-request-print-sheet {
      padding: 8mm;
      font-family: 'Microsoft YaHei', Arial, sans-serif;
      font-size: 12px;
      color: #000;
      break-after: page;

      &:last-child {
        break-after: auto;
      }

      h1 {
        margin: 0 0 5mm;
        font-size: 24px;
        text-align: center;
        text-decoration: underline;
      }

      &__number {
        text-align: right;
      }

      &__meta,
      &__signatures {
        display: flex;
        gap: 4mm;
        justify-content: space-between;
        margin: 4mm 0;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 4mm 2mm;
        overflow-wrap: anywhere;
        border: 1px solid #000;
      }

      thead {
        display: table-header-group;
      }

      tr {
        break-inside: avoid;
      }
    }
  }
</style>
