<script setup lang="ts">
const link = defineModel<{ platform: string, url: string }>({ required: true })
defineProps<{ platforms: { label: string, value: string }[] }>()
const emit = defineEmits<{ remove: [] }>()
</script>

<template>
  <div class="flex items-center gap-2">
    <USelect v-model="link.platform" :items="platforms" class="w-40" />
    <UInput v-model="link.url" class="flex-1" placeholder="https://…" />
    <UButton color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Quitar red social" @click="emit('remove')" />
  </div>
</template>
