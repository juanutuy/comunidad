<script setup lang="ts">
export interface PollOptionView { id: number, label: string, votes: number, pct: number }
export interface PollView { options: PollOptionView[], totalVotes: number, myOptionId: number | null }

export interface PostView {
  id: number
  slug: string
  title: string
  body: string
  bodyHtml?: string
  teaser: string
  locked: boolean
  mediaType: string
  mediaUrl: string
  attachmentName?: string
  pinned: boolean
  kind?: string
  status?: string
  allowComments?: boolean
  edited?: boolean
  createdAt: string
  author: { name: string, slug: string, avatarUrl?: string, role?: string, online?: boolean, anonymous?: boolean, mine?: boolean, realAuthor?: { name: string, slug: string, avatarUrl?: string }, realRole?: string }
  channel: { name: string, slug: string, type: string }
  reactions: Record<string, number>
  myReactions: string[]
  commentCount: number
  bookmarked: boolean
  poll?: PollView | null
}

const props = defineProps<{ post: PostView, linkable?: boolean }>()
const emit = defineEmits<{ changed: [], deleted: [] }>()
const { user } = useAuth()
const { openReport } = useReportDialog()
const { timeAgo, initials } = useFormat()
const api = useApi()
const toast = useToast()

const reactionMeta = [
  { type: 'love', icon: 'i-lucide-heart', label: 'Me encanta' },
  { type: 'like', icon: 'i-lucide-thumbs-up', label: 'Me gusta' },
  { type: 'fire', icon: 'i-lucide-flame', label: 'Fuego' },
  { type: 'clap', icon: 'i-lucide-hand-metal', label: 'Aplausos' },
]

const localReactions = ref({ ...props.post.reactions })
const localMine = ref([...props.post.myReactions])
const localBookmarked = ref(props.post.bookmarked)
watch(() => props.post, (p) => {
  localReactions.value = { ...p.reactions }
  localMine.value = [...p.myReactions]
  localBookmarked.value = p.bookmarked
})

const youtubeEmbed = computed(() => {
  if (props.post.mediaType !== 'video') return ''
  const url = props.post.mediaUrl
  if (url.includes('/embed/')) return url
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : ''
})

async function toggleReaction(type: string) {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para reaccionar', color: 'warning' }); return }
  const wasActive = localMine.value.includes(type)
  localMine.value = wasActive ? localMine.value.filter(t => t !== type) : [...localMine.value, type]
  localReactions.value[type] = (localReactions.value[type] || 0) + (wasActive ? -1 : 1)
  try { await api(`/api/posts/${props.post.id}/reactions`, { method: 'POST', body: { type } }) }
  catch { emit('changed') }
}

async function toggleBookmark() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para guardar', color: 'warning' }); return }
  localBookmarked.value = !localBookmarked.value
  try { await api(`/api/posts/${props.post.id}/bookmark`, { method: 'POST' }) }
  catch { emit('changed') }
}

async function togglePin() {
  try {
    await api(`/api/posts/${props.post.id}/pin`, { method: 'POST' })
    toast.add({ title: 'Publicación actualizada', color: 'success' })
    emit('changed')
  }
  catch { toast.add({ title: 'No se pudo fijar la publicación', color: 'error' }) }
}

