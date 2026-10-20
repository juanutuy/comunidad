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
  album?: string
  channel: { slug: string, name: string }
  options: string[]
}

const { user } = useAuth()
const { t } = useI18n()
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
    album: d.album || '',
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
      toast.add({ title: t('drafts.sentToReview'), description: t('drafts.sentToReviewText'), color: 'success' })
    else
      toast.add({ title: t('drafts.publishedToast'), description: t('drafts.publishedToastText'), color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: t('drafts.publishFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

const toDelete = ref<DraftView | null>(null)
async function deleteDraft() {
  if (!toDelete.value) return
  try {
    await api(`/api/posts/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: t('drafts.deletedToast'), color: 'success' })
    toDelete.value = null
    await refresh()
  }
  catch { toast.add({ title: t('drafts.deleteFailed'), color: 'error' }) }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">{{ t('drafts.title') }}</h1>
      <p class="text-muted">{{ t('drafts.subtitle') }}</p>
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" :title="t('drafts.loginTitle')" />
    <template v-else>
      <UCard v-for="d in data?.drafts || []" :key="d.id">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <UBadge :color="d.status === 'draft' ? 'neutral' : 'warning'" variant="soft" :icon="d.status === 'draft' ? 'i-lucide-file-edit' : 'i-lucide-calendar-clock'">
            {{ d.status === 'draft' ? t('drafts.draftBadge') : t('drafts.scheduledBadge') }}
          </UBadge>
          <UBadge v-if="d.kind === 'poll'" color="primary" variant="subtle" icon="i-lucide-bar-chart-3">{{ t('post.poll') }}</UBadge>
          <UBadge v-if="d.anonymous" color="neutral" variant="subtle" icon="i-lucide-venetian-mask">{{ t('post.anonymous') }}</UBadge>
          <span class="text-muted">{{ t('drafts.inChannel', { name: d.channel.name }) }}</span>
          <span v-if="d.status === 'scheduled'" class="text-muted">{{ t('drafts.publishesOn', { date: fmtDateTime(d.scheduledAt) }) }}</span>
        </div>
        <h2 class="mt-2 font-bold">{{ d.title }}</h2>
        <p class="mt-1 line-clamp-2 text-sm text-muted">{{ d.body }}</p>
        <ul v-if="d.options.length" class="mt-2 list-inside list-disc text-sm text-muted">
          <li v-for="o in d.options" :key="o">{{ o }}</li>
        </ul>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton size="sm" :label="t('drafts.publishNow')" icon="i-lucide-send" @click="publishNow(d)" />
          <UButton size="sm" color="neutral" variant="soft" :label="t('common.edit')" icon="i-lucide-pen-line" @click="startEdit(d)" />
          <UButton size="sm" color="error" variant="ghost" :label="t('common.delete')" icon="i-lucide-trash-2" @click="toDelete = d" />
        </div>
      </UCard>
      <UAlert v-if="!(data?.drafts?.length)" color="neutral" variant="soft" :title="t('drafts.emptyTitle')" :description="t('drafts.emptyText')" />
    </template>

    <UModal :open="!!toDelete" :title="t('drafts.deleteTitle')" :description="t('drafts.deleteText')" @update:open="(v: boolean) => { if (!v) toDelete = null }">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="toDelete = null" />
          <UButton color="error" :label="t('drafts.yesDelete')" icon="i-lucide-trash-2" @click="deleteDraft" />
        </div>
      </template>
    </UModal>
  </div>
</template>
