<script setup lang="ts">
const { user, tenant, logout } = useAuth()
const { initials } = useFormat()
const api = useApi()
const router = useRouter()
const route = useRoute()
// Fase 10: panel deslizable móvil (un solo cajón organizado) y
// contador de avisos compartido entre la campana y la barra inferior.
const { openPanel, closePanel } = useMobilePanel()
const { refresh: refreshNotif } = useNotifBadge()
// Fase 11: los ajustes de cuenta son un modal (no una página).
const { openSettings: openUserSettings } = useUserSettings()
// Corrección: la búsqueda de la barra es SOLO el icono de lupa que
// abre el diálogo (Cmd+K), como en la referencia — sin caja pegada.
const { openSearch } = useSearchDialog()

const { data: channelData, refresh: refreshChannels } = await useAsyncData('layout-channels', () =>
  api<{ groups: { id: number, name: string, channels: { id: number, slug: string, name: string, icon: string, type: string, priceCents: number, following: boolean }[] }[] }>('/api/channels'))

// Fase 7: navegación principal en pastillas, centrada en la barra
// superior (Inicio / Cursos / Eventos / Miembros / Ranking). Fase 10:
// las pastillas solo viven en escritorio amplio (xl); en tableta la
// navegación está en el lateral fijo y en teléfono en el panel
// deslizable + la barra inferior (la fila deslizable de la Fase 7
// desaparece).
const mainNav = [
  { label: 'Inicio', to: '/feeds' },
  { label: 'Cursos', to: '/courses' },
  { label: 'Eventos', to: '/events' },
  { label: 'Miembros', to: '/members' },
  { label: 'Ranking', to: '/leaderboard' },
]

// Badge de mensajes sin leer en el icono de la barra: suma de los
// no leídos por conversación (mismo dato que usa /messages).
const { data: dmData, refresh: refreshDm } = await useAsyncData('layout-dm-unread', () =>
  user.value ? api<{ members: { unread: number }[] }>('/api/members') : Promise.resolve({ members: [] as { unread: number }[] }))
const dmUnread = computed(() => (dmData.value?.members || []).reduce((acc, m) => acc + (m.unread || 0), 0))
watch(user, (u) => { if (u) { refreshDm(); refreshNotif() } })
watch(() => route.fullPath, () => { refreshDm(); refreshNotif() })

async function doLogout() {
  closePanel()
  await logout()
  await refreshChannels()
  router.push('/feeds')
}

const userMenuItems = computed(() => [
  [
    { label: 'Mi perfil', icon: 'i-lucide-user', to: `/profile/${user.value?.slug}` },
    { label: 'Mis borradores', icon: 'i-lucide-file-edit', to: '/drafts' },
    { label: 'Ajustes de cuenta', icon: 'i-lucide-settings-2', onSelect: () => openUserSettings() },
    { label: 'Notificaciones', icon: 'i-lucide-bell', to: '/notifications' },
    ...(user.value?.role === 'admin'
      ? [
          { label: 'Panel de administración', icon: 'i-lucide-settings', to: '/admin' },
          { label: 'Ajustes de la comunidad', icon: 'i-lucide-settings-2', to: '/admin/settings' },
          { label: 'Miembros', icon: 'i-lucide-users', to: '/admin/members' },
          { label: 'Administrar canales', icon: 'i-lucide-hash', to: '/admin/channels' },
          { label: 'Cursos', icon: 'i-lucide-graduation-cap', to: '/admin/courses' },
          { label: 'Eventos', icon: 'i-lucide-calendar-days', to: '/admin/events' },
          { label: 'Gamificación', icon: 'i-lucide-trophy', to: '/admin/gamification' },
          { label: 'Planes y precios', icon: 'i-lucide-credit-card', to: '/admin/plans' },
          { label: 'Dominio personalizado', icon: 'i-lucide-globe', to: '/admin/domains' },
          { label: 'Correos', icon: 'i-lucide-mail', to: '/admin/emails' },
        ]
      : []),
  ],
  [{ label: 'Cerrar sesión', icon: 'i-lucide-log-out', onSelect: doLogout }],
])

