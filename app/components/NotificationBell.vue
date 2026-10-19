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
  items.value.filter(n => filter.value === 'all' || n.type === filter.value).slice(0, 8))

const typeIcons: Record<string, string> = {
  reaction: 'i-lucide-heart',
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
  try {
    const data = await api<{ unread: number, notifications: NotificationView[] }>('/api/notifications')
    items.value = data.notifications
    unread.value = data.unread
  }
  catch { /* sin sesión o sin red: la campana queda en cero */ }
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

function onOpenChange(value: boolean) {
  open.value = value
  if (value) { load(); markAllRead() }
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
  <UPopover v-if="user" :open="open" @update:open="onOpenChange">
    <UButton color="neutral" variant="ghost" icon="i-lucide-bell" class="relative" :aria-label="t('notifications.title')">
      <span v-if="unread" class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
        {{ unread > 9 ? '9+' : unread }}
      </span>
    </UButton>
    <template #content>
      <div class="w-80 p-2">
        <div class="flex items-center justify-between px-2 py-1">
          <p class="text-sm font-bold">{{ t('notifications.title') }}</p>
          <UButton to="/notifications" size="xs" color="neutral" variant="ghost" :label="t('notifications.seeAll')" @click="open = false" />
        </div>
        <div class="flex flex-wrap gap-1 px-2 pb-1">
          <UButton
            v-for="chip in filterChips" :key="chip.value" size="xs"
            :color="filter === chip.value ? 'primary' : 'neutral'"
            :variant="filter === chip.value ? 'soft' : 'ghost'"
            :label="chip.label" @click="filter = chip.value"
          />
        </div>
        <ul v-if="visibleItems.length" class="max-h-80 divide-y divide-default overflow-y-auto">
          <li v-for="n in visibleItems" :key="n.id">
            <button class="flex w-full items-start gap-2.5 px-2 py-2.5 text-left hover:bg-elevated" :class="{ 'opacity-70': n.isRead }" @click="go(n)">
              <UAvatar :src="n.actor?.avatarUrl || undefined" :text="n.actor ? initials(n.actor.name) : undefined" :icon="typeIcons[n.type] || 'i-lucide-bell'" size="sm" class="mt-0.5 shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block text-sm leading-snug">{{ n.title }}</span>
                <span class="block text-xs text-muted">{{ timeAgo(n.createdAt) }}</span>
              </span>
              <span v-if="!n.isRead" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
            </button>
          </li>
        </ul>
        <p v-else class="px-2 py-4 text-center text-sm text-muted">{{ items.length ? t('notifications.nothingInFilter') : t('notifications.noNotificationsYet') }}</p>
      </div>
    </template>
  </UPopover>
</template>
