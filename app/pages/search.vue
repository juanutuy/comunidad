<script setup lang="ts">
// Búsqueda global (Fase 2): publicaciones, canales, cursos y miembros.
// Los resultados respetan el acceso a canales pagos/privados (teaser).
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const router = useRouter()
const api = useApi()
const { initials, fmtMoney } = useFormat()

const q = ref(String(route.query.q || ''))
interface SearchResults {
  posts: PostView[]
  channels: { id: number, slug: string, name: string, icon: string, description: string, type: string, priceCents: number, hasAccess: boolean }[]
  courses: { id: number, slug: string, title: string, description: string, level: string, priceCents: number }[]
  members: { id: number, name: string, slug: string, bio: string, avatarUrl: string }[]
}
const { data, refresh } = await useAsyncData(
  () => `search-${String(route.query.q || '')}`,
  () => {
    const term = String(route.query.q || '').trim()
    if (term.length < 2) return Promise.resolve({ posts: [], channels: [], courses: [], members: [] } as SearchResults)
    return api<SearchResults>('/api/search', { query: { q: term } })
  },
  { watch: [() => route.query.q] },
)

const total = computed(() => (data.value?.posts.length || 0) + (data.value?.channels.length || 0) + (data.value?.courses.length || 0) + (data.value?.members.length || 0))

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
      <h1 class="text-2xl font-bold">Buscar</h1>
      <p class="text-muted">Publicaciones, canales, cursos y miembros de la comunidad.</p>
    </div>
    <form class="flex gap-2" @submit.prevent="submit">
      <UInput v-model="q" placeholder="Escribí al menos 2 caracteres…" icon="i-lucide-search" class="flex-1" autofocus />
      <UButton type="submit" label="Buscar" />
    </form>

    <template v-if="String(route.query.q || '').trim().length >= 2">
      <p class="text-sm text-muted">{{ total }} resultado(s) para «{{ route.query.q }}»</p>

      <section v-if="data?.posts.length" class="space-y-4">
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-newspaper" /> Publicaciones</h2>
        <PostCard v-for="p in data.posts" :key="p.id" :post="p" />
      </section>

      <section v-if="data?.channels.length" class="space-y-3">
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-hash" /> Canales</h2>
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

      <section v-if="data?.courses.length" class="space-y-3">
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-graduation-cap" /> Cursos</h2>
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

      <section v-if="data?.members.length" class="space-y-3">
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-users" /> Miembros</h2>
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

      <UAlert v-if="!total" color="neutral" variant="soft" title="Sin resultados" description="Probá con otras palabras o revisá la ortografía." />
    </template>
    <UAlert v-else color="neutral" variant="soft" title="Escribí qué estás buscando" description="Buscamos en títulos y contenido de publicaciones, canales, cursos y perfiles de miembros." />
  </div>
</template>
