<script setup lang="ts">
// Navegación compartida de las páginas de administración.
const items = [
  { label: 'Ajustes', icon: 'i-lucide-settings', to: '/admin' },
  { label: 'Miembros', icon: 'i-lucide-users', to: '/admin/members' },
  { label: 'Canales', icon: 'i-lucide-hash', to: '/admin/channels' },
  { label: 'Planes', icon: 'i-lucide-credit-card', to: '/admin/plans' },
  { label: 'Dominios', icon: 'i-lucide-globe', to: '/admin/domains' },
  { label: 'Correos', icon: 'i-lucide-mail', to: '/admin/emails' },
]
const route = useRoute()
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <UButton
      v-for="item in items" :key="item.to" :to="item.to" size="sm"
      :color="route.path === item.to ? 'primary' : 'neutral'"
      :variant="route.path === item.to ? 'solid' : 'soft'"
      :label="item.label" :icon="item.icon"
    />
  </div>
</template>
