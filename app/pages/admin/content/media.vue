<script setup lang="ts">
// Contenido → Archivos (Fase 16): el gestor de medios con TODAS las
// subidas de la comunidad. El total usado es la suma real de
// tamaños — sin cuota inventada. Eliminar un archivo en uso exige
// una confirmación extra que nombra dónde se usa.
// Acceso: solo admin (la API también lo exige).
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const { fmtDateTime } = useFormat()
const api = useApi()
const toast = useToast()

interface MediaFile {
  id: number, filename: string, key: string, contentType: string, kind: 'image' | 'video' | 'audio' | 'file'
  size: number, sizeLabel: string, createdAt: string
  uploader: { name: string, slug: string }, locations: string[]
  url: string | null, downloadUrl: string
}
interface MediaData {
  totalBytes: number, totalLabel: string
  counts: { all: number, image: number, video: number, audio: number, file: number }
  total: number, limit: number, offset: number, files: MediaFile[]
}

const isAdmin = computed(() => user.value?.role === 'admin')
const typeFilter = ref('all')
const page = ref(0)
const PAGE_SIZE = 50
const query = computed(() => `/api/admin/media?type=${typeFilter.value}&limit=${PAGE_SIZE}&offset=${page.value * PAGE_SIZE}`)
const { data, refresh } = await useAsyncData('admin-media', () =>
  isAdmin.value ? api<MediaData>(query.value) : Promise.resolve(null), { watch: [query] })
watch(typeFilter, () => { page.value = 0 })
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total || 0) / PAGE_SIZE)))

const tabs = computed(() => [
  { value: 'all', label: 'Todos', count: data.value?.counts.all ?? 0, icon: 'i-lucide-files' },
  { value: 'image', label: 'Imágenes', count: data.value?.counts.image ?? 0, icon: 'i-lucide-image' },
  { value: 'video', label: 'Videos', count: data.value?.counts.video ?? 0, icon: 'i-lucide-video' },
  { value: 'audio', label: 'Audios', count: data.value?.counts.audio ?? 0, icon: 'i-lucide-music' },
  { value: 'file', label: 'Archivos', count: data.value?.counts.file ?? 0, icon: 'i-lucide-file' },
])
const kindLabels: Record<string, string> = { image: 'Imagen', video: 'Video', audio: 'Audio', file: 'Archivo' }
const kindIcons: Record<string, string> = { image: 'i-lucide-image', video: 'i-lucide-video', audio: 'i-lucide-music', file: 'i-lucide-file' }

// --- Panel de detalles ---
const selected = ref<MediaFile | null>(null)
const detailsOpen = ref(false)
function openDetails(f: MediaFile) {
  selected.value = f
  detailsOpen.value = true
}
async function copyUrl(f: MediaFile) {
  const target = f.url || f.downloadUrl
  try {
    await navigator.clipboard.writeText(new URL(target, window.location.origin).toString())
    toast.add({ title: 'URL copiada', color: 'success' })
  }
  catch {
    toast.add({ title: 'No se pudo copiar', description: target, color: 'warning' })
  }
}

