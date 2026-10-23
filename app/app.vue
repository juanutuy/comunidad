<script setup lang="ts">
const { fetchMe } = useAuth()
await fetchMe()

// Fase 18: el <html lang> refleja el idioma resuelto. fetchMe ya
// corrió (y con él useI18n.applyResolved), así que en SSR el
// atributo nace correcto, sin parpadeo de idioma.
const { locale } = useI18n()
useHead({ htmlAttrs: { lang: locale } })

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
    <NuxtLoadingIndicator :height="3" :throttle="150" :hide-delay="200" color="var(--ui-primary)" error-color="var(--ui-error)" aria-hidden="true" />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
