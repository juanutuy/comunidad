<script setup lang="ts">
// Pantalla de estado de ingreso (Fase 14): cuando la membresía no
// está activa, la comunidad queda detrás de este aviso. Cubre la
// solicitud en revisión (aprobación previa), la rechazada (con la
// nota del tiempo de espera) y — si una sesión quedó abierta — la
// cuenta suspendida. Con la membresía activa redirige al feed.
definePageMeta({ layout: 'auth' })
const { user, status, tenant, logout, fetchMe } = useAuth()
const { t } = useI18n()
const router = useRouter()

await fetchMe()
if (user.value && (!status.value || status.value === 'active' || status.value === 'restricted'))
  await navigateTo('/feeds')

const view = computed(() => {
  switch (status.value) {
    case 'declined':
      return {
        icon: 'i-lucide-user-x',
        color: 'error' as const,
        title: t('pending.declinedTitle'),
        text: t('pending.declinedText', { name: tenant.value?.name || t('pricing.theCommunity') }),
      }
    case 'suspended':
      return {
        icon: 'i-lucide-ban',
        color: 'error' as const,
        title: t('pending.suspendedTitle'),
        text: t('pending.suspendedText', { name: tenant.value?.name || t('pricing.theCommunity') }),
      }
    default:
      return {
        icon: 'i-lucide-hourglass',
        color: 'warning' as const,
        title: t('pending.pendingTitle'),
        text: t('pending.pendingText', { name: tenant.value?.name || t('pending.defaultCommunity') }),
      }
  }
})

async function doLogout() {
  await logout()
  router.push('/login')
}
</script>

<template>
  <UCard>
    <div class="flex flex-col items-center py-4 text-center">
      <span class="flex h-14 w-14 items-center justify-center rounded-full bg-elevated">
        <UIcon :name="view.icon" class="text-3xl text-muted" />
      </span>
      <h1 class="mt-4 text-2xl font-bold">{{ view.title }}</h1>
      <p class="mt-2 max-w-md text-sm text-muted">{{ view.text }}</p>
      <UAlert v-if="status === 'pending'" class="mt-4 text-left" color="neutral" variant="soft" icon="i-lucide-info" :title="t('pending.approvedNoteTitle')" :description="t('pending.approvedNoteText')" />
      <UButton class="mt-6" color="neutral" variant="soft" icon="i-lucide-log-out" :label="t('nav.logout')" @click="doLogout" />
    </div>
  </UCard>
</template>
