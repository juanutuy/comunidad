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
const props = withDefaults(defineProps<{ channelSlug?: string, variant?: 'bar' | 'bare' }>(), { variant: 'bar' })
const emit = defineEmits<{ published: [] }>()

const { user, gates } = useAuth()
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
const attachedFile = ref<{ url: string, name: string } | null>(null)
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
  a: anonymous.value, c: allowComments.value, f: attachedFile.value?.url || '',
}))
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
    .catch(err => toast.add({ title: 'No se pudo subir la imagen', description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' }))
}
function onAudio(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  upload('audio', file).then(({ url }) => editorRef.value?.insertAudio(url))
    .catch(err => toast.add({ title: 'No se pudo subir el audio', description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' }))
}
function onAttachFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  upload('file', file).then(({ url, name }) => { attachedFile.value = { url, name } })
    .catch(err => toast.add({ title: 'No se pudo subir el archivo', description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' }))
}
function insertVideo() {
  if (!videoUrl.value.trim()) return
  if (editorRef.value?.insertVideo(videoUrl.value)) { videoUrl.value = ''; videoPopOpen.value = false }
  else toast.add({ title: 'Enlace de video no reconocido', description: 'Pegá un enlace de YouTube o Vimeo.', color: 'warning' })
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
  if (!user.value) { toast.add({ title: 'Iniciá sesión para publicar', color: 'warning' }); return }
  // Fase 16: dentro de un canal de «solo el equipo», un miembro no
  // abre el editor: el aviso (en la variante de barra es la alerta
  // fija; en la «bare» va como toast).
  if (staffOnlyChannel.value) {
    toast.add({ title: 'Solo el equipo puede publicar en este canal', description: 'Podés leer, comentar y reaccionar como siempre.', color: 'warning' })
    return
  }
  // Fase 14: con la compuerta de publicación activa para este
  // miembro, el modal ni se abre: el aviso va como toast (la variante
  // de barra además pinta la alerta fija en el lugar del compositor).
  if (createGate.value) {
    toast.add({
      title: `Necesitás el nivel ${createGate.value.levelName} para publicar`,
      description: `Tenés ${createGate.value.myPoints} puntos y el nivel se alcanza con ${createGate.value.neededPoints}.`,
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
  attachedFile.value = null
  maximized.value = false
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
    toast.add({ title: 'Elegí la fecha y hora de publicación', color: 'warning' })
    return
  }
  if (mode !== 'draft' && !canSubmit.value) return
  if (mode === 'draft' && !bodyText.value && !title.value.trim()) {
    toast.add({ title: 'Escribí algo antes de guardar el borrador', color: 'warning' })
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
    if (attachedFile.value) {
      payload.mediaType = 'file'
      payload.mediaUrl = attachedFile.value.url
      payload.attachmentName = attachedFile.value.name
    }
    const created = await api<{ status?: string }>('/api/posts', { method: 'POST', body: payload })
    if (mode === 'draft') toast.add({ title: 'Borrador guardado', description: 'Lo encontrás en «Mis borradores».', color: 'success' })
    else if (mode === 'schedule') toast.add({ title: 'Publicación programada', description: `Se publica el ${new Date(scheduledAt.value).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}.`, color: 'success' })
    // Fase 12: con la revisión previa encendida, el servidor devuelve
    // status 'review': el post no se publica todavía.
    else if (created.status === 'review') toast.add({ title: 'Publicación enviada a revisión', description: 'Un administrador la va a revisar antes de que aparezca en el feed.', color: 'success' })
    else toast.add({ title: 'Publicación creada', color: 'success' })
    confirmDiscard.value = false
    open.value = false
    resetForm()
    emit('published')
    if (props.variant === 'bare') await refreshNuxtData()
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar', description: (e as { data?: { message?: string } }).data?.message || (e as Error).message || 'Intentá de nuevo.', color: 'error' })
  }
  finally { publishing.value = false }
}

const chevronItems = computed(() => [
  [{
    label: scheduleMode.value ? 'Sin programar' : 'Programar…',
    icon: 'i-lucide-calendar-clock',
    onSelect: () => { scheduleMode.value = !scheduleMode.value },
  },
  {
    label: 'Guardar borrador',
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
    :title="`Necesitás el nivel ${createGate.levelName} para publicar`"
    :description="`Esta comunidad reserva la publicación a quienes alcanzan ese nivel. Tenés ${createGate.myPoints} puntos y el nivel se alcanza con ${createGate.neededPoints}: participá comentando y reaccionando para llegar.`"
  />
  <!-- Fase 16: canal de «solo el equipo» — el compositor se
       reemplaza por el aviso para los miembros sin permiso. -->
  <UAlert
    v-else-if="user && staffOnlyChannel && variant === 'bar'" color="neutral" variant="soft" icon="i-lucide-lock"
    title="Solo el equipo puede publicar en este canal"
    description="Las publicaciones nuevas de este canal las hace el equipo de la comunidad. Podés leer, comentar y reaccionar como siempre."
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
          Escribí algo…
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-1 px-4 py-3">
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-image" label="Foto" @click="openModal('photo')" />
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-video" label="Video" @click="openModal('video')" />
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-bar-chart-3" label="Encuesta" @click="openModal('poll')" />
        <span class="flex-1" />
        <UButton label="Publicar" icon="i-lucide-send" size="sm" @click="openModal()" />
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
            <p class="truncate font-semibold">{{ anonymous ? 'Anónimo' : user.name }}</p>
            <div class="flex items-center gap-1 text-sm text-muted">
              <span>Publicando en</span>
              <UDropdownMenu :items="channelMenuItems">
                <UButton color="neutral" variant="link" size="sm" class="px-1 font-semibold text-primary" :label="`# ${currentChannel?.name || '…'}`" trailing-icon="i-lucide-chevron-down" />
              </UDropdownMenu>
            </div>
          </div>
          <!-- Toggles-icono como en la referencia -->
          <div class="flex shrink-0 items-center gap-1">
            <UButton
              v-if="user.role === 'admin'" size="sm" :color="asAnnouncement ? 'primary' : 'neutral'"
              :variant="asAnnouncement ? 'soft' : 'ghost'" icon="i-lucide-megaphone"
              title="Publicar como anuncio (queda fijado en el canal)" @click="asAnnouncement = !asAnnouncement"
            />
            <UButton
              size="sm" :color="anonymous ? 'primary' : 'neutral'" :variant="anonymous ? 'soft' : 'ghost'"
              icon="i-lucide-venetian-mask" title="Publicar como anónimo: nadie ve tu nombre ni tu perfil"
              @click="anonymous = !anonymous"
            />
            <UButton
              size="sm" :color="allowComments ? 'primary' : 'neutral'" :variant="allowComments ? 'soft' : 'ghost'"
              :icon="allowComments ? 'i-lucide-message-circle' : 'i-lucide-message-circle-off'"
              :title="allowComments ? 'Comentarios permitidos' : 'Comentarios desactivados'" @click="allowComments = !allowComments"
            />
            <UButton
              v-if="!isPhone" size="sm" color="neutral" variant="ghost"
              :icon="maximized ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
              :title="maximized ? 'Reducir' : 'Maximizar'" @click="maximized = !maximized"
            />
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" title="Cerrar" @click="requestClose" />
          </div>
        </div>
      </template>
      <template #body>
        <div class="space-y-3">
          <input
            v-model="title" type="text" maxlength="160"
            :placeholder="kind === 'poll' ? 'Título (opcional)' : 'Escribí un título'"
            class="w-full bg-transparent text-xl font-bold outline-none placeholder:text-dimmed"
          >
          <ClientOnly>
            <RichEditor
              ref="editorRef" v-model="bodyHtml" mode="slash" :upload-image="uploadImage"
              :placeholder="kind === 'poll' ? '¿Cuál es tu pregunta?' : '¿Qué tenés en mente? Escribí «/» para insertar bloques…'"
            />
          </ClientOnly>

          <!-- Panel de encuesta integrado al editor -->
          <div v-if="kind === 'poll'" class="space-y-2 rounded-lg border border-default p-3">
            <p class="flex items-center gap-2 text-sm font-semibold"><UIcon name="i-lucide-bar-chart-3" /> Opciones de la encuesta</p>
            <div v-for="(_, i) in pollOptions" :key="i" class="flex items-center gap-2">
              <UInput v-model="pollOptions[i]" :placeholder="`Opción ${i + 1}`" class="flex-1" maxlength="80" />
              <UButton v-if="pollOptions.length > 2" size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="removePollOption(i)" />
            </div>
            <UButton v-if="pollOptions.length < 4" size="sm" color="neutral" variant="soft" icon="i-lucide-plus" label="Agregar opción" @click="addPollOption" />
            <p class="text-xs text-muted">Los miembros pueden votar y cambiar su voto. La pregunta es el texto del editor.</p>
          </div>

          <div v-if="attachedFile" class="flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm">
            <UIcon name="i-lucide-paperclip" class="text-muted" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ attachedFile.name }}</span>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" title="Quitar adjunto" @click="attachedFile = null" />
          </div>

          <div v-if="scheduleMode" class="flex flex-wrap items-center gap-2 rounded-lg bg-elevated p-3">
            <UIcon name="i-lucide-calendar-clock" />
            <span class="text-sm font-medium">Publicar el</span>
            <UInput v-model="scheduledAt" type="datetime-local" />
          </div>
          <p class="text-xs text-muted">
            Los borradores y programados quedan en <NuxtLink to="/drafts" class="text-primary hover:underline" @click="open = false">Mis borradores</NuxtLink>.
          </p>
        </div>
      </template>
      <template #footer>
        <!-- Barra inferior de solo iconos, como la referencia -->
        <div class="flex w-full items-center gap-0.5">
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" title="Insertar bloque (o escribí «/» en el texto)" @click="editorRef?.insertSlash()" />
          <label class="inline-flex cursor-pointer rounded-md p-2 text-muted transition hover:bg-elevated hover:text-default" title="Insertar imagen">
            <UIcon name="i-lucide-image" class="text-lg" />
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="onInlineImage">
          </label>
          <UPopover v-model:open="videoPopOpen">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-video" title="Incrustar video (YouTube o Vimeo)" />
            <template #content>
              <div class="flex w-80 items-center gap-2 p-3">
                <UInput v-model="videoUrl" placeholder="Enlace de YouTube o Vimeo…" class="flex-1" size="sm" @keyup.enter="insertVideo" />
                <UButton size="sm" label="Insertar" @click="insertVideo" />
              </div>
            </template>
          </UPopover>
          <label class="inline-flex cursor-pointer rounded-md p-2 text-muted transition hover:bg-elevated hover:text-default" title="Insertar audio (MP3, M4A, OGG, WAV)">
            <UIcon name="i-lucide-music" class="text-lg" />
            <input type="file" accept="audio/*" class="hidden" @change="onAudio">
          </label>
          <UPopover v-model:open="gifPopOpen">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-image-play" title="Insertar GIF por enlace" />
            <template #content>
              <div class="flex w-80 items-center gap-2 p-3">
                <UInput v-model="gifUrl" placeholder="Enlace del GIF (https://…)" class="flex-1" size="sm" @keyup.enter="insertGif" />
                <UButton size="sm" label="Insertar" @click="insertGif" />
              </div>
            </template>
          </UPopover>
          <UPopover v-model:open="emojiPopOpen">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-smile" title="Insertar emoji" />
            <template #content>
              <div class="grid w-72 grid-cols-8 gap-0.5 p-2">
                <button v-for="e in EMOJIS" :key="e" type="button" class="rounded-md p-1.5 text-xl leading-none transition hover:bg-elevated" @click="insertEmoji(e)">{{ e }}</button>
              </div>
            </template>
          </UPopover>
          <UButton
            size="sm" :color="kind === 'poll' ? 'primary' : 'neutral'" :variant="kind === 'poll' ? 'soft' : 'ghost'"
            icon="i-lucide-bar-chart-3" title="Encuesta" @click="kind = kind === 'poll' ? 'post' : 'poll'"
          />
          <label class="inline-flex cursor-pointer rounded-md p-2 text-muted transition hover:bg-elevated hover:text-default" title="Adjuntar un archivo descargable">
            <UIcon name="i-lucide-paperclip" class="text-lg" />
            <input type="file" class="hidden" @change="onAttachFile">
          </label>
          <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-code-xml" title="Bloque de código" @click="editorRef?.insertCodeBlock()" />
          <span class="flex-1" />
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="requestClose" />
          <div class="flex">
            <UButton
              :label="scheduleMode ? 'Programar' : 'Publicar'"
              :icon="scheduleMode ? 'i-lucide-calendar-clock' : 'i-lucide-send'"
              :loading="publishing" :disabled="!canSubmit" class="rounded-r-none"
              @click="submit(scheduleMode ? 'schedule' : 'now')"
            />
            <UDropdownMenu :items="chevronItems">
              <UButton icon="i-lucide-chevron-up" :loading="publishing" class="rounded-l-none border-l border-white/25" title="Más opciones de publicación" />
            </UDropdownMenu>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Confirmación al cerrar con cambios sin publicar -->
    <UModal v-model:open="confirmDiscard" title="¿Descartar publicación?" description="Tenés contenido sin publicar en el editor.">
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Seguir editando" @click="confirmDiscard = false" />
          <UButton color="neutral" variant="soft" label="Guardar borrador" icon="i-lucide-save" :loading="publishing" @click="submit('draft')" />
          <UButton color="error" label="Descartar" icon="i-lucide-trash-2" @click="discard" />
        </div>
      </template>
    </UModal>
  </div>
</template>
