<script setup lang="ts">
// Estado vacío estilo referencia (Fase 9): icono grande dentro de un
// círculo suave, título y subtítulo explicativo.
defineProps<{
  icon: string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center rounded-xl border border-dashed border-default px-6 py-10 text-center">
    <span class="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
      <UIcon :name="icon" class="text-3xl text-primary" />
    </span>
    <p class="mt-4 font-semibold">{{ title }}</p>
    <p v-if="description" class="mt-1 max-w-sm text-sm text-muted">{{ description }}</p>
    <slot />
  </div>
</template>
