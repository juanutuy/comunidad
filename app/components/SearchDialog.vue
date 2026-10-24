<script setup lang="ts">
// Diálogo de búsqueda global (Cmd+K / Ctrl+K o la lupa de la barra).
// Consume la MISMA /api/search que la página /search: los candados de
// canales pagos/privados y la anonimización de posts se respetan
// porque los aplica el servidor; acá no se duplica lógica de búsqueda.
import type { PostView } from '~/components/PostCard.vue'

const { open, closeSearch } = useSearchDialog()
const { t } = useI18n()
const api = useApi()
const router = useRouter()
const { initials } = useFormat()

interface SearchResults {
  resources: { id: string, type: 'comments' | 'events' | 'lessons' | 'library', title: string, text: string, to: string }[]
  posts: PostView[]
  channels: { id: number, slug: string, name: string, icon: string, description: string, type: string, priceCents: number, hasAccess: boolean }[]
  courses: { id: number, slug: string, title: string, description: string, level: string, priceCents: number }[]
  members: { id: number, name: string, slug: string, bio: string, avatarUrl: string }[]
}
const empty: SearchResults = { posts: [], channels: [], courses: [], members: [], resources: [] }

const q = ref('')
const rawResults = ref<SearchResults>(empty)
const filter = ref('all')
const results = computed(() => ({ ...rawResults.value,
  posts: ['all', 'posts'].includes(filter.value) ? rawResults.value.posts : [],
  channels: ['all', 'channels'].includes(filter.value) ? rawResults.value.channels : [],
  courses: ['all', 'courses'].includes(filter.value) ? rawResults.value.courses : [],
  members: ['all', 'members'].includes(filter.value) ? rawResults.value.members : [],
  resources: (rawResults.value.resources || []).filter(item => filter.value === 'all' || item.type === filter.value),
}))
const loading = ref(false)
const failed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const total = computed(() => results.value.posts.length + results.value.channels.length + results.value.courses.length + results.value.members.length + (results.value.resources?.length || 0))
const ready = computed(() => q.value.trim().length >= 2)

watch(q, (value) => {
  if (timer) clearTimeout(timer)
  const mySeq = ++seq
  failed.value = false
  const term = value.trim()
  if (term.length < 2) { rawResults.value = empty; loading.value = false; return }
  loading.value = true
  timer = setTimeout(async () => {
    try {
      const res = await api<SearchResults>('/api/search', { query: { q: term } })
      if (mySeq === seq) rawResults.value = res
    }
    catch { if (mySeq === seq) { rawResults.value = empty; failed.value = true } }
    finally { if (mySeq === seq) loading.value = false }
  }, 280)
})

// Al cerrar, el diálogo nace limpio la próxima vez.
watch(open, (isOpen) => {
  if (!isOpen) { ++seq; if (timer) clearTimeout(timer); q.value = ''; filter.value = 'all'; rawResults.value = empty; loading.value = false }
})

// Atajo global Cmd+K / Ctrl+K, como en la referencia.
function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = !open.value
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => { ++seq; if (timer) clearTimeout(timer); window.removeEventListener('keydown', onKeydown) })

