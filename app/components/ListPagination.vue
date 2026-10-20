<script setup lang="ts">
const props = defineProps<{ offset: number, nextOffset: number | null, limit?: number }>()
const emit = defineEmits<{ 'update:offset': [value: number] }>()
const { t } = useI18n()
</script>

<template>
  <nav v-if="offset > 0 || nextOffset !== null" class="flex justify-between gap-3" aria-label="Pagination">
    <UButton :disabled="offset === 0" :label="t('pagination.previous')" variant="soft" @click="emit('update:offset', Math.max(0, offset - (props.limit ?? 30)))" />
    <UButton :disabled="nextOffset === null" :label="t('pagination.next')" variant="soft" @click="nextOffset !== null && emit('update:offset', nextOffset)" />
  </nav>
</template>
