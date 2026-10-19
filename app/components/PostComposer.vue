<script setup lang="ts">
// Compositor compacto + editor en modal (Fase 7, estilo referencia):
// una barra con avatar, campo «Escribí algo…» y atajos (Foto / Video /
// Encuesta / Publicar) que abre el editor completo en un modal. Toda
// la lógica de publicación es la de las fases anteriores: post común o
// encuesta, foto subida o por URL, video de YouTube, publicar ahora,
// guardar borrador o programar — sumando los toggles «Permitir
// comentarios» y «Publicar como anuncio» (admin, nace fijado).
const props = defineProps<{ channelSlug?: string }>()
const emit = defineEmits<{ published: [] }>()

const { user } = useAuth()
const { initials } = useFormat()
const api = useApi()
const toast = useToast()

const { data: channelData } = await useAsyncData('composer-channels', () =>
  api<{ groups: { channels: { slug: string, name: string, type: string, hasAccess: boolean }[] }[] }>('/api/channels'))
const publishable = computed(() =>
  (channelData.value?.groups || []).flatMap(g => g.channels).filter(c => c.type === 'free' || c.hasAccess))
const channelOptions = computed(() => publishable.value.map(c => ({ label: c.name, value: c.slug })))

const open = ref(false)
const form = reactive({ channelSlug: '', title: '', body: '', mediaType: 'none', mediaUrl: '' })
const kind = ref<'post' | 'poll'>('post')
const pollOptions = ref<string[]>(['', ''])
const allowComments = ref(true)
const asAnnouncement = ref(false)
const scheduleMode = ref(false)
const scheduledAt = ref('')
const publishing = ref(false)
const imageFile = ref<File | null>(null)

function onFileChange(e: Event) {
  imageFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}
function addPollOption() { if (pollOptions.value.length < 4) pollOptions.value.push('') }
function removePollOption(i: number) { if (pollOptions.value.length > 2) pollOptions.value.splice(i, 1) }

const validOptions = computed(() => pollOptions.value.map(o => o.trim()).filter(Boolean))
const canSubmit = computed(() => {
  if (!form.body.trim()) return false
  if (kind.value === 'poll') return validOptions.value.length >= 2
  return !!form.title.trim()
})

function openModal(preset?: 'photo' | 'video' | 'poll') {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para publicar', color: 'warning' }); return }
  if (!form.channelSlug) {
    form.channelSlug = props.channelSlug && publishable.value.some(c => c.slug === props.channelSlug)
      ? props.channelSlug
      : (channelOptions.value[0]?.value || '')
  }
  kind.value = preset === 'poll' ? 'poll' : 'post'
  if (preset === 'photo') form.mediaType = 'upload'
  if (preset === 'video') form.mediaType = 'video'
  open.value = true
}

function resetForm() {
  form.title = ''; form.body = ''; form.mediaUrl = ''; form.mediaType = 'none'
  imageFile.value = null
  pollOptions.value = ['', '']
  kind.value = 'post'
  allowComments.value = true
  asAnnouncement.value = false
  scheduleMode.value = false
  scheduledAt.value = ''
}

