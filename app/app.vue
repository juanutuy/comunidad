<script setup lang="ts">
const { fetchMe } = useAuth()
await fetchMe()

// Fase 4 — PWA: registrar el service worker solo en el cliente y en
// producción (en dev interferiría con el HMR). El SW es prudente:
// solo cachea assets versionados, nunca API ni HTML (ver public/sw.js).
onMounted(() => {
  if (import.meta.dev) return
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
