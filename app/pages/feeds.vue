<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const { user, tenant } = useAuth()
const api = useApi()
const toast = useToast()

const { data, refresh } = await useAsyncData('feed', () => api<{ posts: PostView[] }>('/api/feed'))
const { data: channelData } = await useAsyncData('feed-channels', () =>
  api<{ groups: { channels: { slug: string, name: string, type: string, hasAccess: boolean }[] }[] }>('/api/channels'))

const publishable = computed(() =>
  (channelData.value?.groups || []).flatMap(g => g.channels).filter(c => c.type === 'free' || c.hasAccess))
const channelOptions = computed(() => publishable.value.map(c => ({ label: c.name, value: c.slug })))

const form = reactive({ channelSlug: '', title: '', body: '', mediaType: 'none', mediaUrl: '' })
const mediaOptions = [
  { label: 'Sin adjunto', value: 'none' },
  { label: 'Video (enlace de YouTube)', value: 'video' },
  { label: 'Imagen (URL)', value: 'image' },
  { label: 'Imagen (subir archivo)', value: 'upload' },
]
// Fase 5: tipo de publicación (común o encuesta) y destino
// (publicar ahora, borrador o programado).
const kindOptions = [
  { label: 'Publicación', value: 'post', icon: 'i-lucide-pen-square' },
  { label: 'Encuesta', value: 'poll', icon: 'i-lucide-bar-chart-3' },
]
const kind = ref('post')
const pollOptions = ref<string[]>(['', ''])
const mode = ref<'now' | 'draft' | 'schedule'>('now')
const scheduledAt = ref('')
const publishing = ref(false)
const imageFile = ref<File | null>(null)

function onFileChange(e: Event) {
  imageFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}
function addPollOption() { if (pollOptions.value.length < 4) pollOptions.value.push('') }
function removePollOption(i: number) { if (pollOptions.value.length > 2) pollOptions.value.splice(i, 1) }

watchEffect(() => {
  if (!form.channelSlug && channelOptions.value.length) form.channelSlug = channelOptions.value[0]!.value
})

const validOptions = computed(() => pollOptions.value.map(o => o.trim()).filter(Boolean))
const canSubmit = computed(() => {
  if (!form.body.trim()) return false
  if (kind.value === 'poll') return validOptions.value.length >= 2
  return !!form.title.trim()
})

async function publish() {
  publishing.value = true
  try {
    const payload: Record<string, unknown> = {
      ...form,
      kind: kind.value,
      status: mode.value === 'draft' ? 'draft' : mode.value === 'schedule' ? 'scheduled' : 'published',
    }
    if (kind.value === 'poll') payload.options = validOptions.value
    if (mode.value === 'schedule') {
      if (!scheduledAt.value) throw new Error('Elegí la fecha y hora de publicación.')
      payload.scheduledAt = new Date(scheduledAt.value).toISOString()
    }
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
    form.title = ''; form.body = ''; form.mediaUrl = ''; form.mediaType = 'none'; imageFile.value = null
    pollOptions.value = ['', '']
    if (mode.value === 'draft') toast.add({ title: 'Borrador guardado', description: 'Lo encontrás en «Mis borradores».', color: 'success' })
    else if (mode.value === 'schedule') toast.add({ title: 'Publicación programada', description: 'Se va a publicar sola a la hora elegida.', color: 'success' })
    else toast.add({ title: 'Publicación creada', color: 'success' })
    mode.value = 'now'
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar', description: (e as { data?: { message?: string } }).data?.message || (e as Error).message || 'Intentá de nuevo.', color: 'error' })
  }
  finally { publishing.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">{{ tenant?.name }}</h1>
      <p class="text-muted">{{ tenant?.tagline }}</p>
    </div>

    <UCard v-if="user">
      <h2 class="mb-3 flex items-center gap-2 font-semibold">
        <UIcon name="i-lucide-pen-square" /> Crear publicación
      </h2>
      <div class="space-y-3">
        <UTabs v-model="kind" :items="kindOptions" :content="false" size="sm" class="w-64" />
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Canal">
            <USelect v-model="form.channelSlug" :items="channelOptions" class="w-full" />
          </UFormField>
          <UFormField v-if="kind === 'post'" label="Tipo de adjunto">
            <USelect v-model="form.mediaType" :items="mediaOptions" class="w-full" />
          </UFormField>
        </div>
        <template v-if="kind === 'post'">
          <UFormField label="Título">
            <UInput v-model="form.title" placeholder="¿Qué querés compartir?" class="w-full" />
          </UFormField>
          <UFormField label="Contenido">
            <UTextarea v-model="form.body" :rows="4" placeholder="Escribí tu publicación…" class="w-full" />
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
        <div class="flex flex-wrap items-center gap-2 border-t border-default pt-3">
          <USelect
            v-model="mode"
            :items="[
              { label: 'Publicar ahora', value: 'now' },
              { label: 'Guardar borrador', value: 'draft' },
              { label: 'Programar', value: 'schedule' },
            ]"
            class="w-48"
          />
          <UInput v-if="mode === 'schedule'" v-model="scheduledAt" type="datetime-local" />
          <span class="flex-1" />
          <UButton
            :label="mode === 'draft' ? 'Guardar borrador' : mode === 'schedule' ? 'Programar' : 'Publicar'"
            :icon="mode === 'draft' ? 'i-lucide-save' : mode === 'schedule' ? 'i-lucide-calendar-clock' : 'i-lucide-send'"
            :loading="publishing" :disabled="!canSubmit" @click="publish"
          />
        </div>
        <p class="text-xs text-muted">
          Los borradores y programados quedan en <NuxtLink to="/drafts" class="text-primary hover:underline">Mis borradores</NuxtLink>.
        </p>
      </div>
    </UCard>
    <UAlert v-else color="primary" variant="soft" icon="i-lucide-sparkles" title="Estás viendo como visitante" description="Iniciá sesión o creá tu cuenta para publicar, comentar y reaccionar.">
      <template #actions>
        <UButton to="/login" size="sm" color="neutral" label="Iniciar sesión" />
        <UButton to="/register" size="sm" label="Unirse gratis" />
      </template>
    </UAlert>

    <PostCard v-for="post in data?.posts || []" :key="post.id" :post="post" @changed="refresh" />
    <UAlert v-if="!(data?.posts?.length)" color="neutral" variant="soft" title="Todavía no hay publicaciones en tu feed" description="Seguí canales desde la barra lateral para ver su contenido aquí." />
  </div>
</template>
