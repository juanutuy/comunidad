<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const { user, tenant } = useAuth()
const api = useApi()

// Fase 7: orden del feed (Recientes = fijados primero y más nuevos;
// Antiguos = cronológico simple). El parámetro viaja al endpoint.
const sort = ref<'desc' | 'asc'>('desc')
const sortOptions = [
  { label: 'Recientes', value: 'desc' as const, icon: 'i-lucide-arrow-down-wide-narrow' },
  { label: 'Antiguos', value: 'asc' as const, icon: 'i-lucide-arrow-up-narrow-wide' },
]
const { data, refresh } = await useAsyncData('feed',
  () => api<{ posts: PostView[] }>('/api/feed', { query: { sort: sort.value } }),
  { watch: [sort] })
</script>

<template>
  <div class="space-y-5">
    <!-- Cabecera de la comunidad (Fase 7): banner de marca + nombre. -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden">
      <div
        class="h-28 sm:h-36"
        :style="{ background: `linear-gradient(120deg, ${tenant?.brandColor || '#2563eb'} 0%, ${tenant?.brandColor || '#2563eb'}b3 55%, ${tenant?.brandColor || '#2563eb'}59 100%)` }"
      />
      <div class="px-5 py-4">
        <h1 class="text-2xl font-bold">{{ tenant?.name }}</h1>
        <p class="mt-0.5 text-muted">{{ tenant?.tagline }}</p>
      </div>
      <div class="flex items-center gap-3 border-t border-default px-5 py-3">
        <h2 class="text-lg font-bold">Feed</h2>
        <span class="flex-1" />
        <USelect v-model="sort" :items="sortOptions" size="sm" class="w-40" />
      </div>
    </UCard>

    <PostComposer v-if="user" @published="refresh" />
    <UAlert v-else color="primary" variant="soft" icon="i-lucide-sparkles" title="Estás viendo como visitante" description="Iniciá sesión o creá tu cuenta para publicar, comentar y reaccionar.">
      <template #actions>
        <UButton to="/login" size="sm" color="neutral" label="Iniciar sesión" />
        <UButton to="/register" size="sm" label="Unirse gratis" />
      </template>
    </UAlert>

    <PostCard v-for="post in data?.posts || []" :key="post.id" :post="post" @changed="refresh" />
    <UAlert v-if="!(data?.posts?.length)" color="neutral" variant="soft" title="Todavía no hay publicaciones en tu feed" description="Seguí canales desde la barra lateral para ver su contenido aquí." />
  </div>
</template>
