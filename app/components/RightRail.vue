<script setup lang="ts">
// Rail derecho (Fase 5): próximos eventos, publicaciones recientes,
// top líderes y miembros en línea. Los datos salen de /api/sidebar.
const { tenant } = useAuth()
const { fmtDate, initials } = useFormat()
const api = useApi()

interface SidebarData {
  events: { slug: string, title: string, starts_at: string }[]
  recent: { slug: string, title: string, channel_slug: string }[]
  leaders: { id: number, name: string, slug: string, avatarUrl: string, points: number, level: string }[]
  online: { id: number, name: string, slug: string, avatarUrl: string, me: boolean }[]
}
const { data: sidebar } = await useAsyncData('right-rail', () =>
  api<SidebarData>('/api/sidebar').catch(() => ({ events: [], recent: [], leaders: [], online: [] }) as SidebarData))
</script>

<template>
  <div class="space-y-5">
    <UCard>
      <h3 class="mb-3 flex items-center gap-2 text-sm font-bold">
        <UIcon name="i-lucide-calendar-days" /> Próximos eventos
      </h3>
      <ul v-if="sidebar?.events?.length" class="space-y-3">
        <li v-for="e in sidebar.events" :key="e.slug">
          <NuxtLink :to="`/events/${e.slug}`" class="text-sm font-medium hover:underline">{{ e.title }}</NuxtLink>
          <p class="text-xs text-muted">{{ fmtDate(e.starts_at) }}</p>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">No hay eventos próximos.</p>
    </UCard>
    <UCard>
      <h3 class="mb-3 flex items-center gap-2 text-sm font-bold">
        <UIcon name="i-lucide-flame" /> Publicaciones recientes
      </h3>
      <ul v-if="sidebar?.recent?.length" class="space-y-2.5">
        <li v-for="p in sidebar.recent" :key="p.slug">
          <NuxtLink :to="`/p/${p.channel_slug}/${p.slug}`" class="text-sm leading-snug hover:underline">{{ p.title }}</NuxtLink>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Todavía no hay publicaciones.</p>
    </UCard>
    <UCard>
      <h3 class="mb-3 flex items-center gap-2 text-sm font-bold">
        <UIcon name="i-lucide-trophy" /> Top líderes
      </h3>
      <ul v-if="sidebar?.leaders?.length" class="space-y-2.5">
        <li v-for="(l, i) in sidebar.leaders" :key="l.id" class="flex items-center gap-2.5">
          <span class="w-4 text-center text-sm font-bold text-muted">{{ i + 1 }}</span>
          <UAvatar :src="l.avatarUrl || undefined" :text="initials(l.name)" size="sm" />
          <span class="min-w-0 flex-1">
            <NuxtLink :to="`/profile/${l.slug}`" class="block truncate text-sm font-medium hover:underline">{{ l.name }}</NuxtLink>
            <span class="block text-xs text-muted">Nivel {{ l.level }}</span>
          </span>
          <span class="text-sm font-bold">{{ l.points }} pts</span>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Todavía no hay puntajes.</p>
      <NuxtLink to="/leaderboard" class="mt-3 block text-sm font-medium text-primary hover:underline">Ver ranking completo</NuxtLink>
    </UCard>
    <UCard>
      <h3 class="mb-3 flex items-center gap-2 text-sm font-bold">
        <span class="h-2 w-2 rounded-full bg-green-500" /> Miembros en línea
      </h3>
      <ul v-if="sidebar?.online?.length" class="space-y-2.5">
        <li v-for="m in sidebar.online" :key="m.id" class="flex items-center gap-2.5">
          <span class="relative shrink-0">
            <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="sm" />
            <span class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" />
          </span>
          <NuxtLink :to="`/profile/${m.slug}`" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
            {{ m.name }}<span v-if="m.me" class="text-muted"> (vos)</span>
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Nadie en línea en este momento.</p>
    </UCard>
    <p class="px-1 text-xs text-muted">{{ tenant?.tagline }}</p>
  </div>
</template>
