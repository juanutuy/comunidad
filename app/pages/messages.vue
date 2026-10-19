<script setup lang="ts">
// Mensajes directos (Fase 3): lista de miembros con presencia y no
// leídos, conversación 1 a 1 con historial y envío por REST, recepción
// en vivo por WebSocket cuando el entorno lo soporta (si no, polling).
import type { PresenceUser, ThreadMessage } from '~/components/ChatThread.vue'

const route = useRoute()
const api = useApi()
const toast = useToast()
const rt = useRealtime()
const { user } = useAuth()
const { timeAgo, initials } = useFormat()

interface Member { id: number, name: string, slug: string, avatarUrl: string, role: string, lastSeenAt: string, online: boolean, unread: number }
interface OtherView { id: number, name: string, slug: string, avatarUrl: string, online: boolean }
interface DmMessage extends ThreadMessage { readAt: string }

const { data: memberData, refresh: refreshMembers } = await useAsyncData('dm-members', () =>
  user.value ? api<{ members: Member[] }>('/api/members') : Promise.resolve({ members: [] as Member[] }))
const members = computed(() => memberData.value?.members || [])

const selected = ref<string>('')
const other = ref<OtherView | null>(null)
const messages = ref<DmMessage[]>([])
const typingName = ref('')
let typingTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let handle: ReturnType<typeof rt.connect> | null = null

function upsert(msg: DmMessage) {
  if (!messages.value.some(m => m.id === msg.id)) messages.value.push(msg)
}

async function markRead(slug: string) {
  try {
    await api(`/api/dms/${slug}/read`, { method: 'POST', body: {} })
    await refreshMembers()
  }
  catch { /* el indicador se actualiza en la próxima carga */ }
}

async function loadConversation(slug: string) {
  const data = await api<{ other: OtherView, messages: DmMessage[] }>(`/api/dms/${slug}`)
  other.value = data.other
  messages.value = data.messages
  await markRead(slug)
}

function connectLive(slug: string) {
  handle?.close()
  handle = null
  rt.checkAvailable().then((ok) => {
    if (!ok || selected.value !== slug) return
    handle = rt.connect(`/api/rt/dm/${slug}`, (data) => {
      if (data.type === 'dm' && data.message) {
        const msg = data.message as DmMessage
        if (!msg.mine) { upsert(msg); markRead(slug) }
      }
      else if (data.type === 'typing' && data.user) {
        const u = data.user as PresenceUser
        if (u.id !== user.value?.id) {
          typingName.value = u.name
          if (typingTimer) clearTimeout(typingTimer)
          typingTimer = setTimeout(() => { typingName.value = '' }, 3000)
        }
      }
    })
  })
}

async function select(slug: string) {
  selected.value = slug
  messages.value = []
  typingName.value = ''
  try {
    await loadConversation(slug)
    connectLive(slug)
  }
  catch (e) {
    toast.add({ title: 'No se pudo abrir la conversación', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

async function send(body: string) {
  if (!selected.value) return
  try {
    const data = await api<{ message: DmMessage }>(`/api/dms/${selected.value}`, { method: 'POST', body: { body } })
    upsert(data.message)
  }
  catch (e) {
    toast.add({ title: 'No se pudo enviar el mensaje', description: (e as { data?: { message?: string } }).data?.message || 'Intentá de nuevo.', color: 'error' })
  }
}

const live = computed(() => !!handle?.connected.value)

onMounted(() => {
  const withSlug = typeof route.query.with === 'string' ? route.query.with : ''
  const initial = withSlug && members.value.some(m => m.slug === withSlug) ? withSlug : members.value[0]?.slug
  if (initial) select(initial)
  pollTimer = setInterval(() => {
    if (selected.value && !handle?.connected.value) loadConversation(selected.value).catch(() => {})
  }, 5000)
})
onUnmounted(() => {
  handle?.close()
  if (pollTimer) clearInterval(pollTimer)
  if (typingTimer) clearTimeout(typingTimer)
})
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Mensajes</h1>
      <p class="text-muted">Conversaciones directas con otros miembros de la comunidad.</p>
    </div>

    <UAlert v-if="!user" color="neutral" variant="soft" icon="i-lucide-lock" title="Iniciá sesión para ver tus mensajes">
      <template #actions>
        <UButton size="sm" to="/login" label="Iniciar sesión" />
      </template>
    </UAlert>

    <div v-else class="grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
      <UCard :ui="{ body: 'p-2 sm:p-2' }">
        <ul class="divide-y divide-default">
          <li v-for="m in members" :key="m.id">
            <button class="flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left hover:bg-elevated" :class="{ 'bg-elevated': selected === m.slug }" @click="select(m.slug)">
              <span class="relative shrink-0">
                <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="sm" />
                <span v-if="m.online" class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" title="En línea" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ m.name }}</span>
                <span class="block text-xs text-muted">{{ m.online ? 'En línea' : (m.lastSeenAt ? `Activo ${timeAgo(m.lastSeenAt)}` : 'Sin actividad reciente') }}</span>
              </span>
              <span v-if="m.unread" class="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{{ m.unread }}</span>
            </button>
          </li>
        </ul>
        <p v-if="!members.length" class="px-2 py-4 text-sm text-muted">Todavía no hay otros miembros en la comunidad.</p>
      </UCard>

      <UCard v-if="other">
        <template #header>
          <div class="flex items-center gap-2.5">
            <span class="relative shrink-0">
              <UAvatar :src="other.avatarUrl || undefined" :text="initials(other.name)" size="md" />
              <span v-if="other.online" class="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" />
            </span>
            <div>
              <NuxtLink :to="`/profile/${other.slug}`" class="font-bold hover:underline">{{ other.name }}</NuxtLink>
              <p class="text-xs text-muted">{{ other.online ? 'En línea' : 'Sin conexión reciente' }}</p>
            </div>
          </div>
        </template>
        <ChatThread
          :messages="messages" :live="live" :typing-name="typingName" :me-id="user?.id ?? null"
          placeholder="Escribí un mensaje directo…" @send="send" @typing="handle?.sendTyping()"
        />
      </UCard>
      <UCard v-else>
        <p class="py-8 text-center text-sm text-muted">Elegí un miembro para empezar a conversar.</p>
      </UCard>
    </div>
  </div>
</template>