{}// Fase 9: el perfil usa todo el ancho con sus tres zonas propias (como
// la referencia): en /profile/* no se renderiza el riel derecho global.
const isProfilePage = computed(() => route.path.startsWith('/profile/'))
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <header class="sticky top-0 z-40 border-b border-default bg-white/90 backdrop-blur dark:bg-neutral-900/90">
      <div class="relative mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
        <UButton class="md:hidden" color="neutral" variant="ghost" icon="i-lucide-menu" aria-label="Abrir el menú" @click="openPanel" />
        <NuxtLink to="/feeds" class="flex shrink-0 items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
            {{ (tenant?.name || 'C').charAt(0) }}
          </span>
          <span class="hidden font-bold sm:block">{{ tenant?.name || 'Comunidad' }}</span>
        </NuxtLink>
        <nav class="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 xl:flex">
          <NuxtLink
            v-for="item in mainNav" :key="item.to" :to="item.to"
            class="rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted transition hover:bg-elevated hover:text-highlighted"
            active-class="bg-elevated font-semibold text-highlighted"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
        <span class="flex-1" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-search" aria-label="Buscar (Ctrl+K)" @click="openSearch" />
        <span v-if="user" class="relative hidden sm:inline-flex">
          <UButton to="/messages" color="neutral" variant="ghost" icon="i-lucide-message-circle" aria-label="Mensajes" />
          <span v-if="dmUnread" class="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{{ dmUnread }}</span>
        </span>
        <NotificationBell />
        <UColorModeButton class="hidden md:inline-flex" />
        <template v-if="user">
          <!-- En teléfono el avatar abre el panel deslizable (como en
               la referencia); el menú desplegable queda desde md. -->
          <UButton color="neutral" variant="ghost" class="md:hidden" aria-label="Abrir el menú" @click="openPanel">
            <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.name)" size="sm" />
          </UButton>
          <span class="hidden md:inline-flex">
            <UDropdownMenu :items="userMenuItems">
              <UButton color="neutral" variant="ghost" class="gap-2">
                <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.name)" size="sm" />
                <span class="hidden max-w-32 truncate sm:block">{{ user.name }}</span>
              </UButton>
            </UDropdownMenu>
          </span>
        </template>
        <template v-else>
          <UButton to="/login" color="neutral" variant="ghost" label="Iniciar sesión" />
          <UButton to="/register" label="Unirse" :style="{ backgroundColor: tenant?.brandColor }" />
        </template>
      </div>
    </header>

    <div
      class="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 md:grid-cols-[240px_minmax(0,1fr)]"
      :class="isProfilePage ? '' : 'xl:grid-cols-[240px_minmax(0,1fr)_290px]'"
    >
      <!-- Lateral fijo desde tableta (md); en teléfono la navegación
           vive en el panel deslizable (Fase 10). -->
      <aside class="hidden space-y-5 md:block">
        <div>
          <ul class="space-y-0.5">
            <li>
              <NuxtLink to="/videos" class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon name="i-lucide-play-square" class="shrink-0" /> Videos
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/library" class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon name="i-lucide-library" class="shrink-0" /> Biblioteca
              </NuxtLink>
            </li>
          </ul>
        </div>
        <div>
          <h3 class="mb-1.5 px-2 text-xs font-bold tracking-wider text-muted uppercase">
            Canales
          </h3>
          <div v-for="group in channelData?.groups || []" :key="group.id" class="mb-3">
            <p class="mb-1 px-2 text-[11px] font-semibold tracking-wide text-muted">
              {{ group.name }}
            </p>
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
        </div>
        <div class="border-t border-default pt-4">
          <h3 class="mb-1.5 px-2 text-xs font-bold tracking-wider text-muted uppercase">
            Enlaces
          </h3>
          <ul class="space-y-0.5 text-sm">
            <li>
              <NuxtLink to="/pricing" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon name="i-lucide-tag" class="shrink-0" /> Precios
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/guidelines" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon name="i-lucide-scroll-text" class="shrink-0" /> Reglas
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/terms" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon name="i-lucide-file-text" class="shrink-0" /> Términos
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/privacy" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon name="i-lucide-shield" class="shrink-0" /> Privacidad
              </NuxtLink>
            </li>
            <li v-if="user?.role === 'admin'">
              <NuxtLink to="/admin" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon name="i-lucide-settings" class="shrink-0" /> Panel de administración
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

      <aside v-if="!isProfilePage" class="hidden xl:block">
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

    <!-- Fase 10: respiro para que la barra inferior fija no tape el
         final del contenido en teléfono. -->
    <div v-if="user" aria-hidden="true" class="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />

    <MobilePanel :dm-unread="dmUnread" :groups="channelData?.groups || []" @logout="doLogout" />
    <MobileBottomBar v-if="user" :dm-unread="dmUnread" />
    <SearchDialog />
    <UserSettingsModal />
  </div>
</template>
