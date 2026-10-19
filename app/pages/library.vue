<script setup lang="ts">
// Biblioteca (Fase 2): además de los registros de referencia de la
// semilla, el admin puede subir archivos reales (R2 / disco local) y los
// miembros los descargan por /api/library/:id/download, que respeta el
// candado premium.
const api = useApi()
const { user } = useAuth()
const toast = useToast()
const { fmtDate } = useFormat()
type LibItem = { id: number, title: string, kind: string, category: string, sizeLabel: string, downloads: number, locked: boolean, createdAt: string, hasFile: boolean, canDownload: boolean }
const kinds = [
  { label: 'Todos', value: 'all' },
  { label: 'PDF', value: 'pdf' },
  { label: 'Documentos', value: 'doc' },
  { label: 'Video', value: 'video' },
  { label: 'Imágenes', value: 'image' },
  { label: 'Audio', value: 'audio' },
  { label: 'Enlaces', value: 'link' },
]
const kindIcons: Record<string, string> = { pdf: 'i-lucide-file-text', doc: 'i-lucide-file', video: 'i-lucide-file-video', image: 'i-lucide-file-image', audio: 'i-lucide-file-audio', link: 'i-lucide-link' }
const active = ref('all')
const { data, refresh } = await useAsyncData('library', () => api<{ items: LibItem[] }>('/api/library'))
const items = ref<LibItem[]>([])
watchEffect(() => { items.value = data.value?.items || [] })
async function setKind(k: string) {
  active.value = k
  const res = await api<{ items: LibItem[] }>('/api/library', { query: { kind: k } })
  items.value = res.items
}

// --- Subida (solo admin) ---
const upForm = reactive({ title: '', category: '', locked: false })
const upFile = ref<File | null>(null)
const uploading = ref(false)
function onUpFile(e: Event) {
  upFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
  if (upFile.value && !upForm.title) upForm.title = upFile.value.name.replace(/\.[^.]+$/, '')
}
async function upload() {
  if (!upFile.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', upFile.value)
    fd.append('title', upForm.title)
    fd.append('category', upForm.category || 'General')
    fd.append('locked', upForm.locked ? '1' : '0')
    await api('/api/library/upload', { method: 'POST', body: fd })
    toast.add({ title: 'Recurso subido a la biblioteca', color: 'success' })
    upForm.title = ''; upForm.category = ''; upForm.locked = false; upFile.value = null
    await refresh()
    if (active.value !== 'all') await setKind(active.value)
  }
  catch (e) {
    toast.add({ title: 'No se pudo subir el recurso', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploading.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Biblioteca</h1>
      <p class="text-muted">Documentos, guías, plantillas y enlaces compartidos de la comunidad.</p>
    </div>

    <UCard v-if="user?.role === 'admin'">
      <h2 class="mb-3 flex items-center gap-2 font-semibold"><UIcon name="i-lucide-upload" /> Subir un recurso (admin)</h2>
      <div class="space-y-3">
        <UFormField label="Archivo (PDF, documentos, imágenes, audio, video MP4, ZIP · máx. 10 MB)">
          <input type="file" class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-sm file:font-medium" @change="onUpFile">
        </UFormField>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Título">
            <UInput v-model="upForm.title" placeholder="Nombre del recurso" class="w-full" />
          </UFormField>
          <UFormField label="Categoría">
            <UInput v-model="upForm.category" placeholder="Ej.: Guías" class="w-full" />
          </UFormField>
        </div>
        <UCheckbox v-model="upForm.locked" label="Solo miembros con acceso premium" />
        <div class="flex justify-end">
          <UButton label="Subir recurso" icon="i-lucide-upload" :loading="uploading" :disabled="!upFile" @click="upload" />
        </div>
      </div>
    </UCard>

    <div class="flex flex-wrap gap-2">
      <UButton v-for="k in kinds" :key="k.value" size="sm" :color="active === k.value ? 'primary' : 'neutral'" :variant="active === k.value ? 'solid' : 'soft'" :label="k.label" @click="setKind(k.value)" />
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UCard v-for="i in items" :key="i.id">
        <div class="flex items-start gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-elevated">
            <UIcon :name="kindIcons[i.kind] || 'i-lucide-file'" class="text-xl" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold leading-snug">{{ i.title }}</p>
            <p class="mt-1 text-xs text-muted">{{ i.category }} · {{ i.sizeLabel }} · {{ fmtDate(i.createdAt) }} · {{ i.downloads }} descargas</p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <UButton v-if="i.hasFile && i.canDownload" :to="`/api/library/${i.id}/download`" external size="xs" icon="i-lucide-download" label="Descargar" />
              <UBadge v-if="i.locked && !i.canDownload" color="warning" variant="subtle" icon="i-lucide-lock">Solo miembros con acceso premium</UBadge>
              <UBadge v-else-if="i.hasFile" color="success" variant="subtle" icon="i-lucide-download">Archivo disponible</UBadge>
              <UBadge v-else color="neutral" variant="subtle" icon="i-lucide-info">Registro de referencia</UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </div>
    <UAlert v-if="!items.length" color="neutral" variant="soft" title="No hay recursos de este tipo todavía" />
  </div>
</template>
