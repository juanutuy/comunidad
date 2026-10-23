<script setup lang="ts">
// Campana de notificaciones (Fase 2): contador de no leídas y desplegable
// con las últimas. Al abrir el desplegable se marca todo como leído.
interface NotificationView {
  id: number
  type: string
  title: string
  link: string
  isRead: boolean
  createdAt: string
  actor: { name: string, slug: string, avatarUrl: string } | null
}

const { user } = useAuth()
const { t } = useI18n()
const { timeAgo, initials } = useFormat()
const api = useApi()
const router = useRouter()

const items = ref<NotificationView[]>([])
// Fase 10: el contador vive en el estado compartido useNotifBadge —
// la barra inferior móvil muestra el mismo número que esta campana.
const { unread } = useNotifBadge()
const open = ref(false)
// Fase 5: filtro por tipo dentro del desplegable.
const filter = ref('all')
const loading = ref(false)
const filterChips = computed(() => [
  { label: t('notifications.filterAll'), value: 'all' },
  { label: t('notifications.filterMentions'), value: 'mention' },
  { label: t('notifications.filterReactions'), value: 'reaction' },
  { label: t('notifications.filterComments'), value: 'comment' },
  { label: t('notifications.filterPosts'), value: 'new_post' },
  { label: t('notifications.filterMessages'), value: 'dm' },
  { label: t('notifications.filterFollowers'), value: 'follow' },
])
const visibleItems = computed(() =>
  items.value.filter(n => filter.value === 'all' || n.type === filter.value
    // Fase 16-G: la reacción a un comentario es de la familia de
    // reacciones también en el filtro de la campana.
    || (filter.value === 'reaction' && n.type === 'comment_reaction')).slice(0, 8))

const typeIcons: Record<string, string> = {
  reaction: 'i-lucide-heart',
  comment_reaction: 'i-lucide-heart',
  comment: 'i-lucide-message-circle',
  new_post: 'i-lucide-pen-square',
  mention: 'i-lucide-at-sign',
  dm: 'i-lucide-mail',
  follow: 'i-lucide-user-plus',
  // Fase 12: avisos de moderación.
  report: 'i-lucide-flag',
  moderation: 'i-lucide-shield-check',
}

async function load() {
  if (!user.value) { items.value = []; unread.value = 0; return }
  loading.value = true
  try {
    const data = await api<{ unread: number, notifications: NotificationView[] }>('/api/notifications')
    items.value = data.notifications
    unread.value = data.unread
  }
  catch { /* retry on the next opening */ }
  finally { loading.value = false }
}

async function markAllRead() {
  if (!unread.value) return
  try {
    await api('/api/notifications/read', { method: 'POST', body: {} })
    unread.value = 0
    items.value = items.value.map(n => ({ ...n, isRead: true }))
  }
  catch { /* se reintenta en la próxima apertura */ }
}

async function onOpenChange(value: boolean) {
  open.value = value
  if (value) { filter.value = 'all'; await load(); await markAllRead() }
}

function go(n: NotificationView) {
  open.value = false
  if (n.link) router.push(n.link)
}

watch(() => user.value?.id, load, { immediate: true })

// Fase 3: sala personal por WebSocket — la campana se actualiza al
// instante cuando llega una notificación. El polling de 60 s queda
// como respaldo (y es el único mecanismo en `npm run dev`).
const rt = useRealtime()
let rtHandle: ReturnType<typeof rt.connect> | null = null
onMounted(async () => {
  const t = setInterval(load, 60000)
  onUnmounted(() => clearInterval(t))
  if (user.value && await rt.checkAvailable()) {
    rtHandle = rt.connect('/api/rt/me', (data) => {
      if (data.type === 'notification') load()
    })
    onUnmounted(() => rtHandle?.close())
  }
})
</script>

<template>
  <UPopover v-if="user" :open="open" :content="{ align: 'end', sideOffset: 10, collisionPadding: 12 }" @update:open="onOpenChange">
    <UButton color="neutral" variant="ghost" icon="i-lucide-bell" class="relative" :aria-label="t('notifications.title')">
      <span v-if="unread" class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
        {{ unread > 9 ? '9+' : unread }}
      </span>
    </UButton>
    <template #content>
      <section class="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden" :aria-label="t('notifications.title')">
        <header class="flex items-center justify-between gap-3 border-b border-default px-5 py-4">
          <h2 class="text-base font-semibold">{{ t('notifications.title') }}</h2>
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-x" :aria-label="t('common.close')" @click="open = false" />
        </header>
        <div v-if="items.length" class="border-b border-default px-4 py-3">
          <USelect v-model="filter" :items="filterChips" :aria-label="t('notifications.title')" icon="i-lucide-list-filter" class="w-full" />
        </div>
        <div v-if="loading && !items.length" class="flex min-h-52 items-center justify-center" role="status" :aria-label="t('common.loading')">
          <UIcon name="i-lucide-loader-circle" class="animate-spin text-xl text-muted" />
        </div>
        <ul v-else-if="visibleItems.length" class="max-h-[min(26rem,60dvh)] divide-y divide-default overflow-y-auto py-1">
          <li v-for="n in visibleItems" :key="n.id">
            <button type="button" class="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none" @click="go(n)">
              <span class="relative mt-0.5 shrink-0">
                <UAvatar :src="n.actor?.avatarUrl || undefined" :text="n.actor ? initials(n.actor.name) : undefined" :icon="typeIcons[n.type] || 'i-lucide-bell'" size="md" />
                <span v-if="n.actor" class="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full bg-elevated ring-2 ring-default">
                  <UIcon :name="typeIcons[n.type] || 'i-lucide-bell'" class="size-2.5 text-muted" />
                </span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm leading-relaxed" :class="n.isRead ? 'text-default' : 'font-medium text-highlighted'">{{ n.title }}</span>
                <span class="mt-1 block text-xs text-muted">{{ timeAgo(n.createdAt) }}</span>
              </span>
              <span v-if="!n.isRead" class="mt-2 size-2 shrink-0 rounded-full bg-primary" />
            </button>
          </li>
        </ul>
        <div v-else class="flex min-h-56 flex-col items-center justify-center px-7 py-8 text-center">
          <span class="mb-4 flex size-12 items-center justify-center rounded-full bg-elevated">
            <UIcon :name="items.length ? 'i-lucide-list-filter' : 'i-lucide-bell'" class="size-6 text-muted" />
          </span>
          <p class="text-sm font-semibold text-highlighted">{{ items.length ? t('notifications.emptyFilterTitle') : t('notifications.emptyTitle') }}</p>
          <p class="mt-2 max-w-64 text-sm leading-relaxed text-muted">{{ items.length ? t('notifications.emptyFilterText') : t('notifications.emptyText') }}</p>
        </div>
        <footer class="border-t border-default p-2">
          <UButton to="/notifications" block color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right" :label="t('notifications.seeAll')" @click="open = false" />
        </footer>
      </section>
    </template>
  </UPopover>
</template>
