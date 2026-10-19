<script setup lang="ts">
// Mis borradores y programados (Fase 5): solo los ve el autor.
// Acciones: publicar ahora, editar (Fase 16-C: en el MISMO
// compositor del feed, en modo edición — esta página ya no tiene
// editor propio) y borrar.
interface DraftView {
  id: number
  slug: string
  title: string
  body: string
  bodyHtml: string
  anonymous: boolean
  kind: string
  status: string
  scheduledAt: string
  createdAt: string
  allowComments: boolean
  pinned: boolean
  mediaType: string
  mediaUrl: string
  attachmentName: string
  channel: { slug: string, name: string }
  options: string[]
}

const { user } = useAuth()
const { fmtDateTime } = useFormat()
const api = useApi()
const toast = useToast()

const { data, refresh } = await useAsyncData('my-drafts', () =>
  user.value ? api<{ drafts: DraftView[] }>('/api/drafts') : Promise.resolve({ drafts: [] as DraftView[] }))

// Fase 16-C: la edición abre el compositor compartido (anfitrión en
// el layout) precargado con el borrador/programado; al guardar, el
// aviso refresca esta lista.
const { openPostEditor, saved: editorSaved } = usePostEditor()
function startEdit(d: DraftView) {
  openPostEditor({
    id: d.id,
    title: d.title,
    body: d.body,
    bodyHtml: d.bodyHtml || '',
    kind: d.kind,
    status: d.status,
    channelSlug: d.channel.slug,
    channelName: d.channel.name,
    anonymous: d.anonymous,
    allowComments: d.allowComments !== false,
    pinned: d.pinned,
    scheduledAt: d.scheduledAt || '',
    mediaType: d.mediaType || 'none',
    mediaUrl: d.mediaUrl || '',
    attachmentName: d.attachmentName || '',
    pollOptions: d.options || [],
  })
}
watch(editorSaved, (n) => { if (n) refresh() })

async function publishNow(d: DraftView) {
  try {
    const res = await api<{ review?: boolean }>(`/api/posts/${d.id}/publish`, { method: 'POST' })
    // Fase 12: con la revisión previa encendida, «publicar» un
    // borrador de un miembro lo manda a la cola de revisión.
    if (res.review)
      toast.add({ title: 'Enviado a revisión', description: 'Un administrador lo va a revisar antes de que aparezca en el feed.', color: 'success' })
    else
      toast.add({ title: 'Publicado', description: 'Tu publicación ya se ve en el canal.', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo publicar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

const toDelete = ref<DraftView | null>(null)
async function deleteDraft() {
  if (!toDelete.value) return
  try {
    await api(`/api/posts/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Borrador eliminado', color: 'success' })
    toDelete.value = null
    await refresh()
  }
  catch { toast.add({ title: 'No se pudo eliminar', color: 'error' }) }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Mis borradores</h1>
      <p class="text-muted">Tus publicaciones guardadas y programadas. Solo vos las ves.</p>
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" title="Iniciá sesión para ver tus borradores" />
    <template v-else>
      <UCard v-for="d in data?.drafts || []" :key="d.id">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <UBadge :color="d.status === 'draft' ? 'neutral' : 'warning'" variant="soft" :icon="d.status === 'draft' ? 'i-lucide-file-edit' : 'i-lucide-calendar-clock'">
            {{ d.status === 'draft' ? 'Borrador' : 'Programado' }}
          </UBadge>
          <UBadge v-if="d.kind === 'poll'" color="primary" variant="subtle" icon="i-lucide-bar-chart-3">Encuesta</UBadge>
          <UBadge v-if="d.anonymous" color="neutral" variant="subtle" icon="i-lucide-venetian-mask">Anónimo</UBadge>
          <span class="text-muted">en {{ d.channel.name }}</span>
          <span v-if="d.status === 'scheduled'" class="text-muted">· se publica el {{ fmtDateTime(d.scheduledAt) }}</span>
        </div>
        <h2 class="mt-2 font-bold">{{ d.title }}</h2>
        <p class="mt-1 line-clamp-2 text-sm text-muted">{{ d.body }}</p>
        <ul v-if="d.options.length" class="mt-2 list-inside list-disc text-sm text-muted">
          <li v-for="o in d.options" :key="o">{{ o }}</li>
        </ul>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton size="sm" label="Publicar ahora" icon="i-lucide-send" @click="publishNow(d)" />
          <UButton size="sm" color="neutral" variant="soft" label="Editar" icon="i-lucide-pen-line" @click="startEdit(d)" />
          <UButton size="sm" color="error" variant="ghost" label="Borrar" icon="i-lucide-trash-2" @click="toDelete = d" />
        </div>
      </UCard>
      <UAlert v-if="!(data?.drafts?.length)" color="neutral" variant="soft" title="No tenés borradores ni programados" description="Desde el compositor del feed podés guardar un borrador o programar una publicación para más tarde." />
    </template>

    <UModal :open="!!toDelete" title="Borrar borrador" description="Esta acción no se puede deshacer." @update:open="(v: boolean) => { if (!v) toDelete = null }">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
          <UButton color="error" label="Sí, borrar" icon="i-lucide-trash-2" @click="deleteDraft" />
        </div>
      </template>
    </UModal>
  </div>
</template>
