<script setup lang="ts">
// Pestañas de VISTAS DE DATOS de una misma cola (Fase 16-D): NO es
// navegación entre subsecciones — eso es AdminSubMenu, en columna
// vertical. Este patrón horizontal se queda SOLO donde las
// «pestañas» reparten una misma lista de trabajo en vistas, como
// en la referencia: hoy lo usa únicamente Moderación (Reportes /
// En revisión, con sus contadores). La pestaña activa sale de
// ?tab= en la URL; sin parámetro vale la primera.
const props = defineProps<{
  items: { value: string, label: string, icon?: string, badge?: number }[]
}>()
const route = useRoute()
const active = computed(() => {
  const tab = String(route.query.tab || '')
  return props.items.some(i => i.value === tab) ? tab : props.items[0]?.value
})
</script>

<template>
  <div class="flex flex-wrap gap-1 border-b border-default" role="tablist" aria-label="Vistas de la cola">
    <NuxtLink
      v-for="item in items" :key="item.value"
      :to="{ query: { tab: item.value } }"
      class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition"
      :class="active === item.value
        ? 'border-primary text-highlighted'
        : 'border-transparent text-muted hover:border-neutral-300 hover:text-highlighted dark:hover:border-neutral-700'"
      role="tab" :aria-selected="active === item.value"
    >
      <UIcon v-if="item.icon" :name="item.icon" /> {{ item.label }}
      <UBadge v-if="item.badge" color="warning" variant="subtle" size="sm">{{ item.badge }}</UBadge>
    </NuxtLink>
  </div>
</template>
