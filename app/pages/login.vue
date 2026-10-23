<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { tenant } = useAuth()
const { t } = useI18n()
const { returnTo } = useGuestAccess()
async function authenticated(status: string) {
  await navigateTo(['pending', 'declined'].includes(status) ? '/pending' : returnTo.value)
}
</script>

<template>
  <UCard>
    <h1 class="text-2xl font-bold">{{ t('auth.welcomeBack') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('auth.loginSubtitle', { name: tenant?.name || t('pricing.theCommunity') }) }}</p>
    <LoginForm class="mt-5" @authenticated="authenticated" />
  </UCard>
</template>
