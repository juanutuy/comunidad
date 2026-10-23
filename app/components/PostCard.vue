<script setup lang="ts">
const guestAccess = useGuestAccess()
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
  // Fase 15: leer no es participar (anticipo completo) y conteo de
  // adjuntos sin entregar el archivo (null = ni el conteo sale).
  canInteract?: boolean
  mediaCount?: number | null
  mediaType: string
  mediaUrl: string
  attachmentName?: string
  pinned: boolean
  kind?: string
  // Fase 16-F: álbum del post en canales de imagen.
  album?: string
  status?: string
  allowComments?: boolean
  edited?: boolean
  createdAt: string
  author: { name: string, slug: string, avatarUrl?: string, role?: string, online?: boolean, anonymous?: boolean, mine?: boolean, realAuthor?: { name: string, slug: string, avatarUrl?: string }, realRole?: string }
  channel: { name: string, slug: string, type: string }
  // Fase 16-G: reacciones con emojis — conteos por emoji, top,
  // total y MI reacción (una sola; null = ninguna).
  reactions: Record<string, number>
  reactionTop: string[]
  reactionTotal: number
  myReaction: string | null
  commentCount: number
  bookmarked: boolean
  poll?: PollView | null
}

// `inlineComments: false` (detalle): la sección vive debajo de la
// tarjeta y el botón de comentarios ancla hasta ella, en vez de
// expandir una segunda copia dentro de la tarjeta.
const props = defineProps<{ post: PostView, linkable?: boolean, inlineComments?: boolean }>()
const emit = defineEmits<{ changed: [], deleted: [] }>()
const { user } = useAuth()
const { t } = useI18n()
const { openReport } = useReportDialog()
const { timeAgo, initials } = useFormat()
const api = useApi()
const toast = useToast()

// Fase 16-G: estado local de reacciones con emojis, sincronizado
// con las props cuando el padre refresca (mismo patrón que el
// resto de la tarjeta).
const localReactions = ref<Record<string, number>>({ ...props.post.reactions })
const localReactionTop = ref<string[]>([...(props.post.reactionTop || [])])
const localReactionTotal = ref(props.post.reactionTotal || 0)
const localMyReaction = ref<string | null>(props.post.myReaction ?? null)
const localBookmarked = ref(props.post.bookmarked)
// Fase 16-B: estado local sincronizado de comentarios abiertos/
// cerrados (el menú lo cambia sin esperar la recarga del padre) y
// «override» de la última edición hecha desde esta misma tarjeta, para
// que el cambio se vea al instante en TODAS las superficies (también
// en la búsqueda, que no escucha @changed). Cuando el padre refresca,
// las props traen los valores del servidor y el override se descarta.
const localAllowComments = ref(props.post.allowComments !== false)
const editOverride = ref<{ title: string, body: string, bodyHtml: string } | null>(null)
const displayTitle = computed(() => editOverride.value?.title ?? props.post.title)
const displayBody = computed(() => editOverride.value?.body ?? props.post.body)
const displayBodyHtml = computed(() => editOverride.value ? editOverride.value.bodyHtml : props.post.bodyHtml)
const displayEdited = computed(() => !!editOverride.value || !!props.post.edited)
watch(() => props.post, (p) => {
  localReactions.value = { ...p.reactions }
  localReactionTop.value = [...(p.reactionTop || [])]
  localReactionTotal.value = p.reactionTotal || 0
  localMyReaction.value = p.myReaction ?? null
  localBookmarked.value = p.bookmarked
  localAllowComments.value = p.allowComments !== false
  editOverride.value = null
})

const youtubeEmbed = computed(() => {
  if (props.post.mediaType !== 'video') return ''
  const url = props.post.mediaUrl
  if (url.includes('/embed/')) return url
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : ''
})

// Fase 16-G: elegir un emoji crea, reemplaza o quita MI reacción
// (semántica del servidor); la respuesta trae el resumen fresco y
// se aplica tal cual, sin cálculo optimista que pueda desfasarse.
async function toggleReaction(type: string) {
  if (!user.value) { guestAccess.requestAccess(); return }
  try {
    const res = await api<{ reactions: Record<string, number>, reactionTop: string[], reactionTotal: number, myReaction: string | null }>(`/api/posts/${props.post.id}/reactions`, { method: 'POST', body: { type } })
    localReactions.value = res.reactions
    localReactionTop.value = res.reactionTop
    localReactionTotal.value = res.reactionTotal
    localMyReaction.value = res.myReaction
  }
  catch { emit('changed') }
}

