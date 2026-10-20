<script setup lang="ts">
const api = useApi()
const { t } = useI18n()
const { initials } = useFormat()
interface RankRow { id: number, name: string, slug: string, avatarUrl: string, posts: number, comments: number, reactionsReceived: number, points: number, level: string }
const offset = ref(0)
const { data } = await useAsyncData('leaderboard', () => api<{ ranking: RankRow[], nextOffset: number | null }>('/api/leaderboard', { query: { offset: offset.value } }), { watch: [offset] })
const medals = ['text-amber-500', 'text-neutral-400', 'text-amber-700']
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">{{ t('leaderboard.title') }}</h1>
      <p class="text-muted">{{ t('leaderboard.subtitle') }}</p>
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li v-for="(r, i) in data?.ranking || []" :key="r.id" class="flex items-center gap-3 px-4 py-3">
          <span class="w-8 text-center font-bold" :class="medals[offset + i] || 'text-muted'">{{ offset + i + 1 }}</span>
          <UAvatar :src="r.avatarUrl || undefined" :text="initials(r.name)" />
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2">
              <NuxtLink :to="`/profile/${r.slug}`" class="font-semibold hover:underline">{{ r.name }}</NuxtLink>
              <UBadge color="primary" variant="subtle" size="sm" icon="i-lucide-award">{{ r.level }}</UBadge>
            </p>
            <p class="text-xs text-muted">{{ t('leaderboard.statsLine', { posts: r.posts, comments: r.comments, reactions: r.reactionsReceived }) }}</p>
          </div>
          <UBadge color="primary" variant="soft" size="lg">{{ r.points }} {{ t('common.points') }}</UBadge>
        </li>
      </ul>
    </UCard>
    <ListPagination :offset="offset" :next-offset="data?.nextOffset ?? null" @update:offset="offset = $event" />
  </div>
</template>
