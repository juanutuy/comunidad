<script setup lang="ts">
// Mensajes (Fase 3 + Fase 5): conversaciones directas 1 a 1 y salas
// grupales. Historial y envío por REST; recepción en vivo por
// WebSocket cuando el entorno lo soporta (si no, polling corto).
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
interface RoomSummary { id: number, name: string, memberCount: number, lastBody: string, lastAt: string }
interface RoomMember { id: number, name: string, slug: string, avatarUrl: string }

const { data: memberData, refresh: refreshMembers } = await useAsyncData('dm-members', () =>
  user.value ? api<{ members: Member[] }>('/api/members') : Promise.resolve({ members: [] as Member[] }))
const members = computed(() => memberData.value?.members || [])

const { data: roomData, refresh: refreshRooms } = await useAsyncData('chat-rooms', () =>
  user.value ? api<{ rooms: RoomSummary[] }>('/api/rooms') : Promise.resolve({ rooms: [] as RoomSummary[] }))
const rooms = computed(() => roomData.value?.rooms || [])

// Vista actual: un DM (por slug) o una sala (por id).
const mode = ref<'dm' | 'room'>('dm')
const selected = ref<string>('')
const selectedRoom = ref<number | null>(null)
const other = ref<OtherView | null>(null)
const roomInfo = ref<{ id: number, name: string, members: RoomMember[] } | null>(null)
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

async function loadRoom(id: number) {
  const data = await api<{ room: { id: number, name: string, members: RoomMember[] }, messages: DmMessage[] }>(`/api/rooms/${id}`)
  roomInfo.value = data.room
  messages.value = data.messages
}

