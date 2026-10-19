<script setup lang="ts">
const api = useApi()
const { fmtDate } = useFormat()
type LibItem = { id: number, title: string, kind: string, category: string, sizeLabel: string, downloads: number, locked: boolean, createdAt: string }
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
const { data } = await useAsyncData('library', () => api<{ items: LibItem[] }>('/api/library'))
const items = ref<LibItem[]>([])
watchEffect(() => { items.value = data.value?.items || [] })
async function setKind(k: string) {
  active.value = k
  const res = await api<{ items: LibItem[] }>('/api/library', { query: { kind: k } })
  items.value = res.items
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Biblioteca</h1>
      <p class="text-muted">Documentos, guías, plantillas y enlaces compartidos de la comunidad.</p>
    </div>
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
            <UBadge v-if="i.locked" class="mt-2" color="warning" variant="subtle" icon="i-lucide-lock">Solo miembros con acceso premium</UBadge>
            <UBadge v-else class="mt-2" color="success" variant="subtle" icon="i-lucide-download">Disponible</UBadge>
          </div>
        </div>
      </UCard>
    </div>
    <UAlert v-if="!items.length" color="neutral" variant="soft" title="No hay recursos de este tipo todavía" />
  </div>
</template>
