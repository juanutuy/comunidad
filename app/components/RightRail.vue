<script setup lang="ts">
// Rail derecho: próximos eventos, publicaciones recientes, top
// líderes, miembros y usuarios en línea (datos de /api/sidebar).
// Fase 7: acabado tipo referencia — títulos de bloque en mayúsculas
// con «Ver todo», eventos con cuadrado de fecha y anfitrión.
const { tenant } = useAuth()
const { t, locale } = useI18n()
const { initials } = useFormat()
const api = useApi()

interface SidebarData {
  blocks?: { key: string, audience: string }[]
  events: { slug: string, title: string, starts_at: string, host_name: string | null }[]
  recent: { slug: string, title: string, channel_slug: string }[]
  leaders: { id: number, name: string, slug: string, avatarUrl: string, points: number, level: string }[]
  online: { id: number, name: string, slug: string, avatarUrl: string, me: boolean }[]
  members: { id: number, name: string, slug: string, avatarUrl: string, online: boolean }[]
}
const { data: sidebar } = await useAsyncData('right-rail', () =>
  api<SidebarData>('/api/sidebar').catch(() => ({ events: [], recent: [], leaders: [], online: [], members: [] }) as SidebarData))

// Fase 15: orden y visibilidad salen de la config del tenant que
// devuelve el servidor en `blocks` (ya filtrada por audiencia para el
// visitante del modo público). Sin `blocks` (respuestas viejas) se
// muestran todos en el orden de siempre.
const DEFAULT_ORDER = ['upcoming_events', 'recent_posts', 'leaders', 'members', 'online_now']
function blockOrder(key: string) {
  const blocks = sidebar.value?.blocks
  if (!blocks) return DEFAULT_ORDER.indexOf(key)
  return blocks.findIndex(b => b.key === key)
}
function blockVisible(key: string) {
  const blocks = sidebar.value?.blocks
  return !blocks || blocks.some(b => b.key === key)
}

