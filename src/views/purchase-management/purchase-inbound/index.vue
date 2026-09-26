<template>
  <WmsPurchaseDocumentWorkspace kind="purchase_inbound" :permissions="permissions" />
</template>
<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'
  defineOptions({ name: 'ScmPurchaseInbound' })

  const permissions = {
    View: 'ScmPurchaseInbound:View',
    Add: 'ScmPurchaseInbound:Add',
    Copy: 'ScmPurchaseInbound:Copy',
    Edit: 'ScmPurchaseInbound:Edit',
    Delete: 'ScmPurchaseInbound:Delete',
    Import: 'ScmPurchaseInbound:Import',
    Export: 'ScmPurchaseInbound:Export',
    Push: 'ScmPurchaseInbound:Push',
    Submit: 'ScmPurchaseInbound:Submit',
    Approve: 'ScmPurchaseInbound:Approve'
  } as const
</script>
