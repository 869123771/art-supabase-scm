<template>
  <WmsPurchaseDocumentWorkspace kind="purchase_return" :permissions="permissions" />
</template>
<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'
  defineOptions({ name: 'ScmPurchaseReturnRequest' })

  const permissions = {
    View: 'ScmPurchaseReturnRequest:View',
    Add: 'ScmPurchaseReturnRequest:Add',
    Copy: 'ScmPurchaseReturnRequest:Copy',
    Edit: 'ScmPurchaseReturnRequest:Edit',
    Delete: 'ScmPurchaseReturnRequest:Delete',
    Import: 'ScmPurchaseReturnRequest:Import',
    Export: 'ScmPurchaseReturnRequest:Export',
    Push: 'ScmPurchaseReturnRequest:Push',
    Submit: 'ScmPurchaseReturnRequest:Submit',
    Approve: 'ScmPurchaseReturnRequest:Approve'
  } as const
</script>
