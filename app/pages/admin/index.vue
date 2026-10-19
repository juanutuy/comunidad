<script setup lang="ts">
// Panel de administración (Fase 5; consola dedicada en la Fase 11;
// período y gráficas estilo Dashboard en la Fase 13): cifras reales
// del tenant. El selector de período (7/30/90 días o 12 meses, en la
// URL ?range=) afecta al bloque «En este período», a las gráficas, a
// los canales más activos y a los principales contribuidores; los
// totales de «De un vistazo» y la cola de atención no dependen de él.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const { fmtDateTime, fmtMoney, initials, timeAgo } = useFormat()
const api = useApi()
const route = useRoute()
const router = useRouter()

const RANGE_OPTIONS = [
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
  { value: 365, label: '12 meses' },
]
const range = computed(() => {
  const n = Number(route.query.range)
  return RANGE_OPTIONS.some(o => o.value === n) ? n : 30
})
function setRange(v: number) {
  router.replace({ query: { ...route.query, range: v } })
}
const rangeLabel = computed(() => range.value === 365 ? 'Los 12 meses que elegiste' : `Los ${range.value} días que elegiste`)

interface Stats {
  range: number
  totals: { members: number, onlineNow: number, channels: number, posts: number, comments: number, courses: number, events: number, activeSubscriptions: number, revenueCents: number }
  period: { newMembers: number, posts: number, comments: number, earningsCents: number }
  series: {
    members: { bucket: string, count: number }[]
    postsComments: { bucket: string, posts: number, comments: number }[]
  }
  busiestChannels: { id: number, name: string, slug: string, posts: number, comments: number, total: number }[]
  topContributors: { id: number, name: string, slug: string, avatarUrl: string, earned: number, totalPoints: number, levelName: string, levelIcon: string }[]
  moderation?: { pendingReports: number, inReview: number, joinRequests?: number }
  unanswered: { count: number, items: { id: number, title: string, slug: string, channelSlug: string, channelName: string, authorName: string, createdAt: string }[] }
  generatedAt: string
  recentMembers: { id: number, name: string, slug: string, avatarUrl: string, role: string, createdAt: string }[]
}
// Fase 14: el Panel es solo del administrador. El resto del staff
// que entra por «Panel de administración» aterriza en SU sección:
// el moderador en Moderación y el encargado de cursos en Cursos.
if (user.value?.role === 'moderator') await navigateTo('/admin/moderation')
else if (user.value?.role === 'course_manager') await navigateTo('/admin/courses')

const { data: stats } = await useAsyncData('admin-stats', () =>
  user.value?.role === 'admin' ? api<Stats>(`/api/admin/stats?range=${range.value}`) : Promise.resolve(null), { watch: [range] })

const statCards = computed(() => {
  const t = stats.value?.totals
  if (!t) return []
  return [
    { label: 'Miembros', value: t.members, icon: 'i-lucide-users', to: '/admin/members' },
    { label: 'En línea ahora', value: t.onlineNow, icon: 'i-lucide-radio', to: '/members' },
    { label: 'Canales', value: t.channels, icon: 'i-lucide-hash', to: '/admin/channels' },
    { label: 'Publicaciones', value: t.posts, icon: 'i-lucide-pen-square', to: '/feeds' },
    { label: 'Comentarios', value: t.comments, icon: 'i-lucide-message-circle', to: '/feeds' },
    { label: 'Cursos publicados', value: t.courses, icon: 'i-lucide-graduation-cap', to: '/admin/courses' },
    { label: 'Eventos', value: t.events, icon: 'i-lucide-calendar-days', to: '/admin/events' },
    { label: 'Membresías activas', value: t.activeSubscriptions, icon: 'i-lucide-credit-card', to: '/admin/plans' },
    { label: 'Ingresos confirmados', value: fmtMoney(t.revenueCents), icon: 'i-lucide-banknote', to: '/admin/earnings' },
  ]
})

const periodCards = computed(() => {
  const p = stats.value?.period
  if (!p) return []
  return [
    { label: 'Miembros nuevos', value: p.newMembers, icon: 'i-lucide-user-plus' },
    { label: 'Publicaciones', value: p.posts, icon: 'i-lucide-pen-square' },
    { label: 'Comentarios', value: p.comments, icon: 'i-lucide-message-circle' },
    { label: 'Ingresos', value: fmtMoney(p.earningsCents), icon: 'i-lucide-banknote' },
  ]
})

