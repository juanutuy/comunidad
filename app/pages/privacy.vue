<script setup lang="ts">
// Política de privacidad del tenant (Fase 5): el texto que cargó el
// admin en los ajustes de la comunidad, o el texto por defecto.
const api = useApi()
const { t } = useI18n()
const { data } = await useAsyncData('legal-privacy', () => api<{ name: string, privacy: string }>('/api/legal'))
</script>

<template>
  <div class="space-y-5">
    <h1 class="text-2xl font-bold">{{ t('legal.privacyTitle') }}</h1>
    <UCard>
      <p class="mb-3 text-sm text-muted">{{ t('legal.fromLabel', { name: data?.name || '' }) }}</p>
      <div class="space-y-4 leading-relaxed">
        <p v-for="(para, i) in (data?.privacy || '').split('\n\n')" :key="i" class="whitespace-pre-line">{{ para }}</p>
      </div>
    </UCard>
  </div>
</template>
