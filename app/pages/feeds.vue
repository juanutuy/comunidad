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
const publishing = ref(false)
const imageFile = ref<File | null>(null)

function onFileChange(e: Event) {
  imageFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

watchEffect(() => {
  if (!form.channelSlug && channelOptions.value.length) form.channelSlug = channelOptions.value[0]!.value
})

async function publish() {
  publishing.value = true
  try {
    const payload = { ...form }
    if (form.mediaType === 'upload') {
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
    toast.add({ title: 'Publicación creada', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo publicar', description: (e as { data?: { message?: string } }).data?.message || (e as Error).message || 'Intentá de nuevo.', color: 'error' })
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
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Canal">
            <USelect v-model="form.channelSlug" :items="channelOptions" class="w-full" />
          </UFormField>
          <UFormField label="Tipo de adjunto">
            <USelect v-model="form.mediaType" :items="mediaOptions" class="w-full" />
          </UFormField>
        </div>
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
        <div class="flex justify-end">
          <UButton label="Publicar" icon="i-lucide-send" :loading="publishing" :disabled="!form.title.trim() || !form.body.trim()" @click="publish" />
        </div>
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