// Encuesta (Fase 5): votar o cambiar el voto; el servidor devuelve
// los conteos actualizados y se refleja sin recargar.
const localPoll = ref<PollView | null>(props.post.poll ?? null)
watch(() => props.post.poll, p => { localPoll.value = p ?? null })
const voting = ref(false)
async function vote(optionId: number) {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para votar', color: 'warning' }); return }
  if (voting.value || localPoll.value?.myOptionId === optionId) return
  voting.value = true
  try {
    const res = await api<{ poll: PollView }>(`/api/posts/${props.post.id}/poll-vote`, { method: 'POST', body: { optionId } })
    localPoll.value = res.poll
  }
  catch (e) {
    toast.add({ title: 'No se pudo registrar tu voto', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { voting.value = false }
}

// Fase 5: ocultar la publicación solo para mí (no es moderación).
const locallyHidden = ref(false)
async function hidePost() {
  try {
    await api(`/api/posts/${props.post.id}/hide`, { method: 'POST' })
    locallyHidden.value = true
    toast.add({ title: 'Publicación oculta', description: 'Podés volver a mostrarla desde Ajustes de cuenta.', color: 'success' })
    emit('changed')
  }
  catch { toast.add({ title: 'No se pudo ocultar la publicación', color: 'error' }) }
}
// Fase 7: el menú «…» de la cabecera reúne las acciones secundarias
// (ocultar para mí, fijar si soy admin, eliminar si corresponde).
const postMenuItems = computed(() => {
  const items: { label: string, icon: string, onSelect: () => void }[] = []
  // En un post anónimo el slug viene vacío: «es mío» lo dice la marca
  // `mine` del serializador, no la comparación de slugs.
  const notMine = !!user.value && !props.post.author.mine && user.value.slug !== props.post.author.slug
  if (notMine)
    items.push({ label: 'Ocultar publicación', icon: 'i-lucide-eye-off', onSelect: hidePost })
  if (user.value?.role === 'admin')
    items.push({ label: props.post.pinned ? 'Desfijar' : 'Fijar (anuncio)', icon: 'i-lucide-pin', onSelect: togglePin })
  if (canDelete.value)
    items.push({ label: 'Eliminar publicación', icon: 'i-lucide-trash-2', onSelect: () => { confirmDelete.value = true } })
  // Fase 12: reportar contenido ajeno (el servidor también lo valida).
  if (notMine)
    items.push({ label: 'Reportar', icon: 'i-lucide-flag', onSelect: () => openReport({ type: 'post', id: props.post.id, label: props.post.title }) })
  return [items]
})

// Fase 14: el moderador también puede eliminar publicaciones ajenas.
const canDelete = computed(() => !!user.value && (['admin', 'moderator'].includes(user.value.role || '') || !!props.post.author.mine || user.value.slug === props.post.author.slug))
const confirmDelete = ref(false)
const deleting = ref(false)
async function deletePost() {
  deleting.value = true
  try {
    await api(`/api/posts/${props.post.id}`, { method: 'DELETE' })
    toast.add({ title: 'Publicación eliminada', color: 'success' })
    confirmDelete.value = false
    emit('deleted')
    emit('changed')
  }
  catch { toast.add({ title: 'No se pudo eliminar la publicación', color: 'error' }) }
  finally { deleting.value = false }
}
</script>

<template>
  <UCard v-if="!locallyHidden">
    <div class="flex items-start gap-3">
      <span class="relative shrink-0">
        <UAvatar v-if="post.author.anonymous && !post.author.mine" icon="i-lucide-venetian-mask" size="md" :ui="{ root: 'bg-elevated' }" />
        <UAvatar v-else :src="post.author.avatarUrl || undefined" :text="initials(post.author.name)" size="md" />
        <span v-if="post.author.online" class="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" title="En línea" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-start gap-2">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <!-- Post anónimo (Fase 8): sin enlace al perfil. El admin
                 ve además la autoría real, entre paréntesis. -->
            <span v-if="post.author.anonymous && !post.author.mine" class="font-semibold">Anónimo</span>
            <NuxtLink v-else :to="`/profile/${post.author.slug}`" class="font-semibold hover:underline">
              {{ post.author.name }}
            </NuxtLink>
            <UBadge v-if="post.author.anonymous" color="neutral" variant="subtle" size="sm" icon="i-lucide-venetian-mask">
              Anónimo
            </UBadge>
            <span v-if="post.author.realAuthor" class="text-xs text-muted">
              (autor: <NuxtLink :to="`/profile/${post.author.realAuthor.slug}`" class="hover:underline">{{ post.author.realAuthor.name }}</NuxtLink>)
            </span>
            <UBadge v-if="post.author.role === 'admin' || post.author.realRole === 'admin'" color="primary" variant="solid" size="sm">
              Admin
            </UBadge>
            <span class="text-muted"># en</span>
            <NuxtLink :to="`/channels/${post.channel.slug}`" class="font-medium text-primary hover:underline">
              {{ post.channel.name }}
            </NuxtLink>
            <span class="text-muted">· {{ timeAgo(post.createdAt) }}</span>
            <span v-if="post.edited" class="flex items-center gap-1 text-muted">
              · <UIcon name="i-lucide-pencil" class="text-xs" /> Editado
            </span>
            <UBadge v-if="post.pinned" color="warning" variant="subtle" icon="i-lucide-pin">
              Fijado
            </UBadge>
            <UBadge v-if="post.status === 'review'" color="warning" variant="subtle" icon="i-lucide-eye">
              En revisión
            </UBadge>
            <UBadge v-if="post.kind === 'poll'" color="primary" variant="subtle" icon="i-lucide-bar-chart-3">
              Encuesta
            </UBadge>
            <UBadge v-if="post.channel.type === 'paid'" color="neutral" variant="subtle" icon="i-lucide-crown">
              Premium
            </UBadge>
          </div>
          <UButton
            size="sm" color="neutral" :variant="localBookmarked ? 'soft' : 'ghost'"
            :icon="localBookmarked ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
            :title="localBookmarked ? 'Guardado' : 'Guardar'" class="shrink-0" @click="toggleBookmark"
          />
          <UDropdownMenu v-if="user && postMenuItems[0]?.length" :items="postMenuItems" class="shrink-0">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-more-horizontal" title="Más acciones" />
          </UDropdownMenu>
        </div>

        <NuxtLink v-if="linkable !== false" :to="`/p/${post.channel.slug}/${post.slug}`" class="mt-1 block text-lg font-bold leading-snug hover:underline">
          {{ post.title }}
        </NuxtLink>
        <h1 v-else class="mt-1 text-2xl font-bold leading-snug">
          {{ post.title }}
        </h1>

        <div v-if="post.locked" class="mt-3 rounded-lg border border-dashed border-default p-4">
          <p class="text-sm text-muted">
            {{ post.teaser }}
          </p>
          <div class="mt-3 flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-lock" />
            Contenido completo solo con acceso a este canal.
            <NuxtLink :to="`/channels/${post.channel.slug}`" class="text-primary hover:underline">
              Obtener acceso
            </NuxtLink>
          </div>
        </div>
        <div v-else>
          <!-- Fase 8: con cuerpo rico se muestra el HTML (sanitizado
               en el servidor al guardar y al servir); sin él, el
               texto plano de siempre. -->
          <div v-if="post.bodyHtml" class="rich-content mt-2 text-[15px] leading-relaxed" v-html="post.bodyHtml" />
          <p v-else class="mt-2 whitespace-pre-line text-[15px] leading-relaxed">
            {{ post.body }}
          </p>
          <div v-if="post.mediaType === 'video' && youtubeEmbed" class="mt-3 aspect-video overflow-hidden rounded-lg">
            <iframe :src="youtubeEmbed" class="h-full w-full" allowfullscreen title="Video de la publicación" />
          </div>
          <div v-else-if="post.mediaType === 'image' && post.mediaUrl" class="mt-3">
            <img :src="post.mediaUrl" alt="Imagen de la publicación" class="max-h-96 w-full rounded-lg object-cover">
          </div>
          <div v-else-if="post.mediaType === 'video' && post.mediaUrl" class="mt-3 text-sm">
            <a :href="post.mediaUrl" target="_blank" rel="noopener" class="text-primary hover:underline">Ver video</a>
          </div>
          <a
            v-else-if="post.mediaType === 'file' && post.mediaUrl" :href="post.mediaUrl" download
            class="mt-3 flex items-center gap-3 rounded-lg border border-default p-3 text-sm transition hover:bg-elevated"
          >
            <UIcon name="i-lucide-paperclip" class="shrink-0 text-lg text-muted" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ post.attachmentName || 'Archivo adjunto' }}</span>
            <span class="flex shrink-0 items-center gap-1 text-primary"><UIcon name="i-lucide-download" /> Descargar</span>
          </a>

          <div v-if="localPoll" class="mt-4 space-y-2">
            <button
              v-for="opt in localPoll.options"
              :key="opt.id"
              class="relative block w-full overflow-hidden rounded-lg border text-left text-sm transition"
              :class="localPoll.myOptionId === opt.id ? 'border-primary bg-primary/5 font-medium' : 'border-default hover:bg-elevated'"
              :disabled="voting"
              @click="vote(opt.id)"
            >
              <span class="absolute inset-y-0 left-0 bg-primary/15" :style="{ width: `${localPoll.myOptionId || localPoll.totalVotes ? opt.pct : 0}%` }" />
              <span class="relative flex items-center gap-2 px-3 py-2">
                <UIcon v-if="localPoll.myOptionId === opt.id" name="i-lucide-check-circle-2" class="shrink-0 text-primary" />
                <span class="min-w-0 flex-1 truncate">{{ opt.label }}</span>
                <span v-if="localPoll.totalVotes || localPoll.myOptionId" class="shrink-0 text-muted">{{ opt.pct }}% · {{ opt.votes }}</span>
              </span>
            </button>
            <p class="text-xs text-muted">
              {{ localPoll.totalVotes }} voto{{ localPoll.totalVotes === 1 ? '' : 's' }}<span v-if="localPoll.myOptionId"> · Tocá otra opción para cambiar tu voto</span><span v-else-if="user"> · Tocá una opción para votar</span>
            </p>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-1 border-t border-default pt-3">
          <UButton
            v-for="r in reactionMeta"
            :key="r.type"
            size="sm"
            :color="localMine.includes(r.type) ? 'primary' : 'neutral'"
            :variant="localMine.includes(r.type) ? 'soft' : 'ghost'"
            :icon="r.icon"
            :label="`${localReactions[r.type] || 0}`"
            :title="r.label"
            @click="toggleReaction(r.type)"
          />
          <NuxtLink v-if="post.allowComments !== false" :to="`/p/${post.channel.slug}/${post.slug}`" class="ml-1">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-message-circle" :label="`${post.commentCount} comentarios`" />
          </NuxtLink>
          <span v-else class="ml-1 flex items-center gap-1.5 px-2 text-sm text-muted" title="El autor desactivó los comentarios">
            <UIcon name="i-lucide-lock" /> Comentarios desactivados
          </span>
        </div>

        <UModal v-model:open="confirmDelete" title="Eliminar publicación" description="Esta acción no se puede deshacer: se borran también sus comentarios y reacciones.">
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" label="Cancelar" @click="confirmDelete = false" />
              <UButton color="error" label="Sí, eliminar" icon="i-lucide-trash-2" :loading="deleting" @click="deletePost" />
            </div>
          </template>
        </UModal>
      </div>
    </div>
  </UCard>
</template>
