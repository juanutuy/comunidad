<script setup lang="ts">
// Moderación (Fase 12): la cola de la consola, como en la referencia
// (Reports + Content → Post «On Review»). Dos pestañas con
// contadores:
//   - Reportes: reportes de miembros agrupados por objetivo (las
//     acciones se aplican al objetivo), pendientes primero, con el
//     historial de cerrados debajo.
//   - En revisión: publicaciones que esperan aprobación porque el
//     tenant activó la revisión previa. Aprobar publica; rechazar
//     devuelve el post a los borradores del autor (no se borra).
// «Edit Review» (revisión de EDICIONES) no existe en esta fase: es
// una diferencia documentada en el README, no una pestaña vacía.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const { fmtDateTime, initials } = useFormat()
const api = useApi()
const toast = useToast()
const route = useRoute()

interface UserMini { id: number, name: string, slug: string, avatarUrl: string }
interface ReportView {
  id: number, targetType: 'post' | 'comment', targetId: number
  reason: string, note: string, status: string, action: string
  createdAt: string, resolvedAt: string
  reporter: UserMini | null, resolvedBy: UserMini | null
  target: { exists: boolean, title: string, excerpt: string, link: string, channelName: string, author: UserMini | null }
}
interface ReviewPostView {
  id: number, title: string, body: string, bodyHtml: string, slug: string, kind: string, createdAt: string
  channel: { slug: string, name: string }, author: UserMini | null
}
interface ModerationData { counts: { pendingReports: number, inReview: number }, reports: ReportView[], reviewPosts: ReviewPostView[] }

const { data, refresh } = await useAsyncData('admin-moderation', () =>
  ['admin', 'moderator'].includes(user.value?.role || '') ? api<ModerationData>('/api/admin/moderation') : Promise.resolve(null))

const tab = computed(() => (route.query.tab === 'revision' ? 'revision' : 'reportes'))
const subItems = computed(() => [
  { value: 'reportes', label: 'Reportes', icon: 'i-lucide-flag', badge: data.value?.counts.pendingReports || 0 },
  { value: 'revision', label: 'En revisión', icon: 'i-lucide-eye', badge: data.value?.counts.inReview || 0 },
])

const reasonLabels: Record<string, string> = {
  spam: 'Spam',
  acoso: 'Acoso',
  inapropiado: 'Contenido inapropiado',
  otro: 'Otro motivo',
}

// Pendientes agrupados por objetivo (tipo + id): un mismo contenido
// puede tener varios reportes y se resuelve una sola vez.
const pendingGroups = computed(() => {
  const groups = new Map<string, { key: string, targetType: string, first: ReportView, reports: ReportView[] }>()
  for (const r of data.value?.reports || []) {
    if (r.status !== 'pending') continue
    const key = `${r.targetType}-${r.targetId}`
    if (!groups.has(key)) groups.set(key, { key, targetType: r.targetType, first: r, reports: [] })
    groups.get(key)!.reports.push(r)
  }
  return [...groups.values()]
})
const closedReports = computed(() => (data.value?.reports || []).filter(r => r.status !== 'pending'))

