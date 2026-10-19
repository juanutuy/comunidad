<script setup lang="ts">
// Chat de un canal (Fase 3): historial y envío por REST; recepción en
// vivo por WebSocket (Durable Object) cuando el entorno lo soporta y,
// si no, polling corto cada 4 s. Presencia de la sala en vivo.
import type { PresenceUser, ThreadMessage } from '~/components/ChatThread.vue'

const props = defineProps<{ slug: string }>()
const api = useApi()
const toast = useToast()
const rt = useRealtime()
const { user } = useAuth()

const messages = ref<ThreadMessage[]>([])
const presence = ref<PresenceUser[]>([])
const typingName = ref('')
let typingTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let handle: ReturnType<typeof rt.connect> | null = null

function upsert(list: ThreadMessage[], msg: ThreadMessage) {
  if (!list.some(m => m.id === msg.id)) list.push(msg)
}

async function load() {
  try {
    const data = await api<{ messages: ThreadMessage[] }>(`/api/channels/${props.slug}/chat`)
    for (const m of data.messages) upsert(messages.value, m)
    messages.value.sort((a, b) => a.id - b.id)
  }
  catch { /* sin acceso o sin red: el hilo queda como está */ }
}

async function send(body: string) {
  try {
    const data = await api<{ message: ThreadMessage }>(`/api/channels/${props.slug}/chat`, { method: 'POST', body: { body } })
    upsert(messages.value, data.message) // el eco en vivo se deduplica por id
  }
  catch (e) {
    toast.add({ title: 'No se pudo enviar el mensaje', description: (e as { data?: { message?: string } }).data?.message || 'Intentá de nuevo.', color: 'error' })
  }
}

const live = computed(() => !!handle?.connected.value)

onMounted(async () => {
  await load()
  if (await rt.checkAvailable()) {
    handle = rt.connect(`/api/rt/channel/${props.slug}`, (data) => {
      if (data.type === 'chat' && data.message) upsert(messages.value, data.message as ThreadMessage)
      else if (data.type === 'presence' && Array.isArray(data.users)) presence.value = data.users as PresenceUser[]
      else if (data.type === 'typing' && data.user) {
        const u = data.user as PresenceUser
        if (u.id !== user.value?.id) {
          typingName.value = u.name
          if (typingTimer) clearTimeout(typingTimer)
          typingTimer = setTimeout(() => { typingName.value = '' }, 3000)
        }
      }
    })
  }
  // Polling de respaldo: solo corre mientras no haya socket vivo.
  pollTimer = setInterval(() => { if (!handle?.connected.value) load() }, 4000)
})
onUnmounted(() => {
  handle?.close()
  if (pollTimer) clearInterval(pollTimer)
  if (typingTimer) clearTimeout(typingTimer)
})
</script>

<template>
  <ChatThread
    :messages="messages" :live="live" :presence="presence" :typing-name="typingName"
    :me-id="user?.id ?? null" placeholder="Escribí en el chat del canal…"
    @send="send" @typing="handle?.sendTyping()"
  />
</template>