// Las etiquetas de los buckets llegan como fecha ISO (día/semana) o
// como «AAAA-MM» (mes, rango de 12 meses): se muestran cortas en español.
function fmtBucket(bucket: string) {
  if (range.value === 365) {
    return new Date(`${bucket}-01T00:00:00Z`).toLocaleDateString('es', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  }
  return new Date(`${bucket}T00:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
const memberChart = computed(() => {
  const rows = stats.value?.series.members || []
  return {
    labels: rows.map(r => fmtBucket(r.bucket)),
    series: [{ label: 'Miembros nuevos', color: '#059669', values: rows.map(r => r.count) }],
  }
})
const postsCommentsChart = computed(() => {
  const rows = stats.value?.series.postsComments || []
  return {
    labels: rows.map(r => fmtBucket(r.bucket)),
    series: [
      { label: 'Publicaciones', color: '#2563eb', values: rows.map(r => r.posts) },
      { label: 'Comentarios', color: '#d97706', values: rows.map(r => r.comments) },
    ],
  }
})
const busiestMax = computed(() => Math.max(1, ...(stats.value?.busiestChannels || []).map(c => c.total)))
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Panel</h1>
        <p class="text-muted">El pulso de {{ tenant?.name }}: cifras reales de la comunidad.</p>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="mr-1 text-xs font-medium text-muted">Período</span>
        <UButton
          v-for="opt in RANGE_OPTIONS" :key="opt.value" :label="opt.label" size="sm"
          :variant="range === opt.value ? 'solid' : 'soft'" :color="range === opt.value ? 'primary' : 'neutral'"
          @click="setRange(opt.value)"
        />
      </div>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Tu cuenta no tiene rol de administrador en esta comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <!-- Fase 12: «Necesita tu atención», como el Dashboard de la
           referencia. Decisión: el bloque se muestra SIEMPRE (también
           en cero), para que la moderación tenga un lugar fijo en el
           Panel y no «desaparezca» cuando la cola está limpia.
           Fase 13: tercer ítem, publicaciones sin respuesta, con su
           lista corta dentro del mismo bloque. -->
      <UCard>
        <h2 class="mb-3 flex items-center gap-2 font-bold"><UIcon name="i-lucide-bell-ring" /> Necesita tu atención</h2>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <NuxtLink to="/admin/moderation" class="flex items-center gap-3 rounded-lg border border-default p-3 transition hover:bg-elevated">
            <UIcon name="i-lucide-flag" class="shrink-0 text-xl text-warning" />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ stats?.moderation?.pendingReports ?? 0 }} reportes por revisar</span>
              <span class="block text-xs text-muted">Contenido reportado por los miembros</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="shrink-0 text-muted" />
          </NuxtLink>
          <NuxtLink to="/admin/members/requests" class="flex items-center gap-3 rounded-lg border border-default p-3 transition hover:bg-elevated">
            <UIcon name="i-lucide-user-plus" class="shrink-0 text-xl text-warning" />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ stats?.moderation?.joinRequests ?? 0 }} solicitudes de ingreso</span>
              <span class="block text-xs text-muted">Personas esperando aprobación para entrar</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="shrink-0 text-muted" />
          </NuxtLink>
          <NuxtLink to="/admin/moderation?tab=revision" class="flex items-center gap-3 rounded-lg border border-default p-3 transition hover:bg-elevated">
            <UIcon name="i-lucide-eye" class="shrink-0 text-xl text-warning" />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ stats?.moderation?.inReview ?? 0 }} publicaciones en revisión</span>
              <span class="block text-xs text-muted">Esperando aprobación para publicarse</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="shrink-0 text-muted" />
          </NuxtLink>
          <div class="flex items-center gap-3 rounded-lg border border-default p-3">
            <UIcon name="i-lucide-message-circle-off" class="shrink-0 text-xl text-warning" />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ stats?.unanswered?.count ?? 0 }} publicaciones sin respuesta</span>
              <span class="block text-xs text-muted">Nadie les ha respondido todavía</span>
            </span>
          </div>
        </div>
        <div v-if="stats?.unanswered?.items?.length" class="mt-4 border-t border-default pt-3">
          <h3 class="mb-2 text-sm font-bold">Publicaciones sin respuesta</h3>
          <ul class="space-y-2.5">
            <li v-for="p in stats.unanswered.items" :key="p.id">
              <NuxtLink :to="`/p/${p.channelSlug}/${p.slug}`" class="text-sm font-medium hover:underline">{{ p.title }}</NuxtLink>
              <p class="text-xs text-muted">{{ p.authorName }} · en {{ p.channelName }} · {{ timeAgo(p.createdAt) }}</p>
            </li>
          </ul>
        </div>
      </UCard>

      <section>
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-layout-grid" /> De un vistazo</h2>
        <p class="mb-3 text-sm text-muted">Lo que la comunidad contiene ahora — no depende del período seleccionado.</p>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <NuxtLink v-for="card in statCards" :key="card.label" :to="card.to">
            <UCard class="h-full transition hover:bg-elevated">
              <div class="flex items-center gap-2 text-sm text-muted">
                <UIcon :name="card.icon" /> {{ card.label }}
              </div>
              <p class="mt-1 text-2xl font-bold">{{ card.value }}</p>
            </UCard>
          </NuxtLink>
        </div>
      </section>

      <section>
        <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-calendar-range" /> En este período</h2>
        <p class="mb-3 text-sm text-muted">{{ rangeLabel }}.</p>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <UCard v-for="card in periodCards" :key="card.label">
            <div class="flex items-center gap-2 text-sm text-muted">
              <UIcon :name="card.icon" /> {{ card.label }}
            </div>
            <p class="mt-1 text-2xl font-bold">{{ card.value }}</p>
          </UCard>
        </div>
      </section>

      <div class="grid gap-5 lg:grid-cols-2">
        <UCard>
          <h2 class="mb-1 flex items-center gap-2 font-bold"><UIcon name="i-lucide-user-plus" /> Miembros nuevos</h2>
          <p class="mb-3 text-sm text-muted">Cuándo se unieron, en el período elegido.</p>
          <AdminSeriesChart :series="memberChart.series" :labels="memberChart.labels" empty-text="Nadie se unió en este período" />
        </UCard>
        <UCard>
          <h2 class="mb-1 flex items-center gap-2 font-bold"><UIcon name="i-lucide-messages-square" /> Publicaciones y comentarios</h2>
          <p class="mb-3 text-sm text-muted">La conversación en el tiempo, en el período elegido.</p>
          <AdminSeriesChart :series="postsCommentsChart.series" :labels="postsCommentsChart.labels" empty-text="Sin publicaciones ni comentarios en este período" />
        </UCard>
        <UCard>
          <h2 class="mb-1 flex items-center gap-2 font-bold"><UIcon name="i-lucide-flame" /> Canales más activos</h2>
          <p class="mb-3 text-sm text-muted">Por conversación — publicaciones más comentarios del período.</p>
          <ul v-if="stats?.busiestChannels?.length" class="space-y-3.5">
            <li v-for="c in stats.busiestChannels" :key="c.id">
              <div class="mb-1 flex items-baseline gap-2 text-sm">
                <NuxtLink :to="`/channels/${c.slug}`" class="min-w-0 flex-1 truncate font-medium hover:underline">{{ c.name }}</NuxtLink>
                <span class="shrink-0 text-xs text-muted">{{ c.posts }} publicaciones · {{ c.comments }} comentarios</span>
                <strong class="shrink-0">{{ c.total }}</strong>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-elevated">
                <div class="h-full rounded-full bg-primary" :style="{ width: `${Math.max(3, Math.round((c.total / busiestMax) * 100))}%` }" />
              </div>
            </li>
          </ul>
          <p v-else class="py-6 text-center text-sm text-muted">Sin actividad en los canales en este período.</p>
        </UCard>
        <UCard>
          <h2 class="mb-1 flex items-center gap-2 font-bold"><UIcon name="i-lucide-trophy" /> Principales contribuidores</h2>
          <p class="mb-3 text-sm text-muted">Por puntos ganados en el período.</p>
          <ul v-if="stats?.topContributors?.length" class="space-y-3">
            <li v-for="c in stats.topContributors" :key="c.id" class="flex items-center gap-2.5">
              <UAvatar :src="c.avatarUrl || undefined" :text="initials(c.name)" size="sm" />
              <NuxtLink :to="`/profile/${c.slug}`" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{{ c.name }}</NuxtLink>
              <UBadge color="primary" variant="subtle" size="sm">
                <UIcon :name="c.levelIcon" /> {{ c.levelName }}
              </UBadge>
              <span class="shrink-0 text-sm"><strong>+{{ c.earned }}</strong> <span class="text-xs text-muted">pts</span></span>
            </li>
          </ul>
          <p v-else class="py-6 text-center text-sm text-muted">Nadie ganó puntos en este período.</p>
        </UCard>
      </div>

      <UCard>
        <h2 class="mb-3 flex items-center gap-2 font-bold"><UIcon name="i-lucide-users" /> Miembros recientes</h2>
        <ul class="space-y-2">
          <li v-for="m in stats?.recentMembers || []" :key="m.id" class="flex items-center gap-2.5">
            <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="sm" />
            <NuxtLink :to="`/profile/${m.slug}`" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{{ m.name }}</NuxtLink>
            <UBadge v-if="m.role === 'admin'" color="primary" variant="subtle" size="sm">Admin</UBadge>
            <span class="text-xs text-muted">{{ fmtDateTime(m.createdAt).slice(0, 10) }}</span>
          </li>
        </ul>
      </UCard>

      <p class="text-center text-xs text-muted">
        Datos al {{ stats?.generatedAt ? fmtDateTime(stats.generatedAt) : '—' }} · se actualizan al abrir esta página.
      </p>
    </template>
  </div>
</template>
