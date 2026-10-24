<script setup lang="ts">
// Búsqueda global (Fase 2): publicaciones, canales, cursos y miembros.
// Los resultados respetan el acceso a canales pagos/privados (teaser).
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const router = useRouter()
const api = useApi()
const { t } = useI18n()
const { initials, fmtMoney } = useFormat()

const q = ref(String(route.query.q || ''))
const filter = ref('all')
interface SearchResults {
  resources: { id: string, type: 'comments' | 'events' | 'lessons' | 'library', title: string, text: string, to: string }[]
  posts: PostView[]
  channels: { id: number, slug: string, name: string, icon: string, description: string, type: string, priceCents: number, hasAccess: boolean }[]
  courses: { id: number, slug: string, title: string, description: string, level: string, priceCents: number }[]
  members: { id: number, name: string, slug: string, bio: string, avatarUrl: string }[]
}
const { data, refresh } = await useAsyncData(
  () => `search-${String(route.query.q || '')}`,
  () => {
    const term = String(route.query.q || '').trim()
    if (term.length < 2) return Promise.resolve({ posts: [], channels: [], courses: [], members: [], resources: [] } as SearchResults)
    return api<SearchResults>('/api/search', { query: { q: term } })
  },
  { watch: [() => route.query.q] },
)

const total = computed(() => (data.value?.posts.length || 0) + (data.value?.channels.length || 0) + (data.value?.courses.length || 0) + (data.value?.members.length || 0) + (data.value?.resources?.length || 0))

function submit() {
  const term = q.value.trim()
  if (term.length >= 2) router.push({ path: '/search', query: { q: term } })
  else refresh()
}
watch(() => route.query.q, v => { q.value = String(v || '') })
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">{{ t('search.title') }}</h1>
      <p class="text-muted">{{ t('search.subtitle') }}</p>
    </div>
    <form class="flex gap-2" @submit.prevent="submit">
      <UInput v-model="q" :placeholder="t('search.placeholder')" icon="i-lucide-search" class="flex-1" autofocus />
      <UButton type="submit" :label="t('search.button')" />
    </form>

    <SearchTypeFilter v-model="filter" />
    <template v-if="String(route.query.q || '').trim().length >= 2">
      <p class="text-sm text-muted">{{ t('search.resultsFor', { count: total, q: String(route.query.q) }) }}</p>

      <section v-if="data?.posts.length && ['all', 'posts'].includes(filter)" class="space-y-4">
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-newspaper" /> {{ t('search.posts') }}</h2>
        <PostCard v-for="p in data.posts" :key="p.id" :post="p" />
      </section>

      <section v-if="data?.channels.length && ['all', 'channels'].includes(filter)" class="space-y-3">
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-hash" /> {{ t('search.channels') }}</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <UCard v-for="c in data.channels" :key="c.id">
            <NuxtLink :to="`/channels/${c.slug}`" class="flex items-center gap-2 font-semibold hover:underline">
              <UIcon :name="c.icon" /> {{ c.name }}
              <UIcon v-if="c.type === 'paid'" name="i-lucide-crown" class="text-amber-500" />
            </NuxtLink>
            <p class="mt-1 line-clamp-2 text-sm text-muted">{{ c.description }}</p>
          </UCard>
        </div>
      </section>

      <section v-if="data?.courses.length && ['all', 'courses'].includes(filter)" class="space-y-3">
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-graduation-cap" /> {{ t('search.courses') }}</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <UCard v-for="c in data.courses" :key="c.id">
            <div class="flex gap-2">
              <UBadge color="primary" variant="subtle">{{ c.level }}</UBadge>
              <UBadge :color="c.priceCents ? 'warning' : 'success'" variant="subtle">{{ fmtMoney(c.priceCents) }}</UBadge>
            </div>
            <NuxtLink :to="`/courses/${c.slug}`" class="mt-2 block font-semibold hover:underline">{{ c.title }}</NuxtLink>
            <p class="mt-1 line-clamp-2 text-sm text-muted">{{ c.description }}</p>
          </UCard>
        </div>
      </section>

      <section v-if="data?.resources?.length" class="space-y-3">
        <h2 class="font-bold">{{ t('improvements.resources') }}</h2>
        <UCard v-for="item in data.resources.filter(item => filter === 'all' || item.type === filter)" :key="item.id">
          <p class="text-xs text-muted">{{ t(`improvements.${item.type}`) }}</p>
          <NuxtLink :to="item.to" class="font-semibold hover:underline">{{ item.title }}</NuxtLink>
          <p class="mt-1 line-clamp-2 text-sm text-muted">{{ item.text }}</p>
        </UCard>
      </section>

      <section v-if="data?.members.length && ['all', 'members'].includes(filter)" class="space-y-3">
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-users" /> {{ t('search.members') }}</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <UCard v-for="m in data.members" :key="m.id">
            <div class="flex items-center gap-3">
              <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" />
              <div class="min-w-0">
                <NuxtLink :to="`/profile/${m.slug}`" class="font-semibold hover:underline">{{ m.name }}</NuxtLink>
                <p class="truncate text-sm text-muted">{{ m.bio }}</p>
              </div>
            </div>
          </UCard>
        </div>
      </section>

      <UAlert v-if="!total" color="neutral" variant="soft" :title="t('search.noResultsTitle')" :description="t('search.noResultsText')" />
    </template>
    <UAlert v-else color="neutral" variant="soft" :title="t('search.writeTitle')" :description="t('search.writeText')" />
  </div>
</template>
