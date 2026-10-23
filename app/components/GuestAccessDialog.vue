<script setup lang="ts">
const { open } = useGuestAccess()
const { tenant } = useAuth()
const { t } = useI18n()
async function authenticated(status: string) {
  open.value = false
  if (['pending', 'declined'].includes(status)) {
    await navigateTo('/pending')
    return
  }
  await refreshNuxtData()
}
</script>

<template>
  <UModal v-model:open="open" :title="t('auth.welcomeBack')" :description="t('auth.loginSubtitle', { name: tenant?.name || t('pricing.theCommunity') })">
    <template #body>
      <LoginForm v-if="open" @authenticated="authenticated" @register="open = false" />
    </template>
  </UModal>
</template>
