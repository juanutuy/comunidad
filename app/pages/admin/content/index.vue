<script setup lang="ts">
// Contenido → Publicaciones (Fase 16): la tabla central con TODOS
// los posts de la comunidad, como Content → Post de la referencia
// pero con nuestros estados reales: Publicados, Borradores,
// Programados y En revisión. (El «Edit Review» de la referencia no
// existe acá: diferencia documentada en el README, Fase 12.)
// Acceso: admin y moderator — la API también lo exige.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const { fmtDateTime } = useFormat()
const api = useApi()
const toast = useToast()

interface ContentPost {
  id: number, slug: string, title: string, status: string, kind: string, anonymous: boolean, edited: boolean
  createdAt: string, scheduledAt: string
  author: { name: string, slug: string }, channel: { name: string, slug: string }
  reactions: number, comments: number
}
interface ContentData {
  counts: { all: number, published: number, draft: number, scheduled: number, review: number }
  total: number, limit: number, offset: number, posts: ContentPost[]
}

const canUse = computed(() => ['admin', 'moderator'].includes(user.value?.role || ''))
const search = ref('')
const statusFilter = ref('all')
const page = ref(0)
const PAGE_SIZE = 25

const query = computed(() => {
  const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page.value * PAGE_SIZE) })
  if (search.value.trim()) p.set('q', search.value.trim())
  if (statusFilter.value !== 'all') p.set('status', statusFilter.value)
  return `/api/admin/content/posts?${p.toString()}`
})
const { data, refresh } = await useAsyncData('admin-content-posts', () =>
  canUse.value ? api<ContentData>(query.value) : Promise.resolve(null), { watch: [query] })

const chips = computed(() => [
  { value: 'all', label: 'Todos', count: data.value?.counts.all ?? 0 },
  { value: 'published', label: 'Publicados', count: data.value?.counts.published ?? 0 },
  { value: 'draft', label: 'Borradores', count: data.value?.counts.draft ?? 0 },
  { value: 'scheduled', label: 'Programados', count: data.value?.counts.scheduled ?? 0 },
  { value: 'review', label: 'En revisión', count: data.value?.counts.review ?? 0 },
])
watch([search, statusFilter], () => { page.value = 0 })
const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total || 0) / PAGE_SIZE)))

const statusBadge: Record<string, { label: string, color: 'success' | 'neutral' | 'warning' | 'info' }> = {
  published: { label: 'Publicado', color: 'success' },
  draft: { label: 'Borrador', color: 'neutral' },
  scheduled: { label: 'Programado', color: 'warning' },
  review: { label: 'En revisión', color: 'info' },
}

function postLink(p: ContentPost) {
  return `/p/${p.channel.slug}/${p.slug}`
}

