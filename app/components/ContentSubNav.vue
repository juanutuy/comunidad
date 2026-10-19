<script setup lang="ts">
// Sub-navegación de la sección Contenido (Fase 16): Publicaciones,
// Archivos y Canales son RUTAS propias (/admin/content/...), no
// pestañas de una sola página — por eso este componente enlaza por
// ruta en vez de usar AdminSubNav (que trabaja con ?tab=). Archivos
// es solo admin (su API también): para el moderador no se pinta.
const { user } = useAuth()
const route = useRoute()
const items = computed(() => [
  { label: 'Publicaciones', icon: 'i-lucide-newspaper', to: '/admin/content', exact: true },
  ...(user.value?.role === 'admin' ? [{ label: 'Archivos', icon: 'i-lucide-files', to: '/admin/content/media', exact: false }] : []),
  { label: 'Canales', icon: 'i-lucide-hash', to: '/admin/content/channels', exact: false },
])
function isActive(item: { to: string, exact: boolean }) {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}
</script>

<template>
  <div class="flex flex-wrap gap-1 border-b border-default" role="tablist" aria-label="Subsecciones de Contenido">
    <NuxtLink
      v-for="item in items" :key="item.to" :to="item.to"
      class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition"
      :class="isActive(item) ? 'border-primary text-highlighted' : 'border-transparent text-muted hover:border-neutral-300 hover:text-highlighted dark:hover:border-neutral-700'"
      role="tab" :aria-selected="isActive(item)"
    >
      <UIcon :name="item.icon" /> {{ item.label }}
    </NuxtLink>
  </div>
</template>
