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
// superior. Fase 10: las pastillas solo viven en escritorio amplio
// (xl); en tableta la navegación está en el lateral fijo y en
// teléfono en el panel deslizable + la barra inferior.
// Fase 15: el menú es configurable por el administrador (Ajustes →
// Menú de navegación): orden, etiquetas, visibilidad y enlaces
// personalizados llegan resueltos en tenant.navMenu, separados por
// zona ('header' = pastillas, 'sidebar' = lateral y panel móvil).
// Sin config (tenants anteriores) se usa la navegación de siempre.
const FALLBACK_NAV: { id: string, label: string, url: string, visible: boolean, custom: boolean, zone: 'header' | 'sidebar' }[] = [
  { id: 'inicio', label: 'Inicio', url: '/feeds', visible: true, custom: false, zone: 'header' },
  { id: 'cursos', label: 'Cursos', url: '/courses', visible: true, custom: false, zone: 'header' },
  { id: 'eventos', label: 'Eventos', url: '/events', visible: true, custom: false, zone: 'header' },
  { id: 'miembros', label: 'Miembros', url: '/members', visible: true, custom: false, zone: 'header' },
  { id: 'ranking', label: 'Ranking', url: '/leaderboard', visible: true, custom: false, zone: 'header' },
  { id: 'videos', label: 'Videos', url: '/videos', visible: true, custom: false, zone: 'sidebar' },
  { id: 'biblioteca', label: 'Biblioteca', url: '/library', visible: true, custom: false, zone: 'sidebar' },
  { id: 'precios', label: 'Precios', url: '/pricing', visible: true, custom: false, zone: 'sidebar' },
  { id: 'reglas', label: 'Reglas', url: '/guidelines', visible: true, custom: false, zone: 'sidebar' },
  { id: 'terminos', label: 'Términos', url: '/terms', visible: true, custom: false, zone: 'sidebar' },
  { id: 'privacidad', label: 'Privacidad', url: '/privacy', visible: true, custom: false, zone: 'sidebar' },
]
const navItems = computed(() => tenant.value?.navMenu?.length ? tenant.value.navMenu : FALLBACK_NAV)
const headerNav = computed(() => navItems.value.filter(i => i.zone === 'header' && i.visible))
const sidebarNav = computed(() => navItems.value.filter(i => i.zone === 'sidebar' && i.visible))
const NAV_ICONS: Record<string, string> = {
  inicio: 'i-lucide-home', cursos: 'i-lucide-graduation-cap', eventos: 'i-lucide-calendar-days',
  miembros: 'i-lucide-users', ranking: 'i-lucide-trophy', videos: 'i-lucide-play-square',
  biblioteca: 'i-lucide-library', precios: 'i-lucide-tag', reglas: 'i-lucide-scroll-text',
  terminos: 'i-lucide-file-text', privacidad: 'i-lucide-shield',
}
function navIcon(id: string) { return NAV_ICONS[id] || 'i-lucide-link' }
function isExternal(url: string) { return /^https?:\/\//i.test(url) }

// Fase 15: marca del tenant — el logo sigue el tema activo del
// usuario (claro/oscuro) con respaldo en cascada: logo del tema →
// icono → inicial + nombre, como en la referencia.
const colorMode = useColorMode()
const logoSrc = computed(() => {
  const t = tenant.value
  if (!t) return ''
  return (colorMode.value === 'dark' ? (t.logoDarkUrl || t.logoUrl) : (t.logoUrl || t.logoDarkUrl)) || t.iconUrl || ''
})
// Fase 15: favicon propio del tenant cuando el admin lo configuró.
useHead(() => ({
  title: tenant.value?.name || 'Comunidad',
  link: tenant.value?.faviconUrl ? [{ rel: 'icon', href: tenant.value.faviconUrl }] : [],
}))

// Fase 15: bloque de contacto al pie del lateral, solo si hay datos.
const SOCIAL_ICONS: Record<string, string> = {
  Facebook: 'i-lucide-facebook', X: 'i-lucide-twitter', Instagram: 'i-lucide-instagram',
  LinkedIn: 'i-lucide-linkedin', YouTube: 'i-lucide-youtube', TikTok: 'i-lucide-music-2', Discord: 'i-lucide-messages-square',
}
const hasContact = computed(() => !!(tenant.value?.supportEmail || tenant.value?.websiteUrl || tenant.value?.socialLinks?.length))

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
    // Fase 12: el menú del avatar es personal y corto, como en la
    // referencia. La administración tiene su consola dedicada (Fase
    // 11): acá queda UNA sola entrada, no la lista de secciones.
    // Fase 14: la entrada a la consola es para todo el staff
    // (administradores, moderadores y encargados de cursos); cada
    // uno aterriza en la consola recortada a su rol.
    ...(['admin', 'moderator', 'course_manager'].includes(user.value?.role || '')
      ? [{ label: 'Panel de administración', icon: 'i-lucide-settings', to: '/admin' }]
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
          <img v-if="logoSrc" :src="logoSrc" :alt="tenant?.name || 'Comunidad'" class="h-8 max-w-44 object-contain">
          <template v-else>
            <span class="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
              {{ (tenant?.name || 'C').charAt(0) }}
            </span>
            <span class="hidden font-bold sm:block">{{ tenant?.name || 'Comunidad' }}</span>
          </template>
        </NuxtLink>
        <nav class="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 xl:flex">
          <template v-for="item in headerNav" :key="item.id">
            <a
              v-if="isExternal(item.url)" :href="item.url" target="_blank" rel="noopener"
              class="rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted transition hover:bg-elevated hover:text-highlighted"
            >
              {{ item.label }}
            </a>
            <NuxtLink
              v-else :to="item.url"
              class="rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted transition hover:bg-elevated hover:text-highlighted"
              active-class="bg-elevated font-semibold text-highlighted"
            >
              {{ item.label }}
            </NuxtLink>
          </template>
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
            <li v-for="item in sidebarNav" :key="item.id">
              <a
                v-if="isExternal(item.url)" :href="item.url" target="_blank" rel="noopener"
                class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated"
              >
                <UIcon :name="navIcon(item.id)" class="shrink-0" /> {{ item.label }}
              </a>
              <NuxtLink v-else :to="item.url" class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon :name="navIcon(item.id)" class="shrink-0" /> {{ item.label }}
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
        <div v-if="user && ['admin', 'moderator', 'course_manager'].includes(user.role || '')" class="border-t border-default pt-4">
          <ul class="space-y-0.5 text-sm">
            <li>
              <NuxtLink to="/admin" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated" active-class="bg-elevated font-semibold">
                <UIcon name="i-lucide-settings" class="shrink-0" /> Panel de administración
              </NuxtLink>
            </li>
          </ul>
        </div>
        <!-- Fase 15: bloque de contacto, solo si el administrador cargó
             al menos un dato en Ajustes → Contacto. -->
        <div v-if="hasContact" class="border-t border-default pt-4">
          <h3 class="mb-1.5 px-2 text-xs font-bold tracking-wider text-muted uppercase">
            Contacto
          </h3>
          <ul class="space-y-0.5 text-sm">
            <li v-if="tenant?.supportEmail">
              <a :href="`mailto:${tenant.supportEmail}`" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated">
                <UIcon name="i-lucide-mail" class="shrink-0" /> <span class="min-w-0 truncate">{{ tenant.supportEmail }}</span>
              </a>
            </li>
            <li v-if="tenant?.websiteUrl">
              <a :href="tenant.websiteUrl" target="_blank" rel="noopener" class="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated">
                <UIcon name="i-lucide-globe" class="shrink-0" /> Sitio web
              </a>
            </li>
          </ul>
          <div v-if="tenant?.socialLinks?.length" class="mt-2 flex flex-wrap gap-1 px-2">
            <a
              v-for="s in tenant.socialLinks" :key="s.platform + s.url" :href="s.url" target="_blank" rel="noopener"
              :title="s.platform" :aria-label="s.platform"
              class="flex h-8 w-8 items-center justify-center rounded-md hover:bg-elevated"
            >
              <UIcon :name="SOCIAL_ICONS[s.platform] || 'i-lucide-link'" />
            </a>
          </div>
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
    <ReportDialog />
    <!-- Fase 16-C: anfitrión del editor de publicaciones — el MISMO
         PostComposer de crear, en modo edición, para las tarjetas y
         «Mis borradores» (ver usePostEditor). Sin disparador visible:
         solo vive su modal. -->
    <PostComposer v-if="user" variant="bare" editor-host />
  </div>
</template>
