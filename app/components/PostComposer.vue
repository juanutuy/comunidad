<script setup lang="ts">
// Compositor del feed (Fases 7/8/10): barra compacta que abre el
// editor en modal, y variante «bare» (solo el modal) para la barra
// inferior móvil. Desde la Fase 8 el modal es un editor rico estilo
// la referencia: título como placeholder grande dentro del área,
// toggles-icono arriba a la derecha (anuncio, anónimo, comentarios),
// barra inferior de solo iconos y botón Publicar con chevron
// (Programar / Guardar borrador). El cuerpo se edita con RichEditor
// en modo «slash» y se envía como HTML: el servidor lo sanitiza y
// deriva el texto plano (ver server/utils/sanitize.ts).
// Fase 16-C: ESTE es el único editor de publicaciones del proyecto,
// para crear Y para editar. En modo «edit» el mismo modal precarga
// el post (canal fijo en la cabecera, adjunto y encuesta visibles) y
// guarda con «Actualizar» vía el mismo PUT de siempre. La instancia
// anfitriona (prop editorHost, montada en el layout de miembro)
// recibe los pedidos de edición de las tarjetas y de «Mis
// borradores» a través de usePostEditor: imposible desincronizar
// crear y editar porque son la misma pieza.
const props = withDefaults(defineProps<{ channelSlug?: string, variant?: 'bar' | 'bare', editorHost?: boolean }>(), { variant: 'bar', editorHost: false })
const emit = defineEmits<{ published: [], updated: [] }>()
const { target: editTarget, consumeTarget, notifySaved } = usePostEditor()

const { user, gates } = useAuth()
const { t, locale } = useI18n()
const { initials } = useFormat()
// Fase 14: compuerta «Crear publicaciones» — si el servidor dice que
// este miembro todavía no alcanza el nivel, el compositor se
// reemplaza por el aviso (la API también devuelve 403: esto es la
// explicación anticipada, no la única barrera).
const createGate = computed(() => gates.value?.createPost?.blocked ? gates.value.createPost : null)
const api = useApi()
const toast = useToast()

const { data: channelData } = await useAsyncData('composer-channels', () =>
  api<{ groups: { channels: { slug: string, name: string, type: string, hasAccess: boolean, postPermission?: string }[] }[] }>('/api/channels'))
// Fase 16: «quién puede publicar» — en un canal de «solo el equipo»
// los miembros no publican (la API también devuelve 403). Esos
// canales salen de la lista publicable para los miembros; y si el
// compositor está DENTRO de ese canal, se reemplaza por el aviso.
const isStaffUser = computed(() => ['admin', 'moderator', 'course_manager'].includes(user.value?.role || ''))
const publishable = computed(() =>
  (channelData.value?.groups || []).flatMap(g => g.channels)
    .filter(c => c.type === 'free' || c.hasAccess)
    .filter(c => c.postPermission !== 'staff' || isStaffUser.value))
const staffOnlyChannel = computed(() => {
  if (!props.channelSlug || isStaffUser.value) return null
  const all = (channelData.value?.groups || []).flatMap(g => g.channels)
  const ch = all.find(c => c.slug === props.channelSlug)
  return ch && ch.postPermission === 'staff' ? ch : null
})

