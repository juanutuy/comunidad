<script setup lang="ts">
// Términos y condiciones del tenant (Fase 5): el texto que cargó el
// admin en los ajustes de la comunidad, o el texto por defecto.
const api = useApi()
const { data } = await useAsyncData('legal-terms', () => api<{ name: string, terms: string }>('/api/legal'))
</script>

<template>
  <div class="space-y-5">
    <h1 class="text-2xl font-bold">Términos y condiciones</h1>
    <UCard>
      <p class="mb-3 text-sm text-muted">De {{ data?.name }}</p>
      <div class="space-y-4 leading-relaxed">
        <p v-for="(para, i) in (data?.terms || '').split('\n\n')" :key="i" class="whitespace-pre-line">{{ para }}</p>
      </div>
    </UCard>
  </div>
</template>
