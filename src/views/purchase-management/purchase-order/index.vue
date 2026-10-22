<template>
  <PurchaseWorkspace kind="purchase_order" prepayment-permission="ScmPurchaseOrder:Push" />
</template>
<script setup lang="ts">
  import PurchaseWorkspace from '../../purchase-document/purchase-workspace.vue'
  defineOptions({ name: 'ScmPurchaseOrder' })
</script>
