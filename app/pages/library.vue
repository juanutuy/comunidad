<script setup lang="ts">
// Biblioteca (Fase 2): además de los registros de referencia de la
// semilla, el admin puede subir archivos reales (R2 / disco local) y los
// miembros los descargan por /api/library/:id/download, que respeta el
// candado premium.
const api = useApi()
const { user } = useAuth()
const { t } = useI18n()
const toast = useToast()
const { fmtDate } = useFormat()
type LibItem = { id: number, title: string, kind: string, category: string, sizeLabel: string, downloads: number, locked: boolean, createdAt: string, hasFile: boolean, canDownload: boolean, folderId: number | null, archived: boolean }
const kinds = computed(() => [
  { label: t('library.kindAll'), value: 'all' },
  { label: t('library.kindPdf'), value: 'pdf' },
  { label: t('library.kindDoc'), value: 'doc' },
  { label: t('library.kindVideo'), value: 'video' },
  { label: t('library.kindImage'), value: 'image' },
  { label: t('library.kindAudio'), value: 'audio' },
  { label: t('library.kindLink'), value: 'link' },
])
const kindIcons: Record<string, string> = { pdf: 'i-lucide-file-text', doc: 'i-lucide-file', video: 'i-lucide-file-video', image: 'i-lucide-file-image', audio: 'i-lucide-file-audio', link: 'i-lucide-link' }
const active = ref('all')
const q = ref('')
const category = ref('all')
const folder = ref(0)
const showArchived = ref(false)
const folderName = ref('')
const busy = ref(false)
const sort = ref('newest')
const view = ref('grid')
const showUpload = ref(false)
const sortOptions = computed(() => [{ value: 'newest', label: t('improvements.newest') }, { value: 'oldest', label: t('improvements.oldest') }, { value: 'name', label: t('improvements.name') }])
const { data, refresh } = await useAsyncData('library', () => api<{ items: LibItem[], folders: { id: number, name: string }[] }>('/api/library', { query: { archived: showArchived.value ? '1' : '0' } }), { watch: [showArchived] })
const folderOptions = computed(() => [{ value: 0, label: t('improvements.all') }, { value: -1, label: t('improvements.noFolder') }, ...(data.value?.folders || []).map(f => ({ value: f.id, label: f.name }))])
const moveOptions = computed(() => folderOptions.value.filter(f => f.value !== 0))
async function updateItem(id: number, body: Record<string, unknown>) {
  busy.value = true
  try { await api(`/api/library/${id}`, { method: 'PUT', body }); await refresh() }
  catch { toast.add({ title: t('improvements.loadFailed'), color: 'error' }) }
  finally { busy.value = false }
}
async function createFolder() {
  if (!folderName.value.trim()) return
  busy.value = true
  try { await api('/api/library/folders', { method: 'POST', body: { name: folderName.value } }); folderName.value = ''; await refresh() }
  catch { toast.add({ title: t('improvements.loadFailed'), color: 'error' }) }
  finally { busy.value = false }
}
const categories = computed(() => [{ value: 'all', label: t('improvements.all') }, ...[...new Set((data.value?.items || []).map(i => i.category))].filter(Boolean).map(value => ({ value, label: value }))])
const items = computed(() => [...(data.value?.items || [])].filter(i => (!folder.value || (folder.value === -1 ? !i.folderId : i.folderId === folder.value)) && (active.value === 'all' || i.kind === active.value) && (category.value === 'all' || i.category === category.value) && i.title.toLocaleLowerCase().includes(q.value.trim().toLocaleLowerCase())).sort((a, b) => sort.value === 'name' ? a.title.localeCompare(b.title) : sort.value === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)))
async function setKind(k: string) {
  active.value = k

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
    toast.add({ title: t('library.uploadedToast'), color: 'success' })
    upForm.title = ''; upForm.category = ''; upForm.locked = false; upFile.value = null
    await refresh()
    if (active.value !== 'all') await setKind(active.value)
  }
  catch (e) {
    toast.add({ title: t('library.uploadFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploading.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">{{ t('library.title') }}</h1>
      <p class="text-muted">{{ t('library.subtitle') }}</p>
    </div>

    <UButton v-if="user?.role === 'admin'" :label="t('improvements.addResource')" icon="i-lucide-plus" :aria-expanded="showUpload" @click="showUpload = !showUpload" />
    <UCard v-if="user?.role === 'admin' && showUpload">
      <h2 class="mb-3 flex items-center gap-2 font-semibold"><UIcon name="i-lucide-upload" /> {{ t('library.uploadTitle') }}</h2>
      <div class="space-y-3">
        <UFormField :label="t('library.fileLabel')">
          <input type="file" class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-2 file:text-sm file:font-medium" @change="onUpFile">
        </UFormField>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField :label="t('library.titleLabel')">
            <UInput v-model="upForm.title" :placeholder="t('library.titlePlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="t('library.categoryLabel')">
            <UInput v-model="upForm.category" :placeholder="t('library.categoryPlaceholder')" class="w-full" />
          </UFormField>
        </div>
        <UCheckbox v-model="upForm.locked" :label="t('library.premiumOnly')" />
        <div class="flex justify-end">
          <UButton :label="t('library.uploadButton')" icon="i-lucide-upload" :loading="uploading" :disabled="!upFile" @click="upload" />
        </div>
      </div>
    </UCard>

    <div class="flex flex-wrap gap-2">
      <UButton v-for="k in kinds" :key="k.value" size="sm" :color="active === k.value ? 'primary' : 'neutral'" :variant="active === k.value ? 'solid' : 'soft'" :label="k.label" @click="setKind(k.value)" />
    </div>
    <form v-if="user?.role === 'admin'" class="flex flex-wrap items-center gap-3" @submit.prevent="createFolder">
      <UInput v-model="folderName" maxlength="100" :placeholder="t('improvements.newFolder')" :aria-label="t('improvements.newFolder')" />
      <UButton type="submit" :loading="busy" :disabled="!folderName.trim()" variant="soft" icon="i-lucide-folder-plus" :label="t('improvements.newFolder')" />
      <UCheckbox v-model="showArchived" :label="t('improvements.showArchived')" />
    </form>
    <div class="flex flex-wrap gap-3">
      <UInput v-model="q" :placeholder="t('improvements.search')" :aria-label="t('improvements.search')" icon="i-lucide-search" />
      <USelect v-model="folder" :items="folderOptions" :aria-label="t('improvements.folder')" />
      <USelect v-model="category" :items="categories" :aria-label="t('improvements.category')" />
      <USelect v-model="sort" :items="sortOptions" :aria-label="t('improvements.sort')" />
      <UButton :icon="view === 'grid' ? 'i-lucide-list' : 'i-lucide-grid-2x2'" :aria-label="view === 'grid' ? t('improvements.list') : t('improvements.grid')" variant="soft" @click="view = view === 'grid' ? 'list' : 'grid'" />
    </div>
    <div class="grid gap-4" :class="view === 'grid' ? 'sm:grid-cols-2' : ''">
      <UCard v-for="i in items" :id="`resource-${i.id}`" :key="i.id">
        <div class="flex items-start gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-elevated">
            <UIcon :name="kindIcons[i.kind] || 'i-lucide-file'" class="text-xl" />
          </span>
          <div class="min-w-0 flex-1">
            <div v-if="user?.role === 'admin'" class="mb-3 flex flex-wrap gap-2">
              <USelect :model-value="i.folderId || -1" :items="moveOptions" :disabled="busy" :aria-label="t('improvements.folder')" @update:model-value="value => updateItem(i.id, { folderId: Number(value) === -1 ? null : Number(value) })" />
              <UButton size="sm" color="neutral" variant="ghost" :disabled="busy" :label="i.archived ? t('improvements.restore') : t('improvements.archive')" @click="updateItem(i.id, { archived: !i.archived })" />
            </div>
            <p class="font-semibold leading-snug">{{ i.title }}</p>
            <p class="mt-1 text-xs text-muted">{{ i.category }} · {{ i.sizeLabel }} · {{ fmtDate(i.createdAt) }} · {{ t('library.downloadsCount', { count: i.downloads }) }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <UButton v-if="i.hasFile && i.canDownload" :to="`/api/library/${i.id}/download`" external size="xs" icon="i-lucide-download" :label="t('library.download')" />
              <UBadge v-if="i.locked && !i.canDownload" color="warning" variant="subtle" icon="i-lucide-lock">{{ t('library.premiumBadge') }}</UBadge>
              <UBadge v-else-if="i.hasFile" color="success" variant="subtle" icon="i-lucide-download">{{ t('library.availableBadge') }}</UBadge>
              <UBadge v-else color="neutral" variant="subtle" icon="i-lucide-info">{{ t('library.referenceBadge') }}</UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </div>
    <UAlert v-if="!items.length" color="neutral" variant="soft" :title="t('library.emptyTitle')" />
  </div>
</template>