async function submit(mode: 'now' | 'draft' | 'schedule') {
  if (mode === 'schedule' && !scheduledAt.value) {
    toast.add({ title: 'Elegí la fecha y hora de publicación', color: 'warning' })
    return
  }
  if (mode !== 'draft' && !canSubmit.value) return
  if (mode === 'draft' && !form.body.trim() && !form.title.trim()) {
    toast.add({ title: 'Escribí algo antes de guardar el borrador', color: 'warning' })
    return
  }
  publishing.value = true
  try {
    const payload: Record<string, unknown> = {
      ...form,
      kind: kind.value,
      status: mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'published',
      allowComments: allowComments.value,
      pin: asAnnouncement.value,
    }
    if (kind.value === 'poll') payload.options = validOptions.value
    if (mode === 'schedule') payload.scheduledAt = new Date(scheduledAt.value).toISOString()
    if (kind.value !== 'poll' && form.mediaType === 'upload') {
      if (!imageFile.value) throw new Error('Elegí una imagen para subir.')
      const fd = new FormData()
      fd.append('file', imageFile.value)
      fd.append('kind', 'image')
      const up = await api<{ url: string }>('/api/uploads', { method: 'POST', body: fd })
      payload.mediaType = 'image'
      payload.mediaUrl = up.url
    }
    await api('/api/posts', { method: 'POST', body: payload })
    if (mode === 'draft') toast.add({ title: 'Borrador guardado', description: 'Lo encontrás en «Mis borradores».', color: 'success' })
    else if (mode === 'schedule') toast.add({ title: 'Publicación programada', description: `Se publica el ${new Date(scheduledAt.value).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}.`, color: 'success' })
    else toast.add({ title: 'Publicación creada', color: 'success' })
    resetForm()
    open.value = false
    emit('published')
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
  <div v-if="user">
    <!-- Barra compacta -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
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

    <!-- Editor en modal -->
    <UModal v-model:open="open" title="Crear publicación" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.name)" size="md" />
            <div class="min-w-0">
              <p class="truncate font-semibold">{{ user.name }}</p>
              <p class="text-xs text-muted">Publicando en</p>
            </div>
            <USelect v-model="form.channelSlug" :items="channelOptions" class="ml-auto w-52" />
          </div>

          <div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-default py-2.5">
            <USwitch v-model="allowComments" label="Permitir comentarios" />
            <USwitch v-if="user.role === 'admin'" v-model="asAnnouncement" label="Publicar como anuncio" />
            <span class="text-xs text-muted">{{ asAnnouncement && user.role === 'admin' ? 'Queda fijado arriba del canal.' : '' }}</span>
          </div>

          <UTabs
            :model-value="kind" :items="[
              { label: 'Publicación', value: 'post', icon: 'i-lucide-pen-square' },
              { label: 'Encuesta', value: 'poll', icon: 'i-lucide-bar-chart-3' },
            ]" :content="false" size="sm" class="w-64" @update:model-value="(v: string | number) => kind = v as 'post' | 'poll'"
          />

          <template v-if="kind === 'post'">
            <UFormField label="Título">
              <UInput v-model="form.title" placeholder="¿Qué querés compartir?" class="w-full" />
            </UFormField>
            <UFormField label="Contenido">
              <UTextarea v-model="form.body" :rows="5" placeholder="Escribí tu publicación…" class="w-full" />
            </UFormField>
            <UFormField label="Adjunto">
              <USelect
                v-model="form.mediaType" :items="[
                  { label: 'Sin adjunto', value: 'none' },
                  { label: 'Foto (subir archivo)', value: 'upload' },
                  { label: 'Video (enlace de YouTube)', value: 'video' },
                  { label: 'Imagen (URL)', value: 'image' },
                ]" class="w-full"
              />
            </UFormField>
            <UFormField v-if="form.mediaType === 'video' || form.mediaType === 'image'" label="URL del adjunto">
              <UInput v-model="form.mediaUrl" placeholder="https://…" class="w-full" />
            </UFormField>
            <UFormField v-else-if="form.mediaType === 'upload'" label="Imagen (PNG, JPG, WebP o GIF · máx. 5 MB)">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-sm file:font-medium" @change="onFileChange">
              <p v-if="imageFile" class="mt-1 text-xs text-muted">{{ imageFile.name }} · {{ (imageFile.size / 1024).toFixed(0) }} KB</p>
            </UFormField>
          </template>
          <template v-else>
            <UFormField label="Pregunta" description="La pregunta es el cuerpo de la encuesta; el título es opcional.">
              <UTextarea v-model="form.body" :rows="2" placeholder="¿Qué preferís para el próximo taller?" class="w-full" />
            </UFormField>
            <UFormField label="Título (opcional)">
              <UInput v-model="form.title" placeholder="Se genera desde la pregunta si lo dejás vacío" class="w-full" />
            </UFormField>
            <UFormField label="Opciones (2 a 4)">
              <div class="space-y-2">
                <div v-for="(_, i) in pollOptions" :key="i" class="flex items-center gap-2">
                  <UInput v-model="pollOptions[i]" :placeholder="`Opción ${i + 1}`" class="flex-1" maxlength="80" />
                  <UButton v-if="pollOptions.length > 2" size="sm" color="neutral" variant="ghost" icon="i-lucide-x" @click="removePollOption(i)" />
                </div>
                <UButton v-if="pollOptions.length < 4" size="sm" color="neutral" variant="soft" icon="i-lucide-plus" label="Agregar opción" @click="addPollOption" />
              </div>
            </UFormField>
          </template>

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
        <div class="flex w-full items-center justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="open = false" />
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
  </div>
</template>
