<script setup lang="ts">
// Submenú de subsecciones de la consola (Fase 16-D): LA única forma
// de navegar entre subsecciones de una sección. Como en la
// referencia, en escritorio es una COLUMNA VERTICAL junto al riel de
// secciones (riel → submenú → contenido); en pantallas chicas se
// pliega a una fila horizontal compacta desplazable, solo ahí.
//
// Dos modos, según la forma de los ítems:
// - { value } → subsecciones de UNA página: el enlace escribe
//   ?tab=<value> y la activa sale de la URL (sin parámetro vale la
//   primera). Lo usan Ajustes de la comunidad y Gamificación, que
//   son un solo formulario con un solo guardado.
// - { to } → subsecciones que son RUTAS propias: el enlace va a la
//   ruta y la activa sale del path. Lo usan Miembros, Contenido y
//   Cursos.
//
// Las listas de ítems por rol viven en useAdminMenus.ts (Miembros,
// Contenido, Cursos) o en la propia página (Ajustes, Gamificación).
// Esto NO reemplaza a AdminQueueTabs: las vistas de datos de una
// misma cola (Moderación: Reportes / En revisión) y los filtros de
// una misma lista son otro patrón, legítimo, y se quedan.
//
// Fase 16-E: la columna queda FIJA con scroll interno propio — es
// sticky DENTRO del desplazador de contenido de la consola (el
// <main> del layout admin), con tope a la altura de la zona bajo el
// header; si sus ítems no caben, se desplaza por dentro sin mover
// el contenido de la subsección.
export interface AdminSubMenuItem {
  label: string
  icon?: string
  badge?: number
  value?: string
  to?: string
  exact?: boolean
}
const props = defineProps<{ items: AdminSubMenuItem[] }>()

const route = useRoute()

function target(item: AdminSubMenuItem) {
  return item.to ? item.to : { query: { tab: item.value } }
}
function isActive(item: AdminSubMenuItem) {
  if (item.to) {
    return item.exact
      ? route.path === item.to
      : route.path === item.to || route.path.startsWith(`${item.to}/`)
  }
  const values = props.items.map(i => i.value)
  const current = values.includes(String(route.query.tab || ''))
    ? String(route.query.tab)
    : props.items[0]?.value
  return item.value === current
}
</script>

<template>
  <nav aria-label="Subsecciones" data-scroll-region="admin-submenu" class="shrink-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-6.5rem)] lg:w-60 lg:overflow-y-auto">
    <ul class="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      <li v-for="item in items" :key="item.to || item.value" class="shrink-0 lg:shrink">
        <NuxtLink
          :to="target(item)" :aria-current="isActive(item) ? 'page' : undefined"
          class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition hover:bg-elevated lg:whitespace-normal"
          :class="isActive(item) ? 'bg-elevated font-semibold text-highlighted' : 'text-muted'"
        >
          <UIcon v-if="item.icon" :name="item.icon" class="shrink-0 text-base" />
          <span class="min-w-0 flex-1 lg:truncate">{{ item.label }}</span>
          <UBadge v-if="item.badge" color="warning" variant="subtle" size="sm">{{ item.badge }}</UBadge>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
