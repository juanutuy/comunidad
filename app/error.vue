<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number, message?: string } }>()
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <UCard class="max-w-md text-center">
      <h1 class="text-4xl font-bold">{{ props.error.statusCode || 500 }}</h1>
      <p class="mt-2 text-muted">{{ props.error.statusCode === 404 ? 'No encontramos esta página.' : 'Algo salió mal. Intentá de nuevo.' }}</p>
      <UButton to="/feeds" class="mt-4" label="Ir al feed" />
    </UCard>
  </div>
</template>
