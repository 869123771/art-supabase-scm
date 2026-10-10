<template>
  <Teleport to="body">
    <div class="purchase-request-print-batch" aria-hidden="true">
      <article v-for="record in records" :key="record.id" class="purchase-request-print-sheet">
        <h1>{{ record.kind === 'purchase_order' ? '采购订单' : '采购申请单' }}</h1>
        <p class="purchase-request-print-sheet__number">{{ record.documentNo }}</p>
        <div v-if="record.kind === 'purchase_request'" class="purchase-request-print-sheet__meta">
          <span
            >日期：{{ formatDateTimeValue(record.documentDate, { format: 'YYYY-MM-DD' }) }}</span
          >
          <span>申请人：{{ record.details.applicantName || '—' }}</span>
          <span>申请部门：{{ record.details.department || '—' }}</span>
        </div>
        <div v-else class="purchase-request-print-sheet__meta">
          <span>供应商：{{ record.supplier?.supplierName || '—' }}</span>
          <span>项目：{{ record.project?.projectName || '—' }}</span>
          <span
            >日期：{{ formatDateTimeValue(record.documentDate, { format: 'YYYY-MM-DD' }) }}</span
          >
        </div>
        <table v-if="record.kind === 'purchase_request'">
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
        <table v-else>
          <thead
            ><tr>
              <th>物料编号</th><th>物料描述</th><th>单位</th><th>数量</th><th>单价</th> <th>金额</th
              ><th>税额</th><th>折扣额</th><th>购货金额</th><th>交货日期</th>
            </tr></thead
          >
          <tbody>
            <tr v-for="line in record.lines" :key="line.lineId">
              <td>{{ line.materialCode }}</td
              ><td>{{ line.materialDescription }}</td>
              <td>{{ unitDisplayName(record.tenantId, line.unit) }}</td>
              <td>{{
                formatNumberValue(line.quantity, 'zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              }}</td>
              <td>{{
                formatNumberValue(line.unitPrice, 'zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              }}</td>
              <td>{{
                formatNumberValue(line.gift ? 0 : Number(line.quantity) * line.unitPrice, 'zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              }}</td>
              <td>{{
                formatNumberValue(lineTaxAmount(line, record.kind), 'zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              }}</td>
              <td>{{
                formatNumberValue(lineDiscountAmount(line, record.kind), 'zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              }}</td>
              <td>{{
                formatNumberValue(lineSubtotal(line, record.kind), 'zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              }}</td>
              <td>{{ line.needDate || record.deliveryDate || '—' }}</td>
            </tr>
            <tr
              ><td>总计：</td
              ><td colspan="3"
                >{{
                  formatNumberValue(orderSubtotal(record), 'zh-CN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })
                }}
                元</td
              >
              <td colspan="2">优惠金额</td
              ><td colspan="2">{{
                formatNumberValue(orderDiscount(record), 'zh-CN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })
              }}</td>
              <td>优惠率</td
              ><td
                >{{
                  formatNumberValue(orderDiscountRate(record), 'zh-CN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })
                }}%</td
              ></tr
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
  import { usePrintSheet } from '@/hooks/core/usePrintSheet'
  import type { ScmPurchaseDocument } from '@scm/api'
  import { formatDateTimeValue, formatNumberValue } from '@/utils/ui/format'
  import { useUnitDisplayNames } from '@/hooks/core/useUnitDisplayNames'
  import { lineSubtotal, lineTaxAmount, lineDiscountAmount } from '../purchase-line-amounts'
  defineOptions({ name: 'ScmPurchaseRequestPrintSheet' })
  const records = ref<ScmPurchaseDocument[]>([])
  const orderSubtotal = (row: ScmPurchaseDocument): number =>
    row.lines.reduce((sum, line) => sum + lineSubtotal(line, row.kind), 0)
  const orderDiscount = (row: ScmPurchaseDocument): number =>
    row.lines.reduce((sum, line) => sum + lineDiscountAmount(line, row.kind), 0)
  function orderDiscountRate(row: ScmPurchaseDocument): number {
    const beforeDiscount = orderSubtotal(row) + orderDiscount(row)
    return beforeDiscount > 0 ? (orderDiscount(row) / beforeDiscount) * 100 : 0
  }
  const { loadUnitDisplayNames, unitDisplayName } = useUnitDisplayNames()
  const { print: printSheet } = usePrintSheet('is-purchase-request-printing', () => {
    records.value = []
  })
  async function print(rows: ScmPurchaseDocument[]): Promise<void> {
    await loadUnitDisplayNames(rows.map((row) => row.tenantId))
    records.value = rows
    await printSheet()
  }
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