// Fase 16-G: la sección de comentarios se EXPANDE dentro de la
// tarjeta (como en el original) y comparte estado con el detalle
// (usePostComments): el conteo visible sale de ahí cuando ya se
// cargó la conversación.
const postComments = usePostComments()
const commentsState = postComments.state(props.post.id)
const commentsOpen = ref(false)
const displayCommentCount = computed(() => commentsState.loaded ? commentsState.total : props.post.commentCount)

async function toggleBookmark() {
  if (!user.value) { guestAccess.requestAccess(); return }
  localBookmarked.value = !localBookmarked.value
  try { await api(`/api/posts/${props.post.id}/bookmark`, { method: 'POST' }) }
  catch { emit('changed') }
}

async function togglePin() {
  try {
    await api(`/api/posts/${props.post.id}/pin`, { method: 'POST' })
    toast.add({ title: t('post.pinUpdated'), color: 'success' })
    emit('changed')
  }
  catch { toast.add({ title: t('post.pinFailed'), color: 'error' }) }
}

// Fase 16-B: activar/desactivar comentarios desde el menú (autor o
// staff). Es la misma allow_comments que respeta la API de
// comentarios; el estado local se actualiza al instante y el padre
// refresca con @changed.
async function toggleComments() {
  try {
    const res = await api<{ allowComments: boolean }>(`/api/posts/${props.post.id}/comments-toggle`, { method: 'POST' })
    localAllowComments.value = res.allowComments
    toast.add({ title: res.allowComments ? t('post.commentsOnToast') : t('post.commentsOffToast'), color: 'success' })
    emit('changed')
  }
  catch { toast.add({ title: t('post.commentsToggleFailed'), color: 'error' }) }
}

// Fase 16-B: copiar el enlace REAL del detalle (origen actual + ruta
// canónica /p/<canal>/<post>). Sin clipboard API se cae a la selección
// manual con prompt, pero el valor copiado/ofrecido es siempre el real.
async function copyLink() {
  const url = `${window.location.origin}/p/${props.post.channel.slug}/${props.post.slug}`
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: t('post.linkCopied'), description: url, color: 'success' })
  }
  catch {
    window.prompt(t('post.copyLinkPrompt'), url)
  }
}

function viewPost() {
  navigateTo(`/p/${props.post.channel.slug}/${props.post.slug}`)
}

// Fase 16-B → 16-C: editar la publicación DESDE la tarjeta abre el
// compositor del proyecto en modo edición (el mismo de crear, ver
// PostComposer y usePostEditor) — la tarjeta ya NO tiene modal de
// edición propio. Al guardar, el compositor avisa por usePostEditor
// y esta tarjeta aplica el override al instante (también en la
// búsqueda, que no escucha @changed) y avisa al padre.
const { openPostEditor, saved: editorSaved } = usePostEditor()
function startEdit() {
  openPostEditor({
    id: props.post.id,
    title: displayTitle.value,
    body: displayBody.value,
    bodyHtml: displayBodyHtml.value || '',
    kind: props.post.kind || 'post',
    status: props.post.status || 'published',
    channelSlug: props.post.channel.slug,
    channelName: props.post.channel.name,
    anonymous: !!props.post.author.anonymous,
    allowComments: localAllowComments.value,
    pinned: props.post.pinned,
    mediaType: props.post.mediaType || 'none',
    mediaUrl: props.post.mediaUrl || '',
    attachmentName: props.post.attachmentName || '',
    album: props.post.album || '',
    pollOptions: (localPoll.value?.options || []).map(o => o.label),
  })
}
watch(editorSaved, (n) => {
  if (!n || n.id !== props.post.id) return
  editOverride.value = { title: n.title, body: n.body, bodyHtml: n.bodyHtml }
  localAllowComments.value = n.allowComments
  emit('changed')
})