async function publish(p: ContentPost) {
  try {
    await api(`/api/admin/content/posts/${p.id}/publish`, { method: 'POST' })
    toast.add({ title: 'Publicación publicada', description: `«${p.title}» ya se ve en la comunidad.`, color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo publicar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

const toDelete = ref<ContentPost | null>(null)
const deleting = ref(false)
async function deletePost() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await api(`/api/admin/content/posts/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Publicación eliminada', description: 'Se borraron también sus comentarios, reacciones y guardados.', color: 'success' })
    toDelete.value = null
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo eliminar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { deleting.value = false }
}

function rowMenuItems(p: ContentPost) {
  const items: { label: string, icon: string, to?: string, onSelect?: () => void | Promise<void>, color?: 'error' }[] = [
    { label: 'Ver', icon: 'i-lucide-eye', to: postLink(p) },
  ]
  // «Editar» lleva al editor que ya existe: los borradores y
  // programados se editan en «Mis borradores» (del autor); el resto
  // no tiene editor posterior a la publicación.
  if (p.status === 'draft' || p.status === 'scheduled')
    items.push({ label: 'Editar en Mis borradores', icon: 'i-lucide-pencil', to: '/drafts' })
  if (p.status === 'review')
    items.push({ label: 'Revisar en Moderación', icon: 'i-lucide-shield-alert', to: '/admin/moderation?tab=revision' })
  if (p.status === 'draft' || p.status === 'scheduled')
    items.push({ label: 'Publicar', icon: 'i-lucide-send', onSelect: () => publish(p) })
  items.push({ label: 'Eliminar', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { toDelete.value = p } })
  return [items]
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Contenido</h1>
      <p class="text-muted">Todas las publicaciones de {{ tenant?.name }} en un solo lugar.</p>
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta del equipo" />
    <UAlert v-else-if="!canUse" color="warning" variant="soft" title="Sin acceso" description="Esta sección es para administradores y moderadores." />
    <template v-else>
      <ContentSubNav />
      <div class="flex flex-wrap items-center gap-2">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Buscar por título o autor…" class="w-full sm:w-72" />
        <span class="flex-1" />
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="chip in chips" :key="chip.value" size="sm"
            :color="statusFilter === chip.value ? 'primary' : 'neutral'"
            :variant="statusFilter === chip.value ? 'soft' : 'ghost'"
            :label="`${chip.label} · ${chip.count}`"
            @click="statusFilter = chip.value"
          />
        </div>
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[880px] text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs tracking-wider text-muted uppercase">
                <th class="px-4 py-3 font-semibold">Título</th>
                <th class="px-4 py-3 font-semibold">Estado</th>
                <th class="px-4 py-3 font-semibold">Autor</th>
                <th class="px-4 py-3 font-semibold">Canal</th>
                <th class="px-4 py-3 text-right font-semibold">Reacciones</th>
                <th class="px-4 py-3 text-right font-semibold">Comentarios</th>
                <th class="px-4 py-3 font-semibold">Publicado</th>
                <th class="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data?.posts || []" :key="p.id" class="border-b border-default/60 last:border-0 hover:bg-elevated/50">
                <td class="max-w-72 px-4 py-3">
                  <NuxtLink :to="postLink(p)" class="font-medium hover:underline">{{ p.title }}</NuxtLink>
                  <span class="mt-1 flex flex-wrap gap-1">
                    <UBadge v-if="p.edited" color="neutral" variant="subtle" size="sm">Editado</UBadge>
                    <UBadge v-if="p.kind === 'poll'" color="primary" variant="subtle" size="sm">Encuesta</UBadge>
                    <UBadge v-if="p.anonymous" color="neutral" variant="subtle" size="sm">Anónimo</UBadge>
                  </span>
                </td>
                <td class="px-4 py-3">
                  <UBadge :color="statusBadge[p.status]?.color || 'neutral'" variant="subtle">{{ statusBadge[p.status]?.label || p.status }}</UBadge>
                  <p v-if="p.status === 'scheduled' && p.scheduledAt" class="mt-1 text-xs text-muted">{{ fmtDateTime(p.scheduledAt) }}</p>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">{{ p.author.name }}</td>
                <td class="px-4 py-3 whitespace-nowrap"># {{ p.channel.name }}</td>
                <td class="px-4 py-3 text-right">{{ p.reactions }}</td>
                <td class="px-4 py-3 text-right">{{ p.comments }}</td>
                <td class="px-4 py-3 whitespace-nowrap">{{ fmtDateTime(p.createdAt) }}</td>
                <td class="px-4 py-3 text-right">
                  <UDropdownMenu :items="rowMenuItems(p)">
                    <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" aria-label="Acciones de la publicación" />
                  </UDropdownMenu>
                </td>
              </tr>
              <tr v-if="!(data?.posts?.length)">
                <td colspan="8" class="px-4 py-10 text-center text-muted">No hay publicaciones con este filtro.</td>
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

      <UModal :open="!!toDelete" title="Eliminar publicación" :description="toDelete ? `Se elimina «${toDelete.title}» con sus comentarios, reacciones, guardados y votos. No se puede deshacer.` : ''" @update:open="(v: boolean) => { if (!v) toDelete = null }">
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
            <UButton color="error" label="Sí, eliminar" icon="i-lucide-trash-2" :loading="deleting" @click="deletePost" />
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
