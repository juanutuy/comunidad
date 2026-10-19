<script setup lang="ts">
// Sub-navegación de la sección Miembros de la consola (Fase 14): la
// sección creció a cuatro pantallas reales (lista, solicitudes,
// invitaciones y roles). A diferencia de AdminSubNav (pestañas con
// ?tab= dentro de una página), estas son RUTAS propias. El moderador
// solo ve «Miembros»: el resto es gestión de administradores y no se
// le ofrece un control que el servidor le negaría.
const { user } = useAuth()
const route = useRoute()
const items = computed(() => {
  const base = [{ label: 'Miembros', icon: 'i-lucide-users', to: '/admin/members' }]
  if (user.value?.role === 'admin') {
    base.push(
      { label: 'Solicitudes de ingreso', icon: 'i-lucide-user-plus', to: '/admin/members/requests' },
      { label: 'Invitaciones', icon: 'i-lucide-mail-plus', to: '/admin/members/invitations' },
      { label: 'Roles', icon: 'i-lucide-shield-check', to: '/admin/members/roles' },
    )
  }
  return base
})
function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <div class="flex flex-wrap gap-1 border-b border-default" role="navigation" aria-label="Subsecciones de Miembros">
    <NuxtLink
      v-for="item in items" :key="item.to" :to="item.to"
      class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition"
      :class="isActive(item.to) ? 'border-primary text-highlighted' : 'border-transparent text-muted hover:border-neutral-300 hover:text-highlighted dark:hover:border-neutral-700'"
    >
      <UIcon :name="item.icon" /> {{ item.label }}
    </NuxtLink>
  </div>
</template>