function go(to: string) {
  closeSearch()
  router.push(to)
}
function seeAll() {
  const term = q.value.trim()
  if (term.length >= 2) go(`/search?q=${encodeURIComponent(term)}`)
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-xl' }">
    <template #content>
      <div class="flex flex-col">
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <UIcon name="i-lucide-search" class="shrink-0 text-muted" />
          <UInput
            v-model="q" autofocus variant="none" size="lg" class="flex-1"
            :placeholder="t('search.dialogPlaceholder')"
            @keydown.enter="seeAll"
          />
          <UIcon v-if="loading" name="i-lucide-loader-circle" class="shrink-0 animate-spin text-muted" />
          <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('search.closeSearch')" @click="closeSearch" />
        </div>

        <SearchTypeFilter v-model="filter" class="border-b border-default p-3" />
        <div class="max-h-[55vh] overflow-y-auto p-2">
          <p v-if="!ready" class="px-3 py-6 text-center text-sm text-muted">
            {{ t('search.dialogHint') }}
          </p>
          <p v-else-if="failed" role="alert" class="px-3 py-6 text-center text-sm text-error">{{ t('improvements.loadFailed') }}</p>
          <p v-else-if="!loading && !total" class="px-3 py-6 text-center text-sm text-muted">
            {{ t('search.dialogNoResults', { q: q.trim() }) }}
          </p>

          <template v-if="results.posts.length">
            <p class="px-3 pt-2 pb-1 text-xs font-bold tracking-wider text-muted uppercase">{{ t('search.posts') }}</p>
            <button
              v-for="p in results.posts.slice(0, 5)" :key="p.id" type="button"
              class="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-elevated"
              @click="go(`/p/${p.channel.slug}/${p.slug}`)"
            >
              <UIcon name="i-lucide-newspaper" class="mt-0.5 shrink-0 text-muted" />
              <span class="min-w-0">
                <span class="block truncate font-medium">{{ p.title }}</span>
                <span class="block truncate text-xs text-muted">
                  {{ p.author.anonymous ? t('post.anonymous') : p.author.name }} · {{ t('search.inChannel', { channel: p.channel.name }) }}<template v-if="p.locked">{{ t('search.previewSuffix') }}</template>
                </span>
              </span>
            </button>
          </template>

          <template v-if="results.channels.length">
            <p class="px-3 pt-2 pb-1 text-xs font-bold tracking-wider text-muted uppercase">{{ t('search.channels') }}</p>
            <button
              v-for="c in results.channels.slice(0, 5)" :key="c.id" type="button"
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-elevated"
              @click="go(`/channels/${c.slug}`)"
            >
              <UIcon :name="c.icon" class="shrink-0 text-muted" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ c.name }}</span>
              <UIcon v-if="c.type === 'paid'" name="i-lucide-crown" class="shrink-0 text-amber-500" />
              <UIcon v-else-if="c.type === 'private'" name="i-lucide-lock" class="shrink-0 text-muted" />
            </button>
          </template>

          <template v-if="results.courses.length">
            <p class="px-3 pt-2 pb-1 text-xs font-bold tracking-wider text-muted uppercase">{{ t('search.courses') }}</p>
            <button
              v-for="c in results.courses.slice(0, 5)" :key="c.id" type="button"
              class="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-elevated"
              @click="go(`/courses/${c.slug}`)"
            >
              <UIcon name="i-lucide-graduation-cap" class="mt-0.5 shrink-0 text-muted" />
              <span class="min-w-0">
                <span class="block truncate font-medium">{{ c.title }}</span>
                <span class="block truncate text-xs text-muted">{{ c.level }}</span>
              </span>
            </button>
          </template>

          <template v-if="results.resources?.length">
            <p class="px-3 pt-2 pb-1 text-xs font-bold text-muted">{{ t('improvements.resources') }}</p>
            <button v-for="item in results.resources" :key="item.id" type="button" class="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-elevated" @click="go(item.to)">
              <span class="text-xs text-muted">{{ t(`improvements.${item.type}`) }}</span>
              <span class="font-medium">{{ item.title }}</span><span class="line-clamp-2 text-xs text-muted">{{ item.text }}</span>
            </button>
          </template>
          <template v-if="results.members.length">
            <p class="px-3 pt-2 pb-1 text-xs font-bold tracking-wider text-muted uppercase">{{ t('search.members') }}</p>
            <button
              v-for="m in results.members.slice(0, 5)" :key="m.id" type="button"
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-elevated"
              @click="go(`/profile/${m.slug}`)"
            >
              <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="sm" />
              <span class="min-w-0 truncate font-medium">{{ m.name }}</span>
            </button>
          </template>
        </div>

        <button
          v-if="ready && total" type="button"
          class="border-t border-default px-4 py-2.5 text-left text-sm font-medium text-primary hover:bg-elevated"
          @click="seeAll"
        >
          {{ t('search.seeAllResults', { count: total }) }}
        </button>
      </div>
    </template>
  </UModal>
</template>
