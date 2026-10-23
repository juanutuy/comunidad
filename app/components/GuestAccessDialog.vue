<script setup lang="ts">
const { open, returnTo } = useGuestAccess()
const { tenant } = useAuth()
const { t } = useI18n()
const route = useRoute()
async function authenticated(status: string) {
  open.value = false
  if (['pending', 'declined'].includes(status)) {
    await navigateTo('/pending')
    return
  }
  if (returnTo.value !== route.fullPath) {
    await navigateTo(returnTo.value)
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