// Cuadrado de fecha del evento próximo: mes corto arriba, día grande
// y día de semana debajo (como la referencia).
function dateParts(iso: string) {
  const loc = locale.value === 'en' ? 'en-US' : 'es'
  const d = new Date(iso)
  return {
    month: d.toLocaleDateString(loc, { month: 'short' }).replace('.', '').toUpperCase(),
    day: d.getDate(),
    weekday: d.toLocaleDateString(loc, { weekday: 'short' }).replace('.', ''),
    time: d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }),
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <UCard v-if="blockVisible('upcoming_events')" :style="{ order: blockOrder('upcoming_events') }">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h3 class="text-xs font-bold tracking-wider text-muted uppercase">{{ t('rail.upcomingEvents') }}</h3>
        <NuxtLink to="/events" class="text-xs font-medium text-primary hover:underline">{{ t('common.viewAll') }}</NuxtLink>
      </div>
      <ul v-if="sidebar?.events?.length" class="space-y-3">
        <li v-for="e in sidebar.events" :key="e.slug">
          <NuxtLink :to="`/events/${e.slug}`" class="group flex items-start gap-3">
            <span class="flex w-12 shrink-0 flex-col items-center overflow-hidden rounded-lg border border-default">
              <span class="w-full py-0.5 text-center text-[10px] font-bold tracking-wider text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">{{ dateParts(e.starts_at).month }}</span>
              <span class="pt-0.5 text-lg leading-none font-bold">{{ dateParts(e.starts_at).day }}</span>
              <span class="pb-1 text-[10px] text-muted capitalize">{{ dateParts(e.starts_at).weekday }}</span>
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium group-hover:underline">{{ e.title }}</span>
              <span class="mt-0.5 block text-xs text-muted">{{ dateParts(e.starts_at).weekday }} · {{ dateParts(e.starts_at).time }}</span>
              <span v-if="e.host_name" class="block truncate text-xs text-muted">{{ t('rail.hostLabel', { name: e.host_name }) }}</span>
            </span>
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('rail.noUpcoming') }}</p>
    </UCard>

    <UCard v-if="blockVisible('recent_posts')" :style="{ order: blockOrder('recent_posts') }">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h3 class="text-xs font-bold tracking-wider text-muted uppercase">{{ t('rail.recentPosts') }}</h3>
        <NuxtLink to="/feeds" class="text-xs font-medium text-primary hover:underline">{{ t('common.viewAll') }}</NuxtLink>
      </div>
      <ul v-if="sidebar?.recent?.length" class="space-y-2.5">
        <li v-for="p in sidebar.recent" :key="p.slug">
          <NuxtLink :to="`/p/${p.channel_slug}/${p.slug}`" class="text-sm leading-snug hover:underline">{{ p.title }}</NuxtLink>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('rail.noPosts') }}</p>
    </UCard>

    <UCard v-if="blockVisible('leaders')" :style="{ order: blockOrder('leaders') }">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h3 class="text-xs font-bold tracking-wider text-muted uppercase">{{ t('rail.topLeaders') }}</h3>
        <NuxtLink to="/leaderboard" class="text-xs font-medium text-primary hover:underline">{{ t('common.viewAll') }}</NuxtLink>
      </div>
      <ul v-if="sidebar?.leaders?.length" class="space-y-2.5">
        <li v-for="(l, i) in sidebar.leaders" :key="l.id" class="flex items-center gap-2.5">
          <span class="w-4 text-center text-sm font-bold text-muted">{{ i + 1 }}</span>
          <UAvatar :src="l.avatarUrl || undefined" :text="initials(l.name)" size="sm" />
          <span class="min-w-0 flex-1">
            <NuxtLink :to="`/profile/${l.slug}`" class="block truncate text-sm font-medium hover:underline">{{ l.name }}</NuxtLink>
            <span class="block text-xs text-muted">{{ t('rail.levelLabel', { name: l.level }) }}</span>
          </span>
          <span class="text-sm font-bold">{{ l.points }} {{ t('common.points') }}</span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('rail.noScores') }}</p>
    </UCard>

    <UCard v-if="blockVisible('members')" :style="{ order: blockOrder('members') }">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h3 class="text-xs font-bold tracking-wider text-muted uppercase">{{ t('rail.members') }}</h3>
        <NuxtLink to="/members" class="text-xs font-medium text-primary hover:underline">{{ t('common.viewAll') }}</NuxtLink>
      </div>
      <ul v-if="sidebar?.members?.length" class="space-y-2.5">
        <li v-for="m in sidebar.members" :key="m.id" class="flex items-center gap-2.5">
          <span class="relative shrink-0">
            <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="sm" />
            <span v-if="m.online" class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" />
          </span>
          <NuxtLink :to="`/profile/${m.slug}`" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{{ m.name }}</NuxtLink>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('rail.noMembers') }}</p>
    </UCard>

    <UCard v-if="blockVisible('online_now')" :style="{ order: blockOrder('online_now') }">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h3 class="text-xs font-bold tracking-wider text-muted uppercase">{{ t('rail.onlineNow', { count: sidebar?.online?.length || 0 }) }}</h3>
        <NuxtLink to="/members" class="text-xs font-medium text-primary hover:underline">{{ t('common.viewAll') }}</NuxtLink>
      </div>
      <ul v-if="sidebar?.online?.length" class="space-y-2.5">
        <li v-for="m in sidebar.online" :key="m.id" class="flex items-center gap-2.5">
          <span class="relative shrink-0">
            <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="sm" />
            <span class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" />
          </span>
          <NuxtLink :to="`/profile/${m.slug}`" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
            {{ m.name }}<span v-if="m.me" class="text-muted">{{ t('rail.youSuffix') }}</span>
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">{{ t('rail.nobodyOnline') }}</p>
    </UCard>
    <p class="px-1 text-xs text-muted" :style="{ order: 99 }">{{ tenant?.tagline }}</p>
  </div>
</template>
