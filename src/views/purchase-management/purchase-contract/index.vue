<template>
  <PurchaseWorkspace kind="purchase_contract" prepayment-permission="ScmPurchaseContract:Push" />
</template>
<script setup lang="ts">
  import PurchaseWorkspace from '../../purchase-document/purchase-workspace.vue'
  defineOptions({ name: 'ScmPurchaseContract' })
</script>
