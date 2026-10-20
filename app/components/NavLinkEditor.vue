<script setup lang="ts">
interface NavLink { id: string, label: string, url: string, visible: boolean, custom: boolean, zone: 'header' | 'sidebar' }
const item = defineModel<NavLink>({ required: true })
const emit = defineEmits<{ move: [direction: -1 | 1], remove: [] }>()
const zones = [{ label: 'Cabecera', value: 'header' }, { label: 'Lateral', value: 'sidebar' }]
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 rounded-lg border border-default p-2.5">
    <div class="flex flex-col">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-up" aria-label="Subir" @click="emit('move', -1)" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-down" aria-label="Bajar" @click="emit('move', 1)" />
    </div>
    <UInput v-model="item.label" class="w-44" maxlength="60" aria-label="Texto del enlace" />
    <UInput v-if="item.custom" v-model="item.url" class="min-w-52 flex-1" placeholder="https://… o /ruta" aria-label="Dirección del enlace" />
    <span v-else class="min-w-52 flex-1 truncate text-sm text-muted">{{ item.url }} <UBadge color="neutral" variant="subtle" size="sm">Integrado</UBadge></span>
    <USelect v-model="item.zone" :items="zones" size="sm" class="w-32" aria-label="Zona del enlace" />
    <USwitch v-model="item.visible" aria-label="Mostrar en el menú" />
    <UButton v-if="item.custom" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Borrar enlace" @click="emit('remove')" />
  </div>
</template>
