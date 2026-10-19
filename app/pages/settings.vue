<script setup lang="ts">
// /settings (Fase 11): los ajustes de cuenta ya no son una página —
// son el modal UserSettingsModal, como el «Profile Settings» de la
// referencia. Esta ruta queda como compatibilidad para enlaces
// guardados: abre el modal (en la sección que pida ?section=) y
// vuelve a la comunidad. La lógica de ajustes vive en
// app/components/UserSettingsModal.vue contra /api/settings*.
const { user } = useAuth()
const { t } = useI18n()
const { openSettings } = useUserSettings()
const route = useRoute()

const validSections = ['perfil', 'notificaciones', 'privacidad', 'bloqueos', 'idioma', 'seguridad'] as const
type Section = typeof validSections[number]

onMounted(() => {
  if (!user.value) return
  const requested = String(route.query.section || '') as Section
  openSettings(validSections.includes(requested) ? requested : undefined)
  navigateTo('/feeds', { replace: true })
})
</script>

<template>
  <div class="space-y-5">
    <UAlert
      v-if="!user" color="neutral" variant="soft" :title="t('settingsPage.loginTitle')"
      :description="t('settingsPage.loginText')"
    >
      <template #actions>
        <UButton to="/login" :label="t('nav.login')" size="sm" />
      </template>
    </UAlert>
    <p v-else class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-circle" class="animate-spin" /> {{ t('settingsPage.opening') }}
    </p>
  </div>
</template>