const open = ref(false)
const isPhone = useIsPhone()
const maximized = ref(false)
// Fase 16-C: modo del modal. En «edit», editId/editStatus identifican
// el post cargado y la cabecera muestra su canal fijo (no se mueve
// un post de canal, como en la referencia).
const mode = ref<'create' | 'edit'>('create')
const editId = ref<number | null>(null)
const editStatus = ref('')
const editChannelName = ref('')
const editPollLabels = ref<string[]>([])
const originalPinned = ref(false)
const channelSlug = ref('')
const title = ref('')
const bodyHtml = ref('')
const kind = ref<'post' | 'poll'>('post')
const pollOptions = ref<string[]>(['', ''])
const allowComments = ref(true)
const asAnnouncement = ref(false)
const anonymous = ref(false)
const scheduleMode = ref(false)
const scheduledAt = ref('')
const publishing = ref(false)
// Adjunto principal del post (el que la tarjeta muestra bajo el
// cuerpo). Al crear solo se produce «file» (el botón de clip); en
// edición se precarga el que el post ya tenga (imagen/video/archivo)
// y se puede quitar o reemplazar por un archivo.
const attachedMedia = ref<{ type: 'image' | 'video' | 'file', url: string, name: string } | null>(null)
const videoUrl = ref('')
const gifUrl = ref('')
const videoPopOpen = ref(false)
const gifPopOpen = ref(false)
const emojiPopOpen = ref(false)
const confirmDiscard = ref(false)
const openedSnapshot = ref('')
const editorRef = ref<{ focus: () => void, pickImage: () => void, insertImage: (u: string) => void, insertAudio: (u: string) => void, insertVideo: (u: string) => boolean, insertText: (t: string) => void, insertCodeBlock: () => void, insertSlash: () => void } | null>(null)

const EMOJIS = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😅', '😉', '🙂', '🙃', '😴', '😮', '😢', '😭', '😡', '🥳', '🤯', '👍', '👎', '👏', '🙌', '🙏', '💪', '🔥', '❤️', '💡', '🎉', '🎂', '🎁', '⚽', '🎵', '📚', '💻', '☕', '🍕', '🌮', '🐶', '🐱', '🌎', '⭐', '✅', '❌', '❓', '💯']

const currentChannel = computed(() => publishable.value.find(c => c.slug === channelSlug.value))
const channelMenuItems = computed(() => [publishable.value.map(c => ({
  label: `# ${c.name}`,
  onSelect: () => { channelSlug.value = c.slug },
}))])

function htmlText(html: string): string {
  if (import.meta.server || !html) return ''
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent || '').trim()
}
const bodyText = computed(() => htmlText(bodyHtml.value))
const validOptions = computed(() => pollOptions.value.map(o => o.trim()).filter(Boolean))
const canSubmit = computed(() => {
  if (!bodyText.value) return false
  if (kind.value === 'poll') return validOptions.value.length >= 2
  return !!title.value.trim()
})
const snapshot = computed(() => JSON.stringify({
  t: title.value, h: bodyHtml.value, k: kind.value, o: pollOptions.value,
  a: anonymous.value, c: allowComments.value,
  f: attachedMedia.value ? `${attachedMedia.value.type}:${attachedMedia.value.url}` : '',
  s: scheduledAt.value, p: asAnnouncement.value,
}))
// Fase 16-C: guardar la edición exige contenido (la pregunta, si es
// encuesta) y título en los posts comunes — las mismas reglas que
// valida el PUT en el servidor.
const canSubmitEdit = computed(() => {
  if (!bodyText.value) return false
  if (kind.value === 'poll') return true
  return !!title.value.trim()
})
const isDirty = computed(() => open.value && snapshot.value !== openedSnapshot.value)

function addPollOption() { if (pollOptions.value.length < 4) pollOptions.value.push('') }
function removePollOption(i: number) { if (pollOptions.value.length > 2) pollOptions.value.splice(i, 1) }

async function upload(kind: 'image' | 'audio' | 'file', file: File): Promise<{ url: string, name: string }> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('kind', kind)
  return await api<{ url: string, name: string }>('/api/uploads', { method: 'POST', body: fd })
}
async function uploadImage(file: File): Promise<string> {
  return (await upload('image', file)).url
}

function onInlineImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  upload('image', file).then(({ url }) => editorRef.value?.insertImage(url))
    .catch(err => toast.add({ title: t('composer.imageUploadFailed'), description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' }))
}
function onAudio(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  upload('audio', file).then(({ url }) => editorRef.value?.insertAudio(url))
    .catch(err => toast.add({ title: t('composer.audioUploadFailed'), description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' }))
}
function onAttachFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  upload('file', file).then(({ url, name }) => { attachedMedia.value = { type: 'file', url, name } })
    .catch(err => toast.add({ title: t('composer.fileUploadFailed'), description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' }))
}
function insertVideo() {
  if (!videoUrl.value.trim()) return
  if (editorRef.value?.insertVideo(videoUrl.value)) { videoUrl.value = ''; videoPopOpen.value = false }
  else toast.add({ title: t('composer.videoNotRecognized'), description: t('composer.videoNotRecognizedText'), color: 'warning' })
}
function insertGif() {
  if (!gifUrl.value.trim()) return
  editorRef.value?.insertImage(gifUrl.value.trim())
  gifUrl.value = ''
  gifPopOpen.value = false
}
function insertEmoji(e: string) {
  editorRef.value?.insertText(e)
  emojiPopOpen.value = false
}

const pendingPreset = ref<'photo' | 'video' | 'poll' | null>(null)
function openModal(preset?: 'photo' | 'video' | 'poll') {
  if (!user.value) { toast.add({ title: t('composer.loginToPost'), color: 'warning' }); return }
  // Fase 16: dentro de un canal de «solo el equipo», un miembro no
  // abre el editor: el aviso (en la variante de barra es la alerta
  // fija; en la «bare» va como toast).
  if (staffOnlyChannel.value) {
    toast.add({ title: t('composer.staffOnlyTitle'), description: t('composer.staffOnlyToastText'), color: 'warning' })
    return
  }
  // Fase 14: con la compuerta de publicación activa para este
  // miembro, el modal ni se abre: el aviso va como toast (la variante
  // de barra además pinta la alerta fija en el lugar del compositor).
  if (createGate.value) {
    toast.add({
      title: t('composer.gateToastTitle', { level: createGate.value.levelName ?? '' }),
      description: t('composer.gateToastText', { mine: createGate.value.myPoints ?? 0, needed: createGate.value.neededPoints ?? 0 }),
      color: 'warning',
    })
    return
  }
  if (!channelSlug.value || !publishable.value.some(c => c.slug === channelSlug.value)) {
    channelSlug.value = props.channelSlug && publishable.value.some(c => c.slug === props.channelSlug)
      ? props.channelSlug
      : (publishable.value[0]?.slug || '')
  }
  kind.value = preset === 'poll' ? 'poll' : 'post'
  pendingPreset.value = preset || null
  open.value = true
  openedSnapshot.value = snapshot.value
  setTimeout(() => {
    editorRef.value?.focus()
    if (pendingPreset.value === 'photo') editorRef.value?.pickImage()
    if (pendingPreset.value === 'video') videoPopOpen.value = true
  }, 400)
}

function resetForm() {
  title.value = ''; bodyHtml.value = ''
  pollOptions.value = ['', '']
  kind.value = 'post'
  allowComments.value = true
  asAnnouncement.value = false
  anonymous.value = false
  scheduleMode.value = false
  scheduledAt.value = ''
  attachedMedia.value = null
  maximized.value = false
  // Fase 16-C: al cerrar, el modal vuelve a modo crear limpio.
  mode.value = 'create'
  editId.value = null
  editStatus.value = ''
  editChannelName.value = ''
  editPollLabels.value = []
  originalPinned.value = false
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Fase 16-C: abrir el MISMO modal en modo edición, precargado con el
// post. Lo invocan la instancia anfitriona (desde usePostEditor) —
// las tarjetas y «Mis borradores» no tienen editor propio.
function openEdit(p: EditablePost) {
  mode.value = 'edit'
  editId.value = p.id
  editStatus.value = p.status
  editChannelName.value = p.channelName
  channelSlug.value = p.channelSlug
  title.value = p.title
  // Sin cuerpo rico guardado (posts de texto plano), el editor
  // arranca desde el texto convertido a párrafos.
  bodyHtml.value = p.bodyHtml
    || (p.body ? p.body.split(/\n{2,}/).map(par => `<p>${escapeHtml(par).replace(/\n/g, '<br>')}</p>`).join('') : '')
  kind.value = p.kind === 'poll' ? 'poll' : 'post'
  editPollLabels.value = p.pollOptions || []
  allowComments.value = p.allowComments !== false
  // El anónimo se refleja tal cual quedó al crear: no se convierte
  // después (regla de la Fase 8, el PUT ni lo acepta).
  anonymous.value = !!p.anonymous
  asAnnouncement.value = !!p.pinned
  originalPinned.value = !!p.pinned
  attachedMedia.value = p.mediaType && p.mediaType !== 'none' && p.mediaUrl
    ? { type: p.mediaType as 'image' | 'video' | 'file', url: p.mediaUrl, name: p.attachmentName || '' }
    : null
  scheduleMode.value = false
  scheduledAt.value = p.status === 'scheduled' && p.scheduledAt ? p.scheduledAt.slice(0, 16) : ''
  maximized.value = false
  open.value = true
  openedSnapshot.value = snapshot.value
  setTimeout(() => editorRef.value?.focus(), 400)
}

// Solo la instancia anfitriona (layout) responde a los pedidos de
// edición compartidos: las demás instancias (feed, barra móvil)
// siguen siendo de solo crear y no abren nada.
if (props.editorHost) {
  watch(editTarget, (t) => {
    if (!t) return
    const p = consumeTarget()
    if (p) openEdit(p)
  })
}

function requestClose() {
  if (publishing.value) return
  if (isDirty.value) { confirmDiscard.value = true; return }
  open.value = false
  resetForm()
}
function discard() {
  confirmDiscard.value = false
  open.value = false
  resetForm()
}

async function submit(mode: 'now' | 'draft' | 'schedule') {
  if (mode === 'schedule' && !scheduledAt.value) {
    toast.add({ title: t('composer.scheduleNeedsDate'), color: 'warning' })
    return
  }
  if (mode !== 'draft' && !canSubmit.value) return
  if (mode === 'draft' && !bodyText.value && !title.value.trim()) {
    toast.add({ title: t('composer.draftNeedsContent'), color: 'warning' })
    return
  }
  publishing.value = true
  try {
    const payload: Record<string, unknown> = {
      channelSlug: channelSlug.value,
      title: title.value,
      bodyHtml: bodyHtml.value,
      kind: kind.value,
      status: mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'published',
      allowComments: allowComments.value,
      pin: asAnnouncement.value,
      anonymous: anonymous.value,
    }
    if (kind.value === 'poll') payload.options = validOptions.value
    if (mode === 'schedule') payload.scheduledAt = new Date(scheduledAt.value).toISOString()
    if (attachedMedia.value) {
      payload.mediaType = attachedMedia.value.type
      payload.mediaUrl = attachedMedia.value.url
      payload.attachmentName = attachedMedia.value.type === 'file' ? attachedMedia.value.name : ''
    }
    const created = await api<{ status?: string }>('/api/posts', { method: 'POST', body: payload })
    if (mode === 'draft') toast.add({ title: t('composer.draftSaved'), description: t('composer.draftSavedText'), color: 'success' })
    else if (mode === 'schedule') toast.add({ title: t('composer.scheduledToast'), description: t('composer.scheduledToastText', { date: new Date(scheduledAt.value).toLocaleString(locale.value === 'en' ? 'en-US' : 'es', { dateStyle: 'medium', timeStyle: 'short' }) }), color: 'success' })
    // Fase 12: con la revisión previa encendida, el servidor devuelve
    // status 'review': el post no se publica todavía.
    else if (created.status === 'review') toast.add({ title: t('composer.reviewToast'), description: t('composer.reviewToastText'), color: 'success' })
    else toast.add({ title: t('composer.createdToast'), color: 'success' })
    confirmDiscard.value = false
    open.value = false
    resetForm()
    emit('published')
    if (props.variant === 'bare') await refreshNuxtData()
  }
  catch (e) {
    toast.add({ title: t('composer.saveFailed'), description: (e as { data?: { message?: string } }).data?.message || (e as Error).message || t('composer.retryText'), color: 'error' })
  }
  finally { publishing.value = false }
}

// Fase 16-C: guardar en modo edición — el mismo PUT de siempre
// (sanitiza, deriva el texto plano y marca «Editado»), ahora con el
// estado de comentarios y el adjunto principal incluidos: guardar
// sin tocarlos los conserva tal cual. El fijado (admin, solo en
// publicadas) se aplica con el mismo endpoint del menú de la
// tarjeta si cambió. Al terminar se avisa por usePostEditor para que
// la tarjeta y las listas reflejen lo nuevo sin recargar.
async function submitEdit() {
  if (!editId.value || !canSubmitEdit.value) return
  if (editStatus.value === 'scheduled' && !scheduledAt.value) {
    toast.add({ title: t('composer.scheduleNeedsDate'), color: 'warning' })
    return
  }
  publishing.value = true
  try {
    const payload: Record<string, unknown> = {
      title: title.value,
      bodyHtml: bodyHtml.value,
      allowComments: allowComments.value,
      mediaType: attachedMedia.value?.type || 'none',
      mediaUrl: attachedMedia.value?.url || '',
      attachmentName: attachedMedia.value?.type === 'file' ? attachedMedia.value.name : '',
    }
    if (editStatus.value === 'scheduled') payload.scheduledAt = new Date(scheduledAt.value).toISOString()
    const id = editId.value
    await api(`/api/posts/${id}`, { method: 'PUT', body: payload })
    if (user.value?.role === 'admin' && editStatus.value === 'published' && asAnnouncement.value !== originalPinned.value)
      await api(`/api/posts/${id}/pin`, { method: 'POST' })
    notifySaved({ id, title: title.value, body: htmlText(bodyHtml.value), bodyHtml: bodyHtml.value, allowComments: allowComments.value })
    toast.add({ title: t('composer.updatedToast'), color: 'success' })
    confirmDiscard.value = false
    open.value = false
    resetForm()
    emit('updated')
    if (props.variant === 'bare') await refreshNuxtData()
  }
  catch (e) {
    toast.add({ title: t('composer.saveFailed'), description: (e as { data?: { message?: string } }).data?.message || (e as Error).message || t('composer.retryText'), color: 'error' })
  }
  finally { publishing.value = false }
}

const chevronItems = computed(() => [
  [{
    label: scheduleMode.value ? t('composer.unscheduleOption') : t('composer.scheduleOption'),
    icon: 'i-lucide-calendar-clock',
    onSelect: () => { scheduleMode.value = !scheduleMode.value },
  },
  {
    label: t('composer.saveDraft'),
    icon: 'i-lucide-save',
    onSelect: () => submit('draft'),
  }],
])
</script>

<template>
  <!-- Fase 14: en la variante de barra, la compuerta reemplaza al
       compositor por el aviso. En la variante «bare» (barra inferior
       móvil) el disparador sigue existiendo y openModal avisa con
       un toast: no se pinta una alerta dentro de la barra fija. -->
  <UAlert
    v-if="user && createGate && variant === 'bar'" color="warning" variant="soft" icon="i-lucide-lock"
    :title="t('composer.gateTitle', { level: createGate.levelName ?? '' })"
    :description="t('composer.gateText', { mine: createGate.myPoints ?? 0, needed: createGate.neededPoints ?? 0 })"
  />
  <!-- Fase 16: canal de «solo el equipo» — el compositor se
       reemplaza por el aviso para los miembros sin permiso. -->
  <UAlert
    v-else-if="user && staffOnlyChannel && variant === 'bar'" color="neutral" variant="soft" icon="i-lucide-lock"
    :title="t('composer.staffOnlyTitle')"
    :description="t('composer.staffOnlyText')"
  />
  <div v-else-if="user" :class="variant === 'bare' ? 'contents' : undefined">
    <!-- Disparador externo (variante «bare», Fase 10): la barra
         inferior móvil pone su propio botón y solo usa el modal. -->
    <slot v-if="variant === 'bare'" name="trigger" :open-modal="openModal" />
    <!-- Barra compacta -->
    <UCard v-if="variant === 'bar'" :ui="{ body: 'p-0 sm:p-0' }">
      <div class="flex items-center gap-3 px-4 pt-4">
        <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.name)" size="md" />
        <button type="button" class="min-w-0 flex-1 rounded-full bg-elevated px-4 py-2.5 text-left text-sm text-muted transition hover:bg-accented" @click="openModal()">
          {{ t('composer.writeSomething') }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-1 px-4 py-3">
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-image" :label="t('composer.photo')" @click="openModal('photo')" />
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-video" :label="t('composer.video')" @click="openModal('video')" />
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-bar-chart-3" :label="t('composer.poll')" @click="openModal('poll')" />
        <span class="flex-1" />
        <UButton :label="t('composer.publish')" icon="i-lucide-send" size="sm" @click="openModal()" />
      </div>
    </UCard>

    <!-- Editor en modal: pantalla completa en teléfono o al maximizar -->
    <UModal
      v-model:open="open" :close="false" :dismissible="false" :fullscreen="maximized || isPhone"
      :ui="{ content: maximized || isPhone ? '' : 'sm:max-w-3xl' }"
    >
      <template #header>
        <div class="flex w-full items-start gap-3">
          <UAvatar v-if="anonymous" icon="i-lucide-venetian-mask" size="lg" :ui="{ root: 'bg-elevated' }" />
          <UAvatar v-else :src="user.avatarUrl || undefined" :text="initials(user.name)" size="lg" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ anonymous ? t('composer.anonymousName') : user.name }}</p>
            <div class="flex items-center gap-1 text-sm text-muted">
              <span>{{ t('composer.publishingIn') }}</span>
              <!-- Fase 16-C: al crear se elige el canal; al editar el
                   canal es FIJO (un post no se muda de canal, como en
                   la referencia) y se muestra como texto. -->
              <UDropdownMenu v-if="mode === 'create'" :items="channelMenuItems">
                <UButton color="neutral" variant="link" size="sm" class="px-1 font-semibold text-primary" :label="`# ${currentChannel?.name || '…'}`" trailing-icon="i-lucide-chevron-down" />
              </UDropdownMenu>
              <span v-else class="px-1 font-semibold text-primary"># {{ editChannelName }}</span>
            </div>
          </div>
          <!-- Toggles-icono como en la referencia -->
          <div class="flex shrink-0 items-center gap-1">
            <UButton
              v-if="user.role === 'admin' && (mode === 'create' || editStatus === 'published')" size="sm" :color="asAnnouncement ? 'primary' : 'neutral'"
              :variant="asAnnouncement ? 'soft' : 'ghost'" icon="i-lucide-megaphone"
              :title="mode === 'edit' ? t('composer.announcementEditTitle') : t('composer.announcementTitle')" @click="asAnnouncement = !asAnnouncement"
            />
            <UButton
              size="sm" :color="anonymous ? 'primary' : 'neutral'" :variant="anonymous ? 'soft' : 'ghost'"
              icon="i-lucide-venetian-mask" :disabled="mode === 'edit'"
              :title="mode === 'edit' ? t('composer.anonymousEditTitle') : t('composer.anonymousTitle')"
              @click="anonymous = !anonymous"
            />
            <UButton
              size="sm" :color="allowComments ? 'primary' : 'neutral'" :variant="allowComments ? 'soft' : 'ghost'"
              :icon="allowComments ? 'i-lucide-message-circle' : 'i-lucide-message-circle-off'"
              :title="allowComments ? t('composer.commentsOnTitle') : t('composer.commentsOffTitle')" @click="allowComments = !allowComments"
            />
            <UButton
              v-if="!isPhone" size="sm" color="neutral" variant="ghost"
              :icon="maximized ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
              :title="maximized ? t('composer.minimize') : t('composer.maximize')" @click="maximized = !maximized"
            />
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" :title="t('common.close')" @click="requestClose" />
          </div>
        </div>
      </template>
      <template #body>
        <div class="space-y-3">
          <input
            v-model="title" type="text" maxlength="160"
            :placeholder="kind === 'poll' ? t('composer.pollTitlePlaceholder') : t('composer.titlePlaceholder')"
            class="w-full bg-transparent text-xl font-bold outline-none placeholder:text-dimmed"
          >
          <ClientOnly>
            <RichEditor
              ref="editorRef" v-model="bodyHtml" mode="slash" :upload-image="uploadImage"
              :placeholder="kind === 'poll' ? t('composer.pollQuestionPlaceholder') : t('composer.bodyPlaceholder')"
            />
          </ClientOnly>

          <!-- Panel de encuesta integrado al editor -->
          <div v-if="kind === 'poll'" class="space-y-2 rounded-lg border border-default p-3">
            <p class="flex items-center gap-2 text-sm font-semibold"><UIcon name="i-lucide-bar-chart-3" /> {{ t('composer.pollOptionsTitle') }}</p>
            <!-- Fase 16-C: en edición las opciones son SOLO LECTURA
                 (regla del producto, la misma de siempre: con votos
                 serían datos falsos y sin votos tampoco se reescribe
                 una encuesta ya creada). La pregunta SÍ se edita: es
                 el texto del editor. -->
            <template v-if="mode === 'edit'">
              <ul class="list-inside list-disc space-y-1 text-sm text-muted">
                <li v-for="label in editPollLabels" :key="label">{{ label }}</li>
              </ul>
              <p class="text-xs text-muted">{{ t('composer.pollOptionsLockedNote') }}</p>
            </template>
            <template v-else>
              <div v-for="(_, i) in pollOptions" :key="i" class="flex items-center gap-2">
                <UInput v-model="pollOptions[i]" :placeholder="t('composer.optionPlaceholder', { n: i + 1 })" class="flex-1" maxlength="80" />
                <UButton v-if="pollOptions.length > 2" size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="removePollOption(i)" />
              </div>
              <UButton v-if="pollOptions.length < 4" size="sm" color="neutral" variant="soft" icon="i-lucide-plus" :label="t('composer.addOption')" @click="addPollOption" />
              <p class="text-xs text-muted">{{ t('composer.pollNote') }}</p>
            </template>
          </div>

          <!-- Adjunto principal: la misma fila en crear y en editar.
               Al crear solo llega un archivo (botón de clip); en
               edición se precarga el del post (imagen, video o
               archivo) y quitarlo o reemplazarlo se guarda con el
               resto de la edición. -->
          <div v-if="attachedMedia" class="flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm">
            <img v-if="attachedMedia.type === 'image'" :src="attachedMedia.url" :alt="t('composer.attachedImage')" class="h-8 w-8 shrink-0 rounded object-cover">
            <UIcon v-else :name="attachedMedia.type === 'video' ? 'i-lucide-video' : 'i-lucide-paperclip'" class="shrink-0 text-muted" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ attachedMedia.type === 'file' ? attachedMedia.name : attachedMedia.type === 'image' ? t('composer.attachedImage') : t('composer.attachedVideo') }}</span>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :title="t('composer.removeAttachment')" @click="attachedMedia = null" />
          </div>

          <div v-if="scheduleMode || (mode === 'edit' && editStatus === 'scheduled')" class="flex flex-wrap items-center gap-2 rounded-lg bg-elevated p-3">
            <UIcon name="i-lucide-calendar-clock" />
            <span class="text-sm font-medium">{{ t('composer.publishOn') }}</span>
            <UInput v-model="scheduledAt" type="datetime-local" />
          </div>
          <p v-if="mode === 'create'" class="text-xs text-muted">
            {{ t('composer.draftsNoteBefore') }}<NuxtLink to="/drafts" class="text-primary hover:underline" @click="open = false">{{ t('composer.draftsNoteLink') }}</NuxtLink>.
          </p>
        </div>
      </template>
      <template #footer>
        <!-- Barra inferior de solo iconos, como la referencia -->
        <div class="flex w-full items-center gap-0.5">
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" :title="t('composer.insertBlock')" @click="editorRef?.insertSlash()" />
          <label class="inline-flex cursor-pointer rounded-md p-2 text-muted transition hover:bg-elevated hover:text-default" :title="t('composer.insertImage')">
            <UIcon name="i-lucide-image" class="text-lg" />
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="onInlineImage">
          </label>
          <UPopover v-model:open="videoPopOpen">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-video" :title="t('composer.embedVideo')" />
            <template #content>
              <div class="flex w-80 items-center gap-2 p-3">
                <UInput v-model="videoUrl" :placeholder="t('composer.videoPlaceholder')" class="flex-1" size="sm" @keyup.enter="insertVideo" />
                <UButton size="sm" :label="t('common.insert')" @click="insertVideo" />
              </div>
            </template>
          </UPopover>
          <label class="inline-flex cursor-pointer rounded-md p-2 text-muted transition hover:bg-elevated hover:text-default" :title="t('composer.insertAudio')">
            <UIcon name="i-lucide-music" class="text-lg" />
            <input type="file" accept="audio/*" class="hidden" @change="onAudio">
          </label>
          <UPopover v-model:open="gifPopOpen">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-image-play" :title="t('composer.insertGif')" />
            <template #content>
              <div class="flex w-80 items-center gap-2 p-3">
                <UInput v-model="gifUrl" :placeholder="t('composer.gifPlaceholder')" class="flex-1" size="sm" @keyup.enter="insertGif" />
                <UButton size="sm" :label="t('common.insert')" @click="insertGif" />
              </div>
            </template>
          </UPopover>
          <UPopover v-model:open="emojiPopOpen">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-smile" :title="t('composer.insertEmoji')" />
            <template #content>
              <div class="grid w-72 grid-cols-8 gap-0.5 p-2">
                <button v-for="e in EMOJIS" :key="e" type="button" class="rounded-md p-1.5 text-xl leading-none transition hover:bg-elevated" @click="insertEmoji(e)">{{ e }}</button>
              </div>
            </template>
          </UPopover>
          <UButton
            size="sm" :color="kind === 'poll' ? 'primary' : 'neutral'" :variant="kind === 'poll' ? 'soft' : 'ghost'"
            icon="i-lucide-bar-chart-3" :disabled="mode === 'edit'"
            :title="mode === 'edit' ? t('composer.pollEditTitle') : t('composer.pollTitle')" @click="kind = kind === 'poll' ? 'post' : 'poll'"
          />
          <label class="inline-flex cursor-pointer rounded-md p-2 text-muted transition hover:bg-elevated hover:text-default" :title="t('composer.attachFile')">
            <UIcon name="i-lucide-paperclip" class="text-lg" />
            <input type="file" class="hidden" @change="onAttachFile">
          </label>
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-code-xml" :title="t('composer.codeBlock')" @click="editorRef?.insertCodeBlock()" />
          <span class="flex-1" />
          <UButton color="neutral" variant="ghost" :label="t('composer.cancel')" @click="requestClose" />
          <!-- Fase 16-C: en edición el botón principal es
               «Actualizar» (sin chevron: no hay programar/borrador
               nuevos sobre un post que ya existe; el programado
               ajusta su fecha en el cuerpo del modal). -->
          <UButton
            v-if="mode === 'edit'" :label="t('composer.update')" icon="i-lucide-send"
            :loading="publishing" :disabled="!canSubmitEdit" @click="submitEdit"
          />
          <div v-else class="flex">
            <UButton
              :label="scheduleMode ? t('composer.schedule') : t('composer.publish')"
              :icon="scheduleMode ? 'i-lucide-calendar-clock' : 'i-lucide-send'"
              :loading="publishing" :disabled="!canSubmit" class="rounded-r-none"
              @click="submit(scheduleMode ? 'schedule' : 'now')"
            />
            <UDropdownMenu :items="chevronItems">
              <UButton icon="i-lucide-chevron-up" :loading="publishing" class="rounded-l-none border-l border-white/25" :title="t('composer.morePublishOptions')" />
            </UDropdownMenu>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Confirmación al cerrar con cambios sin guardar -->
    <UModal
      v-model:open="confirmDiscard"
      :title="mode === 'edit' ? t('composer.discardEditTitle') : t('composer.discardCreateTitle')"
      :description="mode === 'edit' ? t('composer.discardEditText') : t('composer.discardCreateText')"
    >
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('composer.keepEditing')" @click="confirmDiscard = false" />
          <UButton v-if="mode === 'create'" color="neutral" variant="soft" :label="t('composer.saveDraft')" icon="i-lucide-save" :loading="publishing" @click="submit('draft')" />
          <UButton color="error" :label="mode === 'edit' ? t('composer.discardChanges') : t('composer.discard')" icon="i-lucide-trash-2" @click="discard" />
        </div>
      </template>
    </UModal>
  </div>
</template>