function connectLive(path: string, type: string) {
  handle?.close()
  handle = null
  rt.checkAvailable().then((ok) => {
    if (!ok) return
    if (type === 'dm' && (mode.value !== 'dm' || selected.value !== path.split('/').pop())) return
    if (type === 'room' && (mode.value !== 'room' || String(selectedRoom.value) !== path.split('/').pop())) return
    handle = rt.connect(path, (data) => {
      if ((data.type === 'dm' || data.type === 'room') && data.message) {
        const msg = data.message as DmMessage
        if (!msg.mine) {
          upsert(msg)
          if (type === 'dm') markRead(selected.value)
        }
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
  mode.value = 'dm'
  selected.value = slug
  selectedRoom.value = null
  roomInfo.value = null
  messages.value = []
  typingName.value = ''
  try {
    await loadConversation(slug)
    connectLive(`/api/rt/dm/${slug}`, 'dm')
  }
  catch (e) {
    toast.add({ title: 'No se pudo abrir la conversación', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

async function selectRoom(id: number) {
  mode.value = 'room'
  selectedRoom.value = id
  selected.value = ''
  other.value = null
  messages.value = []
  typingName.value = ''
  try {
    await loadRoom(id)
    connectLive(`/api/rt/room/${id}`, 'room')
  }
  catch (e) {
    toast.add({ title: 'No se pudo abrir la sala', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

async function send(body: string) {
  try {
    if (mode.value === 'room' && selectedRoom.value) {
      const data = await api<{ message: DmMessage }>(`/api/rooms/${selectedRoom.value}`, { method: 'POST', body: { body } })
      upsert(data.message)
      await refreshRooms()
    }
    else if (selected.value) {
      const data = await api<{ message: DmMessage }>(`/api/dms/${selected.value}`, { method: 'POST', body: { body } })
      upsert(data.message)
    }
  }
  catch (e) {
    toast.add({ title: 'No se pudo enviar el mensaje', description: (e as { data?: { message?: string } }).data?.message || 'Intentá de nuevo.', color: 'error' })
  }
}

// Crear sala: nombre + al menos 2 miembros más.
const showCreateRoom = ref(false)
const roomForm = reactive({ name: '', members: [] as string[] })
const creatingRoom = ref(false)
async function createRoom() {
  creatingRoom.value = true
  try {
    const res = await api<{ room: { id: number } }>('/api/rooms', { method: 'POST', body: { name: roomForm.name, memberSlugs: roomForm.members } })
    toast.add({ title: 'Sala creada', color: 'success' })
    showCreateRoom.value = false
    roomForm.name = ''
    roomForm.members = []
    await refreshRooms()
    await selectRoom(res.room.id)
  }
  catch (e) {
    toast.add({ title: 'No se pudo crear la sala', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { creatingRoom.value = false }
}

const live = computed(() => !!handle?.connected.value)

onMounted(() => {
  const withSlug = typeof route.query.with === 'string' ? route.query.with : ''
  const initial = withSlug && members.value.some(m => m.slug === withSlug) ? withSlug : members.value[0]?.slug
  if (initial) select(initial)
  pollTimer = setInterval(() => {
    if (handle?.connected.value) return
    if (mode.value === 'dm' && selected.value) loadConversation(selected.value).catch(() => {})
    if (mode.value === 'room' && selectedRoom.value) loadRoom(selectedRoom.value).catch(() => {})
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
      <p class="text-muted">Conversaciones directas y salas grupales con miembros de la comunidad.</p>
    </div>

    <UAlert v-if="!user" color="neutral" variant="soft" icon="i-lucide-lock" title="Iniciá sesión para ver tus mensajes">
      <template #actions>
        <UButton size="sm" to="/login" label="Iniciar sesión" />
      </template>
    </UAlert>

    <div v-else class="grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
      <div class="space-y-5">
        <UCard :ui="{ body: 'p-2 sm:p-2' }">
          <div class="flex items-center justify-between px-2 pt-1 pb-2">
            <h2 class="text-sm font-bold">Salas grupales</h2>
            <UButton size="xs" icon="i-lucide-plus" label="Nueva sala" @click="showCreateRoom = true" />
          </div>
          <ul class="divide-y divide-default">
            <li v-for="r in rooms" :key="r.id">
              <button class="flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left hover:bg-elevated" :class="{ 'bg-elevated': mode === 'room' && selectedRoom === r.id }" @click="selectRoom(r.id)">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <UIcon name="i-lucide-users" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ r.name }}</span>
                  <span class="block truncate text-xs text-muted">{{ r.memberCount }} miembros<span v-if="r.lastBody"> · {{ r.lastBody }}</span></span>
                </span>
              </button>
            </li>
          </ul>
          <p v-if="!rooms.length" class="px-2 py-3 text-sm text-muted">Todavía no estás en ninguna sala. Creá la primera.</p>
        </UCard>

        <UCard :ui="{ body: 'p-2 sm:p-2' }">
          <h2 class="px-2 pt-1 pb-2 text-sm font-bold">Mensajes directos</h2>
          <ul class="divide-y divide-default">
            <li v-for="m in members" :key="m.id">
              <button class="flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left hover:bg-elevated" :class="{ 'bg-elevated': mode === 'dm' && selected === m.slug }" @click="select(m.slug)">
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
      </div>

      <UCard v-if="mode === 'dm' && other">
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
      <UCard v-else-if="mode === 'room' && roomInfo">
        <template #header>
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <UIcon name="i-lucide-users" class="text-xl" />
            </span>
            <div class="min-w-0">
              <p class="font-bold">{{ roomInfo.name }}</p>
              <p class="truncate text-xs text-muted">{{ roomInfo.members.map(m => m.name).join(', ') }}</p>
            </div>
          </div>
        </template>
        <ChatThread
          :messages="messages" :live="live" :typing-name="typingName" :me-id="user?.id ?? null"
          placeholder="Escribí en la sala…" @send="send" @typing="handle?.sendTyping()"
        />
      </UCard>
      <UCard v-else>
        <p class="py-8 text-center text-sm text-muted">Elegí una sala o un miembro para empezar a conversar.</p>
      </UCard>
    </div>

    <UModal v-model:open="showCreateRoom" title="Nueva sala grupal" description="Elegí un nombre y al menos 2 miembros más de la comunidad.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Nombre de la sala">
            <UInput v-model="roomForm.name" placeholder="Ej.: Equipo de contenido" class="w-full" maxlength="60" />
          </UFormField>
          <UFormField label="Miembros">
            <div class="max-h-56 space-y-1 overflow-y-auto">
              <label v-for="m in members" :key="m.id" class="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-elevated">
                <UCheckbox v-model="roomForm.members" :value="m.slug" />
                <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="sm" />
                <span class="text-sm font-medium">{{ m.name }}</span>
              </label>
            </div>
            <p class="mt-1 text-xs text-muted">{{ roomForm.members.length }} seleccionados (mínimo 2).</p>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="showCreateRoom = false" />
          <UButton label="Crear sala" icon="i-lucide-users" :loading="creatingRoom" :disabled="!roomForm.name.trim() || roomForm.members.length < 2" @click="createRoom" />
        </div>
      </template>
    </UModal>
  </div>
</template>
