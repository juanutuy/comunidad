<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const { user, tenant } = useAuth()
const { t } = useI18n()
const api = useApi()

// Fase 7: orden del feed (Recientes = fijados primero y más nuevos;
// Antiguos = cronológico simple). El parámetro viaja al endpoint.
const sort = ref<'desc' | 'asc'>('desc')
const offset = ref(0)
watch(sort, () => { offset.value = 0 })
const sortOptions = computed(() => [
  { label: t('feed.latest'), value: 'desc' as const, icon: 'i-lucide-arrow-down-wide-narrow' },
  { label: t('feed.oldest'), value: 'asc' as const, icon: 'i-lucide-arrow-up-narrow-wide' },
])
const { data, refresh } = await useAsyncData('feed',
  () => api<{ posts: PostView[], nextOffset: number | null }>('/api/feed', { query: { sort: sort.value, offset: offset.value } }),
  { watch: [sort, offset] })
</script>

<template>
  <div class="space-y-6">
    <!-- Cabecera de la comunidad (Fase 7): banner de marca + nombre. -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden">
      <div class="community-hero px-6 py-8 sm:px-8 sm:py-10" :style="{ '--community-brand': tenant?.brandColor || '#2563eb' }">
        <span class="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide">
          <UIcon name="i-lucide-orbit" class="size-4" /> {{ t('common.community') }}
        </span>
        <h1 class="max-w-lg text-3xl font-bold tracking-tight sm:text-4xl">{{ tenant?.name }}</h1>
        <p class="mt-3 max-w-lg text-base leading-relaxed text-blue-100">{{ tenant?.tagline }}</p>
      </div>
      <div class="flex items-center gap-3 border-t border-default px-6 py-4">
        <h2 class="text-lg font-bold">{{ t('feed.title') }}</h2>
        <span class="flex-1" />
        <USelect v-model="sort" :items="sortOptions" size="sm" class="w-40" />
      </div>
    </UCard>

    <UButton v-if="user" to="/get-started" variant="soft" icon="i-lucide-list-checks" :label="t('improvements.start')" />

    <PostComposer v-if="user" @published="refresh" />


    <PostCard v-for="post in data?.posts || []" :key="post.id" :post="post" @changed="refresh" />
    <ListPagination :offset="offset" :next-offset="data?.nextOffset ?? null" @update:offset="offset = $event" />
    <UAlert v-if="!(data?.posts?.length)" color="neutral" variant="soft" :title="t('feed.emptyTitle')" :description="t('feed.emptyText')" />
    <UButton v-if="!(data?.posts?.length)" to="/channels" variant="soft" icon="i-lucide-compass" :label="t('improvements.channels')" />
  </div>
</template>
