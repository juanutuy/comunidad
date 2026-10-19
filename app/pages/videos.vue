<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'
const api = useApi()
const { t } = useI18n()
const { data, refresh } = await useAsyncData('videos', () => api<{ posts: PostView[] }>('/api/videos'))
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">{{ t('videos.title') }}</h1>
      <p class="text-muted">{{ t('videos.subtitle') }}</p>
    </div>
    <PostCard v-for="p in data?.posts || []" :key="p.id" :post="p" @changed="refresh" />
    <UAlert v-if="!(data?.posts?.length)" color="neutral" variant="soft" :title="t('videos.emptyTitle')" />
  </div>
</template>
