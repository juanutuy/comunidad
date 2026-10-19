<script setup lang="ts">
const { user, tenant, logout } = useAuth()
const { initials } = useFormat()
const api = useApi()
const router = useRouter()
const showChannels = ref(false)

const { data: channelData, refresh: refreshChannels } = await useAsyncData('layout-channels', () =>
  api<{ groups: { id: number, name: string, channels: { id: number, slug: string, name: string, icon: string, type: string, priceCents: number, following: boolean }[] }[] }>('/api/channels'))

const navItems = [
  { label: 'Feed', icon: 'i-lucide-newspaper', to: '/feeds' },
  { label: 'Mensajes', icon: 'i-lucide-message-circle', to: '/messages' },
  { label: 'Miembros', icon: 'i-lucide-users', to: '/members' },
  { label: 'Cursos', icon: 'i-lucide-graduation-cap', to: '/courses' },
  { label: 'Eventos', icon: 'i-lucide-calendar-days', to: '/events' },
  { label: 'Videos', icon: 'i-lucide-play-square', to: '/videos' },
  { label: 'Biblioteca', icon: 'i-lucide-library', to: '/library' },
  { label: 'Ranking', icon: 'i-lucide-trophy', to: '/leaderboard' },
  { label: 'Precios', icon: 'i-lucide-tag', to: '/pricing' },
  { label: 'Reglas', icon: 'i-lucide-scroll-text', to: '/guidelines' },
]

async function doLogout() {
  await logout()
  await refreshChannels()
  router.push('/feeds')
}

const userMenuItems = computed(() => [
  [
    { label: 'Mi perfil', icon: 'i-lucide-user', to: `/profile/${user.value?.slug}` },
    { label: 'Mis borradores', icon: 'i-lucide-file-edit', to: '/drafts' },
    { label: 'Ajustes de cuenta', icon: 'i-lucide-settings-2', to: '/settings' },
    { label: 'Notificaciones', icon: 'i-lucide-bell', to: '/notifications' },
    ...(user.value?.role === 'admin'
      ? [
          { label: 'Ajustes de la comunidad', icon: 'i-lucide-settings', to: '/admin' },
          { label: 'Miembros', icon: 'i-lucide-users', to: '/admin/members' },
          { label: 'Administrar canales', icon: 'i-lucide-hash', to: '/admin/channels' },
          { label: 'Planes y precios', icon: 'i-lucide-credit-card', to: '/admin/plans' },
          { label: 'Dominio personalizado', icon: 'i-lucide-globe', to: '/admin/domains' },
          { label: 'Correos', icon: 'i-lucide-mail', to: '/admin/emails' },
        ]
      : []),
  ],
  [{ label: 'Cerrar sesión', icon: 'i-lucide-log-out', onSelect: doLogout }],
])

const searchQuery = ref('')
function doSearch() {
  const q = searchQuery.value.trim()
  if (q.length >= 2) router.push({ path: '/search', query: { q } })
}
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <header class="sticky top-0 z-40 border-b border-default bg-white/90 backdrop-blur dark:bg-neutral-900/90">
      <div class="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
        <UButton class="lg:hidden" color="neutral" variant="ghost" icon="i-lucide-menu" @click="showChannels = !showChannels" />
        <NuxtLink to="/feeds" class="flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
            {{ (tenant?.name || 'C').charAt(0) }}
          </span>
          <span class="hidden font-bold sm:block">{{ tenant?.name || 'Comunidad' }}</span>
        </NuxtLink>
        <nav class="ml-4 hidden items-center gap-1 md:flex">
          <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" class="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-elevated hover:text-highlighted" active-class="bg-elevated text-highlighted">
            {{ item.label }}
          </NuxtLink>
        </nav>
        <span class="flex-1" />
        <form class="hidden md:block" @submit.prevent="doSearch">
          <UInput v-model="searchQuery" placeholder="Buscar en la comunidad…" icon="i-lucide-search" size="sm" class="w-52" />
        </form>
        <UButton to="/search" color="neutral" variant="ghost" icon="i-lucide-search" class="md:hidden" aria-label="Buscar" />
        <NotificationBell />
        <UColorModeButton />
        <template v-if="user">
          <UDropdownMenu :items="userMenuItems">
            <UButton color="neutral" variant="ghost" class="gap-2">
              <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.name)" size="sm" />
              <span class="hidden max-w-32 truncate sm:block">{{ user.name }}</span>
            </UButton>
          </UDropdownMenu>
        </template>
        <template v-else>
          <UButton to="/login" color="neutral" variant="ghost" label="Iniciar sesión" />
          <UButton to="/register" label="Unirse" :style="{ backgroundColor: tenant?.brandColor }" />
        </template>
      </div>
      <nav class="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" class="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-elevated" active-class="bg-elevated text-highlighted">
          {{ item.label }}
        </NuxtLink>
      </nav>
    </header>

    <div class="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_290px]">
      <aside :class="showChannels ? 'block' : 'hidden lg:block'" class="space-y-5">
        <div v-for="group in channelData?.groups || []" :key="group.id">
          <h3 class="mb-1.5 px-2 text-xs font-bold tracking-wider text-muted uppercase">
            {{ group.name }}
          </h3>
          <ul class="space-y-0.5">
            <li v-for="ch in group.channels" :key="ch.id">
              <NuxtLink :to="`/channels/${ch.slug}`" class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon :name="ch.icon" class="shrink-0" />
                <span class="min-w-0 flex-1 truncate">{{ ch.name }}</span>
                <UIcon v-if="ch.type === 'paid'" name="i-lucide-crown" class="shrink-0 text-amber-500" />
                <UIcon v-else-if="ch.type === 'private'" name="i-lucide-lock" class="shrink-0 text-muted" />
              </NuxtLink>
            </li>
          </ul>
        </div>
        <UCard v-if="!user" class="text-sm">
          <p class="font-semibold">Sumate a la conversación</p>
          <p class="mt-1 text-muted">Creá tu cuenta gratis para publicar, comentar y guardar contenido.</p>
          <UButton to="/register" class="mt-3" block label="Crear cuenta" />
        </UCard>
      </aside>

      <main class="min-w-0">
        <slot />
      </main>

      <aside class="hidden xl:block">
        <RightRail />
      </aside>
    </div>

    <footer class="border-t border-default">
      <div class="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted">
        <span>{{ tenant?.name || 'Comunidad' }}</span>
        <span class="flex-1" />
        <NuxtLink to="/terms" class="hover:underline">Términos y condiciones</NuxtLink>
        <NuxtLink to="/privacy" class="hover:underline">Política de privacidad</NuxtLink>
      </div>
    </footer>
  </div>
</template>
