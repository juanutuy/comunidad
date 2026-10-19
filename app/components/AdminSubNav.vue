<script setup lang="ts">
// Sub-navegación de una sección de la consola (Fase 11): fila de
// pestañas con el mismo patrón visual entre secciones (Gamificación,
// Ajustes de la comunidad). La pestaña activa sale de ?tab= en la URL;
// sin parámetro vale la primera. Solo se usa donde la sección tiene
// subsecciones reales — no es decoración.
const props = defineProps<{
  items: { value: string, label: string, icon?: string }[]
}>()
const route = useRoute()
const active = computed(() => {
  const tab = String(route.query.tab || '')
  return props.items.some(i => i.value === tab) ? tab : props.items[0]?.value
})
</script>

<template>
  <div class="flex flex-wrap gap-1 border-b border-default" role="tablist" aria-label="Subsecciones">
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
    </NuxtLink>
  </div>
</template>
