<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'
const api = useApi()
const { data, refresh } = await useAsyncData('videos', () => api<{ posts: PostView[] }>('/api/videos'))
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Videos</h1>
      <p class="text-muted">Todos los videos publicados en los canales de la comunidad.</p>
    </div>
    <PostCard v-for="p in data?.posts || []" :key="p.id" :post="p" @changed="refresh" />
    <UAlert v-if="!(data?.posts?.length)" color="neutral" variant="soft" title="Todavía no hay videos" />
  </div>
</template>