// --- Eliminar ---
const toDelete = ref<MediaFile | null>(null)
const confirmedInUse = ref(false)
const deleting = ref(false)
function askDelete(f: MediaFile) {
  toDelete.value = f
  confirmedInUse.value = false
}
async function deleteFile() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await api(`/api/admin/media/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Archivo eliminado', description: 'Se borró del almacenamiento y de la lista.', color: 'success' })
    if (selected.value?.id === toDelete.value.id) { selected.value = null; detailsOpen.value = false }
    toDelete.value = null
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo eliminar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { deleting.value = false }
}

function rowMenuItems(f: MediaFile) {
  return [[
    { label: 'Descargar', icon: 'i-lucide-download', to: f.downloadUrl, external: true },
    { label: 'Ver detalles', icon: 'i-lucide-info', onSelect: () => openDetails(f) },
    { label: 'Eliminar', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => askDelete(f) },
  ]]
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Contenido</h1>
      <p class="text-muted">Archivos subidos a {{ tenant?.name }}: imágenes, videos, audios y documentos.</p>
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <UAlert v-else-if="!isAdmin" color="warning" variant="soft" title="Solo administradores" description="El gestor de archivos es solo para administradores." />
    <template v-else>
      <ContentSubNav />
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="t in tabs" :key="t.value" size="sm"
            :color="typeFilter === t.value ? 'primary' : 'neutral'"
            :variant="typeFilter === t.value ? 'soft' : 'ghost'"
            :icon="t.icon" :label="`${t.label} · ${t.count}`"
            @click="typeFilter = t.value"
          />
        </div>
        <span class="flex-1" />
        <p class="text-sm text-muted">Total usado: <strong class="text-highlighted">{{ data?.totalLabel || '0 B' }}</strong></p>
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs tracking-wider text-muted uppercase">
                <th class="px-4 py-3 font-semibold">Nombre</th>
                <th class="px-4 py-3 font-semibold">Tipo</th>
                <th class="px-4 py-3 font-semibold">Subido por</th>
                <th class="px-4 py-3 font-semibold">Ubicación</th>
                <th class="px-4 py-3 text-right font-semibold">Tamaño</th>
                <th class="px-4 py-3 font-semibold">Fecha</th>
                <th class="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in data?.files || []" :key="f.id" class="border-b border-default/60 last:border-0 hover:bg-elevated/50">
                <td class="max-w-64 px-4 py-3">
                  <button type="button" class="flex items-center gap-2 text-left font-medium hover:underline" @click="openDetails(f)">
                    <img v-if="f.kind === 'image' && f.url" :src="f.url" alt="" class="h-8 w-8 shrink-0 rounded object-cover">
                    <UIcon v-else :name="kindIcons[f.kind]" class="shrink-0 text-lg text-muted" />
                    <span class="min-w-0 truncate">{{ f.filename }}</span>
                  </button>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">{{ kindLabels[f.kind] }}</td>
                <td class="px-4 py-3 whitespace-nowrap">{{ f.uploader.name }}</td>
                <td class="max-w-56 px-4 py-3">
                  <span v-if="f.locations.length" class="line-clamp-2">{{ f.locations.join(' · ') }}</span>
                  <span v-else class="text-muted">—</span>
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">{{ f.sizeLabel }}</td>
                <td class="px-4 py-3 whitespace-nowrap">{{ fmtDateTime(f.createdAt) }}</td>
                <td class="px-4 py-3 text-right">
                  <UDropdownMenu :items="rowMenuItems(f)">
                    <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" aria-label="Acciones del archivo" />
                  </UDropdownMenu>
                </td>
              </tr>
              <tr v-if="!(data?.files?.length)">
                <td colspan="7" class="px-4 py-10 text-center text-muted">Todavía no hay archivos de este tipo.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <div v-if="totalPages > 1" class="flex items-center justify-end gap-2">
        <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-chevron-left" label="Anterior" :disabled="page === 0" @click="page--" />
        <span class="text-sm text-muted">Página {{ page + 1 }} de {{ totalPages }}</span>
        <UButton size="sm" color="neutral" variant="soft" label="Siguiente" trailing-icon="i-lucide-chevron-right" :disabled="page + 1 >= totalPages" @click="page++" />
      </div>

      <!-- Detalles del archivo -->
      <USlideover v-model:open="detailsOpen" title="Detalles del archivo" description="Metadatos y ubicación de uso de esta subida.">
        <template #body>
          <div v-if="selected" class="space-y-4">
            <img v-if="selected.kind === 'image' && selected.url" :src="selected.url" alt="" class="max-h-64 w-full rounded-lg object-contain">
            <div class="flex gap-2">
              <UButton :to="selected.downloadUrl" external label="Descargar" icon="i-lucide-download" size="sm" />
              <UButton label="Copiar URL" icon="i-lucide-link" size="sm" color="neutral" variant="soft" @click="copyUrl(selected)" />
            </div>
            <dl class="space-y-2 text-sm">
              <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Nombre</dt><dd class="min-w-0 break-all font-medium">{{ selected.filename }}</dd></div>
              <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Tipo</dt><dd>{{ kindLabels[selected.kind] }}</dd></div>
              <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Tipo MIME</dt><dd class="break-all">{{ selected.contentType || '—' }}</dd></div>
              <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Tamaño</dt><dd>{{ selected.sizeLabel }}</dd></div>
              <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Subido por</dt><dd>{{ selected.uploader.name }}</dd></div>
              <div class="flex gap-2">
                <dt class="w-28 shrink-0 text-muted">Ubicación</dt>
                <dd v-if="selected.locations.length"><span v-for="loc in selected.locations" :key="loc" class="block">{{ loc }}</span></dd>
                <dd v-else class="text-muted">— (sin referencias encontradas)</dd>
              </div>
              <div class="flex gap-2"><dt class="w-28 shrink-0 text-muted">Fecha</dt><dd>{{ fmtDateTime(selected.createdAt) }}</dd></div>
            </dl>
            <UButton color="error" variant="soft" label="Eliminar archivo" icon="i-lucide-trash-2" size="sm" @click="askDelete(selected)" />
          </div>
        </template>
      </USlideover>

      <!-- Confirmación de borrado: con advertencia si está en uso -->
      <UModal :open="!!toDelete" title="Eliminar archivo" @update:open="(v: boolean) => { if (!v) toDelete = null }">
        <template #body>
          <div class="space-y-3 text-sm">
            <p>Se elimina <strong>{{ toDelete?.filename }}</strong> del almacenamiento. No se puede deshacer.</p>
            <UAlert v-if="toDelete?.locations.length" color="warning" variant="soft" icon="i-lucide-triangle-alert" title="Este archivo está en uso">
              <template #description>
                <p>Se usa en:</p>
                <ul class="mt-1 list-inside list-disc">
                  <li v-for="loc in toDelete.locations" :key="loc">{{ loc }}</li>
                </ul>
                <p class="mt-2">Si lo eliminás, esos lugares quedan con el archivo roto (sin imagen o sin descarga).</p>
              </template>
            </UAlert>
            <UCheckbox v-if="toDelete?.locations.length" v-model="confirmedInUse" label="Entiendo que está en uso y quiero eliminarlo igual" />
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
            <UButton
              color="error" label="Sí, eliminar" icon="i-lucide-trash-2" :loading="deleting"
              :disabled="!!toDelete?.locations.length && !confirmedInUse" @click="deleteFile"
            />
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
