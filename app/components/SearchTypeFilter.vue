<script setup lang="ts">
const model = defineModel<string>({ default: 'all' })
const { t } = useI18n()
const items = computed(() => [
  { value: 'all', label: t('improvements.all') },
  { value: 'posts', label: t('search.posts') },
  { value: 'channels', label: t('search.channels') },
  { value: 'courses', label: t('search.courses') },
  { value: 'members', label: t('search.members') },
  { value: 'comments', label: t('improvements.comments') },
  { value: 'events', label: t('improvements.events') },
  { value: 'lessons', label: t('improvements.lessons') },
  { value: 'library', label: t('improvements.library') },
])
</script>

<template>
  <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('search.title')">
    <UButton v-for="item in items" :key="item.value" size="xs" :variant="model === item.value ? 'solid' : 'soft'" :color="model === item.value ? 'primary' : 'neutral'" :aria-pressed="model === item.value" :label="item.label" @click="model = item.value" />
  </div>
</template>
