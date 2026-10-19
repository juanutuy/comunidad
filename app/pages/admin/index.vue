<script setup lang="ts">
// Panel de administración (Fase 5; consola dedicada en la Fase 11):
// estadísticas reales del tenant, actividad reciente y listas de
// atención. Los ajustes de la comunidad viven en su propia sección
// (/admin/settings) desde la Fase 11.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const { fmtDateTime, fmtMoney, initials } = useFormat()
const api = useApi()

interface Stats {
  totals: { members: number, onlineNow: number, channels: number, posts: number, comments: number, courses: number, events: number, activeSubscriptions: number, revenueCents: number }
  activity30: { newMembers: number, posts: number, comments: number }
  postsWithoutComments: { id: number, title: string, slug: string, channelSlug: string, channelName: string, authorName: string, createdAt: string }[]
  recentMembers: { id: number, name: string, slug: string, avatarUrl: string, role: string, createdAt: string }[]
}
const { data: stats } = await useAsyncData('admin-stats', () =>
  user.value?.role === 'admin' ? api<Stats>('/api/admin/stats') : Promise.resolve(null))

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
    { label: 'Ingresos confirmados', value: fmtMoney(t.revenueCents), icon: 'i-lucide-banknote', to: '/admin/plans' },
  ]
})
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Panel</h1>
      <p class="text-muted">El pulso de {{ tenant?.name }}: cifras reales de la comunidad.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Tu cuenta no tiene rol de administrador en esta comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
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
      <div class="grid gap-5 lg:grid-cols-2">
        <UCard>
          <h2 class="mb-3 flex items-center gap-2 font-bold"><UIcon name="i-lucide-activity" /> Últimos 30 días</h2>
          <ul class="space-y-2 text-sm">
            <li class="flex justify-between"><span class="text-muted">Miembros nuevos</span><strong>{{ stats?.activity30.newMembers ?? 0 }}</strong></li>
            <li class="flex justify-between"><span class="text-muted">Publicaciones nuevas</span><strong>{{ stats?.activity30.posts ?? 0 }}</strong></li>
            <li class="flex justify-between"><span class="text-muted">Comentarios nuevos</span><strong>{{ stats?.activity30.comments ?? 0 }}</strong></li>
          </ul>
          <h3 class="mt-5 mb-2 text-sm font-bold">Miembros recientes</h3>
          <ul class="space-y-2">
            <li v-for="m in stats?.recentMembers || []" :key="m.id" class="flex items-center gap-2.5">
              <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="sm" />
              <NuxtLink :to="`/profile/${m.slug}`" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{{ m.name }}</NuxtLink>
              <UBadge v-if="m.role === 'admin'" color="primary" variant="subtle" size="sm">Admin</UBadge>
              <span class="text-xs text-muted">{{ fmtDateTime(m.createdAt).slice(0, 10) }}</span>
            </li>
          </ul>
        </UCard>
        <UCard>
          <h2 class="mb-3 flex items-center gap-2 font-bold"><UIcon name="i-lucide-message-circle-off" /> Publicaciones sin comentarios</h2>
          <ul v-if="stats?.postsWithoutComments?.length" class="space-y-3">
            <li v-for="p in stats.postsWithoutComments" :key="p.id">
              <NuxtLink :to="`/p/${p.channelSlug}/${p.slug}`" class="text-sm font-medium hover:underline">{{ p.title }}</NuxtLink>
              <p class="text-xs text-muted">{{ p.authorName }} · en {{ p.channelName }} · {{ fmtDateTime(p.createdAt) }}</p>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">Ninguna: todas las publicaciones recibieron comentarios.</p>
        </UCard>
      </div>
    </template>
  </div>
</template>