const busy = ref('')
async function resolveGroup(group: { first: ReportView }, outcome: 'dismissed' | 'resolved' | 'remove') {
  busy.value = `${group.first.id}-${outcome}`
  try {
    await api(`/api/admin/moderation/reports/${group.first.id}/resolve`, { method: 'POST', body: { outcome } })
    toast.add({
      title: outcome === 'remove' ? 'Contenido eliminado' : outcome === 'dismissed' ? 'Reporte descartado' : 'Reporte resuelto',
      color: 'success',
    })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo completar la acción', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { busy.value = '' }
}

async function reviewAction(post: ReviewPostView, action: 'approve' | 'reject') {
  busy.value = `${post.id}-${action}`
  try {
    await api(`/api/admin/moderation/posts/${post.id}/${action}`, { method: 'POST' })
    toast.add({
      title: action === 'approve' ? 'Publicación aprobada y publicada' : 'Publicación devuelta a los borradores del autor',
      color: 'success',
    })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo completar la acción', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { busy.value = '' }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Moderación</h1>
      <p class="text-muted">Reportes de la comunidad y publicaciones en revisión de {{ tenant?.name }}.</p>
    </div>
    <UAlert v-if="user && !['admin', 'moderator'].includes(user.role || '')" color="warning" variant="soft" title="Solo moderación" description="Tu cuenta no tiene rol de administrador ni de moderador en esta comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <AdminQueueTabs :items="subItems" />

      <!-- ============ REPORTES ============ -->
      <div v-if="tab === 'reportes'" class="space-y-4">
        <p v-if="!pendingGroups.length" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-check-circle-2" class="text-green-500" /> No hay reportes pendientes. La cola está limpia.
        </p>
        <UCard v-for="g in pendingGroups" :key="g.key">
          <div class="flex items-start gap-3">
            <UBadge :color="g.targetType === 'post' ? 'primary' : 'neutral'" variant="subtle" class="shrink-0">
              {{ g.targetType === 'post' ? 'Publicación' : 'Comentario' }}
            </UBadge>
            <div class="min-w-0 flex-1">
              <template v-if="g.first.target.exists">
                <NuxtLink v-if="g.first.target.link" :to="g.first.target.link" class="font-semibold hover:underline">
                  {{ g.first.target.title }}
                </NuxtLink>
                <span v-else class="font-semibold">{{ g.first.target.title }}</span>
                <p class="mt-1 line-clamp-3 text-sm text-muted">{{ g.first.target.excerpt }}</p>
                <p class="mt-1 text-xs text-muted">
                  en {{ g.first.target.channelName }} ·
                  autor: <NuxtLink v-if="g.first.target.author" :to="`/profile/${g.first.target.author.slug}`" class="hover:underline">{{ g.first.target.author.name }}</NuxtLink><span v-else>—</span>
                </p>
              </template>
              <p v-else class="flex items-center gap-2 text-sm text-muted">
                <UIcon name="i-lucide-trash-2" /> Este contenido ya fue eliminado. Solo queda cerrar el reporte.
              </p>

              <ul class="mt-3 space-y-2 border-t border-default pt-3">
                <li v-for="r in g.reports" :key="r.id" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <UAvatar :src="r.reporter?.avatarUrl || undefined" :text="r.reporter ? initials(r.reporter.name) : undefined" size="xs" />
                  <span><strong>{{ r.reporter?.name || 'Miembro' }}</strong> reportó por</span>
                  <UBadge color="warning" variant="subtle" size="sm">{{ reasonLabels[r.reason] || r.reason }}</UBadge>
                  <span class="text-xs text-muted">{{ fmtDateTime(r.createdAt) }}</span>
                  <span v-if="r.note" class="w-full text-muted">«{{ r.note }}»</span>
                </li>
              </ul>

              <div class="mt-4 flex flex-wrap gap-2">
                <UButton
                  v-if="g.first.target.exists" size="sm" color="error" variant="soft" icon="i-lucide-trash-2"
                  label="Eliminar contenido" :loading="busy === `${g.first.id}-remove`" @click="resolveGroup(g, 'remove')"
                />
                <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-check" label="Resolver sin acción" :loading="busy === `${g.first.id}-resolved`" @click="resolveGroup(g, 'resolved')" />
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x" label="Descartar" :loading="busy === `${g.first.id}-dismissed`" @click="resolveGroup(g, 'dismissed')" />
              </div>
            </div>
          </div>
        </UCard>

        <div v-if="closedReports.length" class="space-y-2 pt-2">
          <h2 class="text-sm font-bold text-muted">Historial</h2>
          <div v-for="r in closedReports" :key="r.id" class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-default px-3 py-2 text-sm">
            <UBadge :color="r.status === 'dismissed' ? 'neutral' : 'success'" variant="subtle" size="sm">
              {{ r.status === 'dismissed' ? 'Descartado' : r.action === 'content_removed' ? 'Contenido eliminado' : 'Resuelto' }}
            </UBadge>
            <span class="min-w-0 flex-1 truncate">{{ r.target.exists ? r.target.title : 'Contenido eliminado' }}</span>
            <span class="text-xs text-muted">
              {{ reasonLabels[r.reason] || r.reason }} · reportó {{ r.reporter?.name || '—' }} · cerró {{ r.resolvedBy?.name || '—' }} el {{ fmtDateTime(r.resolvedAt) }}
            </span>
          </div>
        </div>
      </div>

      <!-- ============ EN REVISIÓN ============ -->
      <div v-else class="space-y-4">
        <p v-if="!data?.reviewPosts.length" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-check-circle-2" class="text-green-500" /> No hay publicaciones esperando revisión.
        </p>
        <UCard v-for="p in data?.reviewPosts || []" :key="p.id">
          <div class="flex items-start gap-3">
            <UAvatar :src="p.author?.avatarUrl || undefined" :text="p.author ? initials(p.author.name) : undefined" size="md" class="shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm">
                <NuxtLink v-if="p.author" :to="`/profile/${p.author.slug}`" class="font-semibold hover:underline">{{ p.author.name }}</NuxtLink>
                <span class="text-muted"> · en </span>
                <NuxtLink :to="`/channels/${p.channel.slug}`" class="font-medium text-primary hover:underline">{{ p.channel.name }}</NuxtLink>
                <span class="text-muted"> · {{ fmtDateTime(p.createdAt) }}</span>
                <UBadge v-if="p.kind === 'poll'" color="primary" variant="subtle" size="sm" class="ml-2">Encuesta</UBadge>
              </p>
              <NuxtLink :to="`/p/${p.channel.slug}/${p.slug}`" class="mt-1 block text-lg font-bold leading-snug hover:underline">{{ p.title }}</NuxtLink>
              <div v-if="p.bodyHtml" class="rich-content mt-1 line-clamp-4 text-sm text-muted" v-html="p.bodyHtml" />
              <p v-else class="mt-1 line-clamp-4 whitespace-pre-line text-sm text-muted">{{ p.body }}</p>
              <div class="mt-4 flex flex-wrap gap-2">
                <UButton size="sm" color="primary" icon="i-lucide-check" label="Aprobar y publicar" :loading="busy === `${p.id}-approve`" @click="reviewAction(p, 'approve')" />
                <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-undo-2" label="Rechazar (vuelve a borradores)" :loading="busy === `${p.id}-reject`" @click="reviewAction(p, 'reject')" />
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
