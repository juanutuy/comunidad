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
  // Fase 15: leer no es participar (anticipo completo) y conteo de
  // adjuntos sin entregar el archivo (null = ni el conteo sale).
  canInteract?: boolean
  mediaCount?: number | null
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
  localMine.value = [...p.myReactions]
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

// Fase 16-B: activar/desactivar comentarios desde el menú (autor o
// staff). Es la misma allow_comments que respeta la API de
// comentarios; el estado local se actualiza al instante y el padre
// refresca con @changed.
async function toggleComments() {
  try {
    const res = await api<{ allowComments: boolean }>(`/api/posts/${props.post.id}/comments-toggle`, { method: 'POST' })
    localAllowComments.value = res.allowComments
    toast.add({ title: res.allowComments ? 'Comentarios activados' : 'Comentarios desactivados', color: 'success' })
    emit('changed')
  }
  catch { toast.add({ title: 'No se pudo cambiar el estado de los comentarios', color: 'error' }) }
}

// Fase 16-B: copiar el enlace REAL del detalle (origen actual + ruta
// canónica /p/<canal>/<post>). Sin clipboard API se cae a la selección
// manual con prompt, pero el valor copiado/ofrecido es siempre el real.
async function copyLink() {
  const url = `${window.location.origin}/p/${props.post.channel.slug}/${props.post.slug}`
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: 'Enlace copiado', description: url, color: 'success' })
  }
  catch {
    window.prompt('Copiá el enlace de la publicación:', url)
  }
}

function viewPost() {
  navigateTo(`/p/${props.post.channel.slug}/${props.post.slug}`)
}

// Fase 16-B: editar la publicación DESDE la tarjeta (el mismo editor
// rico con «/» de «Mis borradores» y el mismo PUT del servidor, que
// sanitiza y marca «Editado»). Las encuestas editan su pregunta como
// texto, igual que en borradores.
const editing = ref(false)
const editForm = reactive({ title: '', body: '', bodyHtml: '' })
const savingEdit = ref(false)
async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('kind', 'image')
  const up = await api<{ url: string }>('/api/uploads', { method: 'POST', body: fd })
  return up.url
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function editPlainText(): string {
  if (!editForm.bodyHtml) return editForm.body.trim()
  const d = document.createElement('div')
  d.innerHTML = editForm.bodyHtml
  return (d.textContent || '').trim()
}
function startEdit() {
  editForm.title = displayTitle.value
  editForm.body = displayBody.value
  // Sin cuerpo rico guardado (posts de texto plano), el editor arranca
  // desde el texto convertido a párrafos.
  editForm.bodyHtml = displayBodyHtml.value
    || (displayBody.value ? displayBody.value.split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('') : '')
  editing.value = true
}
async function saveEdit() {
  savingEdit.value = true
  try {
    const isPoll = props.post.kind === 'poll'
    const body: Record<string, unknown> = isPoll
      ? { title: editForm.title, body: editForm.body }
      : { title: editForm.title, bodyHtml: editForm.bodyHtml }
    await api(`/api/posts/${props.post.id}`, { method: 'PUT', body })
    editOverride.value = isPoll
      ? { title: editForm.title, body: editForm.body, bodyHtml: '' }
      : { title: editForm.title, body: editPlainText(), bodyHtml: editForm.bodyHtml }
    toast.add({ title: 'Publicación actualizada', color: 'success' })
    editing.value = false
    emit('changed')
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { savingEdit.value = false }
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
  items.push({ label: localBookmarked.value ? 'Quitar de guardados' : 'Guardar publicación', icon: localBookmarked.value ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark', onSelect: toggleBookmark })
  if (isModeratorStaff.value)
    items.push({ label: props.post.pinned ? 'Desfijar publicación' : 'Fijar publicación', icon: 'i-lucide-pin', onSelect: togglePin })
  if (isMine.value)
    items.push({ label: 'Editar publicación', icon: 'i-lucide-pencil', onSelect: startEdit })
  if (isMine.value || isModeratorStaff.value)
    items.push({ label: localAllowComments.value ? 'Desactivar comentarios' : 'Activar comentarios', icon: localAllowComments.value ? 'i-lucide-message-circle-off' : 'i-lucide-message-circle', onSelect: toggleComments })
  items.push({ label: 'Copiar enlace', icon: 'i-lucide-link', onSelect: copyLink })
  items.push({ label: 'Ver publicación', icon: 'i-lucide-external-link', onSelect: viewPost })
  if (!isMine.value) {
    items.push({ label: 'Ocultar publicación', icon: 'i-lucide-eye-off', onSelect: hidePost })
    // Fase 12: reportar contenido ajeno (el servidor también lo valida).
    items.push({ label: 'Reportar', icon: 'i-lucide-flag', onSelect: () => openReport({ type: 'post', id: props.post.id, label: displayTitle.value }) })
  }
  if (canDelete.value)
    items.push({ label: 'Eliminar publicación', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { confirmDelete.value = true } })
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
            <span v-if="displayEdited" class="flex items-center gap-1 text-muted">
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
            {{ post.mediaCount }} archivo{{ post.mediaCount === 1 ? '' : 's' }} adjunto{{ post.mediaCount === 1 ? '' : 's' }} en la publicación completa
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
          <div v-if="displayBodyHtml" class="rich-content mt-2 text-[15px] leading-relaxed" v-html="displayBodyHtml" />
          <p v-else class="mt-2 whitespace-pre-line text-[15px] leading-relaxed">
            {{ displayBody }}
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
          <NuxtLink v-if="localAllowComments" :to="`/p/${post.channel.slug}/${post.slug}`" class="ml-1">
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

        <!-- Fase 16-B: editar la publicación desde la tarjeta, con el
             mismo editor rico de «Mis borradores». -->
        <UModal v-model:open="editing" title="Editar publicación">
          <template #body>
            <div class="space-y-3">
              <UFormField label="Título">
                <UInput v-model="editForm.title" class="w-full" />
              </UFormField>
              <UFormField v-if="post.kind === 'poll'" label="Pregunta">
                <UTextarea v-model="editForm.body" :rows="5" class="w-full" />
              </UFormField>
              <UFormField v-else label="Contenido">
                <ClientOnly>
                  <RichEditor v-model="editForm.bodyHtml" mode="slash" :upload-image="uploadImageFile" placeholder="Escribí «/» para insertar bloques…" />
                </ClientOnly>
              </UFormField>
              <p v-if="post.kind === 'poll'" class="text-xs text-muted">Las opciones de la encuesta no se editan desde acá: borrá la publicación y creala de nuevo si necesitás cambiarlas.</p>
            </div>
          </template>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" label="Cancelar" @click="editing = false" />
              <UButton label="Guardar cambios" icon="i-lucide-save" :loading="savingEdit" :disabled="post.kind === 'poll' ? !editForm.body.trim() || !editForm.title.trim() : !editForm.title.trim() || !editPlainText()" @click="saveEdit" />
            </div>
          </template>
        </UModal>
      </div>
    </div>
  </UCard>
</template>