// Encuesta (Fase 5): votar o cambiar el voto; el servidor devuelve
// los conteos actualizados y se refleja sin recargar.
const localPoll = ref<PollView | null>(props.post.poll ?? null)
watch(() => props.post.poll, p => { localPoll.value = p ?? null })
const voting = ref(false)
async function vote(optionId: number) {
  if (!user.value) { guestAccess.requestAccess(); return }
  if (voting.value || localPoll.value?.myOptionId === optionId) return
  voting.value = true
  try {
    const res = await api<{ poll: PollView }>(`/api/posts/${props.post.id}/poll-vote`, { method: 'POST', body: { optionId } })
    localPoll.value = res.poll
  }
  catch (e) {
    toast.add({ title: t('post.voteFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { voting.value = false }
}

// Fase 5: ocultar la publicación solo para mí (no es moderación).
const locallyHidden = ref(false)
async function hidePost() {
  try {
    await api(`/api/posts/${props.post.id}/hide`, { method: 'POST' })
    locallyHidden.value = true
    toast.add({ title: t('post.hiddenToast'), description: t('post.hiddenToastText'), color: 'success' })
    emit('changed')
  }
  catch { toast.add({ title: t('post.hideFailed'), color: 'error' }) }
}
// Fase 7 → 16-B: el menú «…» reúne TODAS las acciones de la
// publicación, con la composición de la referencia y todo funcional:
// siempre Guardar/Copiar enlace/Ver; del autor, Editar; del autor y
// del staff, comentarios on/off; del staff que modera, Fijar; Eliminar
// si corresponde; y en posts ajenos, Ocultar y Reportar (Fases 5/12).
// En un post anónimo el slug viene vacío: «es mío» lo dice la marca
// `mine` del serializador, no la comparación de slugs.
const isMine = computed(() => !!user.value && (!!props.post.author.mine || user.value.slug === props.post.author.slug))
const isModeratorStaff = computed(() => !!user.value && ['admin', 'moderator'].includes(user.value.role || ''))
const postMenuItems = computed(() => {
  const items: { label: string, icon: string, color?: 'error', onSelect: () => void }[] = []
  if (!user.value) return [items]
  items.push({ label: localBookmarked.value ? t('post.menuUnsave') : t('post.menuSave'), icon: localBookmarked.value ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark', onSelect: toggleBookmark })
  if (isModeratorStaff.value)
    items.push({ label: props.post.pinned ? t('post.menuUnpin') : t('post.menuPin'), icon: 'i-lucide-pin', onSelect: togglePin })
  if (isMine.value)
    items.push({ label: t('post.menuEdit'), icon: 'i-lucide-pencil', onSelect: startEdit })
  if (isMine.value || isModeratorStaff.value)
    items.push({ label: localAllowComments.value ? t('post.menuCommentsOff') : t('post.menuCommentsOn'), icon: localAllowComments.value ? 'i-lucide-message-circle-off' : 'i-lucide-message-circle', onSelect: toggleComments })
  items.push({ label: t('post.menuCopyLink'), icon: 'i-lucide-link', onSelect: copyLink })
  items.push({ label: t('post.menuView'), icon: 'i-lucide-external-link', onSelect: viewPost })
  if (!isMine.value) {
    items.push({ label: t('post.menuHide'), icon: 'i-lucide-eye-off', onSelect: hidePost })
    // Fase 12: reportar contenido ajeno (el servidor también lo valida).
    items.push({ label: t('post.menuReport'), icon: 'i-lucide-flag', onSelect: () => openReport({ type: 'post', id: props.post.id, label: displayTitle.value }) })
  }
  if (canDelete.value)
    items.push({ label: t('post.menuDelete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { confirmDelete.value = true } })
  return [items]
})

// Fase 14: el moderador también puede eliminar publicaciones ajenas.
const canDelete = computed(() => isModeratorStaff.value || isMine.value)
const confirmDelete = ref(false)
const deleting = ref(false)
async function deletePost() {
  deleting.value = true
  try {
    await api(`/api/posts/${props.post.id}`, { method: 'DELETE' })
    toast.add({ title: t('post.deletedToast'), color: 'success' })
    confirmDelete.value = false
    emit('deleted')
    emit('changed')
  }
  catch { toast.add({ title: t('post.deleteFailed'), color: 'error' }) }
  finally { deleting.value = false }
}
</script>

<template>
  <UCard v-if="!locallyHidden">
    <div class="flex items-start gap-3">
      <span class="relative shrink-0">
        <UAvatar v-if="post.author.anonymous && !post.author.mine" icon="i-lucide-venetian-mask" size="md" :ui="{ root: 'bg-elevated' }" />
        <UAvatar v-else :src="post.author.avatarUrl || undefined" :text="initials(post.author.name)" size="md" />
        <span v-if="post.author.online" class="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" :title="t('common.online')" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-start gap-2">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <!-- Post anónimo (Fase 8): sin enlace al perfil. El admin
                 ve además la autoría real, entre paréntesis. -->
            <span v-if="post.author.anonymous && !post.author.mine" class="font-semibold">{{ t('post.anonymous') }}</span>
            <NuxtLink v-else :to="`/profile/${post.author.slug}`" class="font-semibold hover:underline">
              {{ post.author.name }}
            </NuxtLink>
            <UBadge v-if="post.author.anonymous" color="neutral" variant="subtle" size="sm" icon="i-lucide-venetian-mask">
              {{ t('post.anonymous') }}
            </UBadge>
            <span v-if="post.author.realAuthor" class="text-xs text-muted">
              ({{ t('post.authorLabel') }}: <NuxtLink :to="`/profile/${post.author.realAuthor.slug}`" class="hover:underline">{{ post.author.realAuthor.name }}</NuxtLink>)
            </span>
            <UBadge v-if="post.author.role === 'admin' || post.author.realRole === 'admin'" color="primary" variant="solid" size="sm">
              {{ t('members.adminBadge') }}
            </UBadge>
            <span class="text-muted">{{ t('post.inChannel') }}</span>
            <NuxtLink :to="`/channels/${post.channel.slug}`" class="font-medium text-primary hover:underline">
              {{ post.channel.name }}
            </NuxtLink>
            <span class="text-muted">· {{ timeAgo(post.createdAt) }}</span>
            <span v-if="displayEdited" class="flex items-center gap-1 text-muted">
              · <UIcon name="i-lucide-pencil" class="text-xs" /> {{ t('post.edited') }}
            </span>
            <UBadge v-if="post.pinned" color="warning" variant="subtle" icon="i-lucide-pin">
              {{ t('post.pinned') }}
            </UBadge>
            <UBadge v-if="post.status === 'review'" color="warning" variant="subtle" icon="i-lucide-eye">
              {{ t('post.inReview') }}
            </UBadge>
            <UBadge v-if="post.kind === 'poll'" color="primary" variant="subtle" icon="i-lucide-bar-chart-3">
              {{ t('post.poll') }}
            </UBadge>
            <UBadge v-if="post.channel.type === 'paid'" color="neutral" variant="subtle" icon="i-lucide-crown">
              {{ t('post.premium') }}
            </UBadge>
          </div>
          <UButton
            size="sm" color="neutral" :variant="localBookmarked ? 'soft' : 'ghost'"
            :icon="localBookmarked ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
            :title="localBookmarked ? t('post.saved') : t('post.save')" class="shrink-0" @click="toggleBookmark"
          />
          <UDropdownMenu v-if="user && postMenuItems[0]?.length" :items="postMenuItems" class="shrink-0">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-more-horizontal" :title="t('post.moreActions')" />
          </UDropdownMenu>
        </div>

        <NuxtLink v-if="linkable !== false" :to="`/p/${post.channel.slug}/${post.slug}`" class="mt-1 block text-lg font-bold leading-snug hover:underline">
          {{ displayTitle }}
        </NuxtLink>
        <h1 v-else class="mt-1 text-2xl font-bold leading-snug">
          {{ displayTitle }}
        </h1>

        <div v-if="post.locked" class="mt-3 rounded-lg border border-dashed border-default p-4">
          <!-- Fase 15: con el anticipo en modo «solo título» no llega
               ni una línea del cuerpo: el párrafo no se pinta. -->
          <p v-if="post.teaser" class="text-sm text-muted">
            {{ post.teaser }}
          </p>
          <p v-if="post.mediaCount" class="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <UIcon name="i-lucide-paperclip" />
            {{ t(post.mediaCount === 1 ? 'post.attachmentsOne' : 'post.attachmentsMany', { count: post.mediaCount }) }}
          </p>
          <div class="mt-3 flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-lock" />
            {{ t('post.lockedText') }}
            <NuxtLink :to="`/channels/${post.channel.slug}`" class="text-primary hover:underline">
              {{ t('post.getAccess') }}
            </NuxtLink>
          </div>
        </div>
        <div v-else>
          <!-- Fase 8: con cuerpo rico se muestra el HTML (sanitizado
               en el servidor al guardar y al servir); sin él, el
               texto plano de siempre. -->
          <div v-if="displayBodyHtml" class="rich-content mt-2 text-[15px] leading-relaxed" v-html="displayBodyHtml" />
          <p v-else class="mt-2 whitespace-pre-line text-[15px] leading-relaxed">
            {{ displayBody }}
          </p>
          <div v-if="post.mediaType === 'video' && youtubeEmbed" class="mt-3 aspect-video overflow-hidden rounded-lg">
            <iframe :src="youtubeEmbed" class="h-full w-full" allowfullscreen :title="t('post.postVideoTitle')" />
          </div>
          <div v-else-if="post.mediaType === 'image' && post.mediaUrl" class="mt-3">
            <img :src="post.mediaUrl" :alt="t('post.postImageAlt')" class="max-h-96 w-full rounded-lg object-cover">
          </div>
          <div v-else-if="post.mediaType === 'video' && post.mediaUrl" class="mt-3 text-sm">
            <a :href="post.mediaUrl" target="_blank" rel="noopener" class="text-primary hover:underline">{{ t('post.viewVideo') }}</a>
          </div>
          <a
            v-else-if="post.mediaType === 'file' && post.mediaUrl" :href="post.mediaUrl" download
            class="mt-3 flex items-center gap-3 rounded-lg border border-default p-3 text-sm transition hover:bg-elevated"
          >
            <UIcon name="i-lucide-paperclip" class="shrink-0 text-lg text-muted" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ post.attachmentName || t('post.attachedFile') }}</span>
            <span class="flex shrink-0 items-center gap-1 text-primary"><UIcon name="i-lucide-download" /> {{ t('post.download') }}</span>
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
              {{ t(localPoll.totalVotes === 1 ? 'post.voteOne' : 'post.votesMany', { count: localPoll.totalVotes }) }}<span v-if="localPoll.myOptionId">{{ t('post.changeVoteHint') }}</span><span v-else-if="user">{{ t('post.voteHint') }}</span>
            </p>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-1 border-t border-default pt-3">
          <!-- Fase 16-G: resumen (top + total) y botón «Reaccionar»
               con la paleta de emojis; sin reacciones todavía solo
               se ve el botón. -->
          <ReactionSummary :top="localReactionTop" :total="localReactionTotal" class="mr-1" />
          <ReactionPicker :my-reaction="localMyReaction" @select="toggleReaction">
            <UButton
              size="sm"
              :color="localMyReaction ? 'primary' : 'neutral'"
              :variant="localMyReaction ? 'soft' : 'ghost'"
              :icon="localMyReaction ? undefined : 'i-lucide-smile-plus'"
              :label="localMyReaction ? `${localMyReaction} ${t('comments.react')}` : t('comments.react')"
              :title="t('comments.react')"
            />
          </ReactionPicker>
          <!-- En un post bloqueado el botón sigue llevando al
               detalle (pantalla de acceso); en el resto EXPANDE la
               sección dentro de la tarjeta. -->
          <UButton v-if="localAllowComments && !user" size="sm" color="neutral" variant="ghost" icon="i-lucide-message-circle" :label="t('post.commentsCount', { count: displayCommentCount })" class="ml-1" @click="guestAccess.requestAccess()" />
          <NuxtLink v-else-if="localAllowComments && post.locked" :to="`/p/${post.channel.slug}/${post.slug}`" class="ml-1">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-message-circle" :label="t('post.commentsCount', { count: displayCommentCount })" />
          </NuxtLink>
          <a v-else-if="localAllowComments && inlineComments === false" href="#post-comments" class="ml-1">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-message-circle" :label="t('post.commentsCount', { count: displayCommentCount })" />
          </a>
          <UButton
            v-else-if="localAllowComments"
            size="sm" color="neutral" :variant="commentsOpen ? 'soft' : 'ghost'" icon="i-lucide-message-circle"
            :label="t('post.commentsCount', { count: displayCommentCount })" class="ml-1"
            @click="commentsOpen = !commentsOpen"
          />
          <span v-else class="ml-1 flex items-center gap-1.5 px-2 text-sm text-muted" :title="t('post.commentsOffHint')">
            <UIcon name="i-lucide-lock" /> {{ t('post.commentsOff') }}
          </span>
        </div>

        <PostComments
          v-if="commentsOpen && localAllowComments && inlineComments !== false"
          :post-id="post.id"
          :allow-comments="localAllowComments"
          :can-interact="post.canInteract !== false"
          :channel-slug="post.channel.slug"
          class="mt-4"
        />

        <UModal v-model:open="confirmDelete" :title="t('post.deleteTitle')" :description="t('post.deleteText')">
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="confirmDelete = false" />
              <UButton color="error" :label="t('post.deleteConfirm')" icon="i-lucide-trash-2" :loading="deleting" @click="deletePost" />
            </div>
          </template>
        </UModal>

      </div>
    </div>
  </UCard>
</template>
