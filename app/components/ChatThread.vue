<script setup lang="ts">
// Hilo de mensajes compartido por el chat de canal y los mensajes
// directos (Fase 3): lista con auto-scroll si estás al final, presencia
// opcional, indicador «escribiendo…» y compositor. La lógica de datos
// (carga, envío, vivo/polling) vive en cada pantalla; este componente
// solo presenta y emite.
export interface ThreadMessage {
  id: number
  body: string
  createdAt: string
  mine?: boolean
  author: { id: number, name: string, slug: string, avatarUrl: string }
}
export interface PresenceUser { id: number, name: string, slug: string, avatarUrl?: string }

const props = defineProps<{
  messages: ThreadMessage[]
  live: boolean
  presence?: PresenceUser[]
  typingName?: string
  meId?: number | null
  placeholder?: string
  // Fase 14: si viene un texto, el compositor se reemplaza por este
  // aviso (compuerta por nivel de mensajes directos): el hilo se
  // sigue leyendo, pero no se ofrece un control que el servidor
  // rechazaría con 403.
  blockedMessage?: string
}>()
const emit = defineEmits<{ send: [body: string], typing: [] }>()

const { t } = useI18n()
const { timeAgo, initials } = useFormat()
const draft = ref('')
const scroller = ref<HTMLElement | null>(null)
const sending = ref(false)

function nearBottom(): boolean {
  const el = scroller.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 140
}
function scrollDown() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(() => props.messages.length, async () => {
  const wasNear = nearBottom()
  await nextTick()
  if (wasNear) scrollDown()
})
onMounted(async () => { await nextTick(); scrollDown() })

async function submit() {
  const body = draft.value.trim()
  if (!body || sending.value) return
  sending.value = true
  try {
    emit('send', body)
    draft.value = ''
    await nextTick()
    scrollDown()
  }
  finally { sending.value = false }
}
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <UBadge :color="live ? 'success' : 'neutral'" variant="soft" :icon="live ? 'i-lucide-radio' : 'i-lucide-refresh-cw'" size="sm">
        {{ live ? t('chat.live') : t('chat.periodic') }}
      </UBadge>
      <template v-if="presence && presence.length">
        <span class="text-xs text-muted">{{ t('chat.inRoom') }}</span>
        <span v-for="u in presence" :key="u.id" class="inline-flex items-center gap-1.5 rounded-full bg-elevated py-0.5 pr-2.5 pl-1 text-xs">
          <span class="relative flex">
            <UAvatar :src="u.avatarUrl || undefined" :text="initials(u.name)" size="3xs" />
            <span class="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" />
          </span>
          {{ u.name }}
        </span>
      </template>
    </div>

    <div ref="scroller" class="max-h-[480px] space-y-4 overflow-y-auto pr-1">
      <div v-for="m in messages" :key="m.id" class="flex gap-2.5">
        <NuxtLink :to="`/profile/${m.author.slug}`" class="shrink-0">
          <UAvatar :src="m.author.avatarUrl || undefined" :text="initials(m.author.name)" size="sm" />
        </NuxtLink>
        <div class="min-w-0">
          <p class="text-sm">
            <NuxtLink :to="`/profile/${m.author.slug}`" class="font-semibold hover:underline" :class="{ 'text-primary': meId && m.author.id === meId }">{{ m.author.name }}</NuxtLink>
            <span class="ml-2 text-xs text-muted">{{ timeAgo(m.createdAt) }}</span>
          </p>
          <p class="text-sm whitespace-pre-line">{{ m.body }}</p>
        </div>
      </div>
      <p v-if="!messages.length" class="py-6 text-center text-sm text-muted">{{ t('chat.empty') }}</p>
    </div>

    <p class="mt-2 h-4 text-xs text-muted italic">{{ typingName ? t('chat.typing', { name: typingName }) : '' }}</p>

    <UAlert v-if="blockedMessage" class="mt-1" color="warning" variant="soft" icon="i-lucide-lock" :title="blockedMessage" />
    <form v-else class="mt-1 flex items-end gap-2" @submit.prevent="submit">
      <UTextarea v-model="draft" :rows="2" :placeholder="placeholder || t('chat.writeMessage')" class="flex-1" @input="emit('typing')" @keydown.enter.exact.prevent="submit" />
      <UButton type="submit" icon="i-lucide-send" :label="t('chat.send')" :loading="sending" />
    </form>
  </div>
</template>
