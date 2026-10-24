<script setup lang="ts">
// Panel deslizable móvil (Fase 10, estilo referencia): UN solo cajón
// ordenado que reemplaza la fila deslizable de destinos de la Fase 7.
// De arriba abajo: cabecera de usuario, tarjeta de nivel/XP (datos
// reales de la gamificación del tenant, misma fuente que el perfil),
// selector de tema segmentado, fila de comunidad, navegación principal
// con chevrons, canales con sus candados y Cerrar sesión en rojo.
// Solo se monta en el layout; se abre desde la barra superior y desde
// la barra inferior (estado compartido en useMobilePanel).
interface ChannelItem { id: number, slug: string, name: string, icon: string, description?: string, type: string, priceCents: number, contentType?: 'post' | 'image', coverUrl?: string, visibility?: 'public' | 'private' | 'secret', groupId?: number | null, postPermission?: string, archived?: boolean, following: boolean, hasAccess?: boolean }
interface ChannelGroup { id: number, name: string, sort?: number, isDefault?: boolean, channels: ChannelItem[] }
interface LevelInfo { name: string, min: number, icon: string, nextAt: number | null, nextName: string | null, nextIcon: string | null }
interface Community { id: number, slug: string, name: string, brandColor: string, role: string, domain: string | null }

const props = defineProps<{ dmUnread: number, groups: ChannelGroup[] }>()
const emit = defineEmits<{ logout: [] }>()

const { user, tenant } = useAuth()
const { t, navLabel } = useI18n()
const { initials } = useFormat()
// Fase 16-F: el panel muestra los canales SEGUIDOS (misma regla
// que el lateral) y los mismos menús contextuales de canal/grupo.
const { openCreate: openChannelCreate } = useChannelEditor()
const displayGroups = computed(() => props.groups
  .map(g => ({ ...g, channels: user.value ? g.channels.filter(c => c.visibility === 'public' || c.following) : g.channels }))
  .filter(g => g.channels.length))
const defaultGroupId = computed(() => props.groups.find(g => g.isDefault)?.id ?? props.groups[0]?.id)
const api = useApi()
const { open, closePanel } = useMobilePanel()
// Fase 11: «Ajustes de cuenta» abre el modal de ajustes (y cierra el panel).
const { openSettings: openUserSettings } = useUserSettings()
function openSettingsFromPanel() {
  closePanel()
  openUserSettings()
}
const colorMode = useColorMode()

// Nivel y puntos reales del usuario: el mismo payload que alimenta la
// tarjeta de nivel de su perfil (gamificación por tenant, Fase 9).
const { data: profileData } = await useAsyncData(
  () => `panel-profile-${user.value?.slug || 'anon'}`,
  () => user.value
    ? api<{ profile: { points: number, level: LevelInfo } }>(`/api/profiles/${user.value.slug}`)
    : Promise.resolve(null),
  { watch: [() => user.value?.slug] },
)
const myLevel = computed(() => profileData.value?.profile.level || null)
const myPoints = computed(() => profileData.value?.profile.points || 0)
const levelPct = computed(() => {
  const l = myLevel.value
  if (!l || !l.nextAt) return 100
  const span = l.nextAt - l.min
  return span > 0 ? Math.min(100, Math.max(0, Math.round(((myPoints.value - l.min) / span) * 100))) : 0
})

// Comunidades del usuario (membresías): la fila de comunidad es
// informativa cuando hay una sola (lo habitual, porque cada comunidad
// vive en su propio dominio); si hay más, las demás se enlazan a su
// dominio propio cuando tienen uno registrado.
const { data: tenantsData } = await useAsyncData(
  'panel-my-tenants',
  () => user.value
    ? api<{ currentTenantId: number, communities: Community[] }>('/api/my-tenants')
    : Promise.resolve({ currentTenantId: 0, communities: [] as Community[] }),
  { watch: [() => user.value?.id] },
)
const otherCommunities = computed(() =>
  (tenantsData.value?.communities || []).filter(c => c.id !== tenantsData.value?.currentTenantId))

const themeOptions = computed(() => [
  { value: 'light' as const, label: t('panel.themeLight'), icon: 'i-lucide-sun' },
  { value: 'dark' as const, label: t('panel.themeDark'), icon: 'i-lucide-moon' },
  { value: 'system' as const, label: t('panel.themeSystem'), icon: 'i-lucide-monitor' },
])
function setTheme(v: 'light' | 'dark' | 'system') { colorMode.preference = v }

// Fase 15: la navegación principal sale del menú configurable del
// tenant (tenant.navMenu: primero la zona de cabecera, después la del
// lateral), con los iconos de siempre por ítem. Sin config se usa la
// lista histórica. Mensajes y Borradores son de la cuenta, no del
// menú: se agregan al final cuando hay sesión.
const PANEL_ICONS: Record<string, string> = {
  inicio: 'i-lucide-home', cursos: 'i-lucide-graduation-cap', eventos: 'i-lucide-calendar-days',
  miembros: 'i-lucide-users', ranking: 'i-lucide-trophy', videos: 'i-lucide-play-square',
  biblioteca: 'i-lucide-book-open', precios: 'i-lucide-tag', reglas: 'i-lucide-scroll-text',
  terminos: 'i-lucide-file-text', privacidad: 'i-lucide-shield',
}
const legalLinks = computed(() => {
  const configured = (tenant.value?.navMenu || []).filter(i => i.visible && i.zone === 'sidebar' && ['reglas', 'terminos', 'privacidad'].includes(i.id))
  if (tenant.value?.navMenu?.length) return configured.map(i => ({ id: i.id, label: navLabel(i), to: i.url, icon: PANEL_ICONS[i.id] || 'i-lucide-link', external: /^https?:\/\//i.test(i.url) }))
  return [
    { id: 'reglas', label: t('nav.reglas'), to: '/guidelines', icon: PANEL_ICONS.reglas, external: false },
    { id: 'terminos', label: t('nav.terminos'), to: '/terms', icon: PANEL_ICONS.terminos, external: false },
    { id: 'privacidad', label: t('nav.privacidad'), to: '/privacy', icon: PANEL_ICONS.privacidad, external: false },
  ]
})
const mainLinks = computed(() => {
  const items = (tenant.value?.navMenu || [])
    .filter(i => i.visible && !['reglas', 'terminos', 'privacidad'].includes(i.id))
  const mappedItems = items
    .map(i => ({ label: navLabel(i), to: i.url, icon: PANEL_ICONS[i.id] || 'i-lucide-link', external: /^https?:\/\//i.test(i.url) }))
  const links = items.length
    ? mappedItems
    : [
        { label: t('nav.inicio'), to: '/feeds', icon: 'i-lucide-home', external: false },
        { label: t('nav.cursos'), to: '/courses', icon: 'i-lucide-graduation-cap', external: false },
        { label: t('nav.eventos'), to: '/events', icon: 'i-lucide-calendar-days', external: false },
        { label: t('nav.miembros'), to: '/members', icon: 'i-lucide-users', external: false },
        { label: t('nav.ranking'), to: '/leaderboard', icon: 'i-lucide-trophy', external: false },
        { label: t('nav.videos'), to: '/videos', icon: 'i-lucide-play-square', external: false },
        { label: t('nav.biblioteca'), to: '/library', icon: 'i-lucide-book-open', external: false },
      ]
  return [
    ...links,
    ...(user.value
      ? [
          { label: t('nav.messages'), to: '/messages', icon: 'i-lucide-message-circle', badge: props.dmUnread, external: false },
          { label: t('nav.myDrafts'), to: '/drafts', icon: 'i-lucide-file-edit', external: false },
        ]
      : []),
  ]
})
</script>

<template>
  <USlideover
    v-model:open="open" side="left" :title="t('panel.navigationMenu')"
    :ui="{ content: 'w-[86vw] max-w-80', header: 'p-0 sm:p-0', body: 'p-0 sm:p-0', footer: 'p-3 sm:p-3' }"
  >
    <template #header>
      <!-- Cabecera de usuario: toque → su perfil. El punto verde es su
           propia presencia (está usando la app). -->
      <NuxtLink
        v-if="user" :to="`/profile/${user.slug}`"
        class="flex w-full min-w-0 items-center gap-3 px-4 py-4 pr-12"
        @click="closePanel"
      >
        <span class="relative shrink-0">
          <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.name)" size="lg" />
          <span class="absolute right-0 bottom-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" />
        </span>
        <span class="min-w-0">
          <span class="block truncate font-semibold">{{ user.name }}</span>
          <span class="block truncate text-sm text-muted">@{{ user.slug }}</span>
        </span>
      </NuxtLink>
      <div v-else class="flex w-full items-center gap-3 px-4 py-4 pr-12">
        <img v-if="tenant?.iconUrl" :src="tenant.iconUrl" alt="" class="size-10 shrink-0 object-contain">
        <span v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
          {{ (tenant?.name || 'C').charAt(0) }}
        </span>
        <span class="min-w-0">
          <span class="block truncate font-semibold">{{ tenant?.name || t('common.community') }}</span>
          <span class="block truncate text-sm text-muted">{{ t('panel.visitingAs') }}</span>
        </span>
      </div>
    </template>

    <template #body>
      <div class="space-y-5 px-4 py-4">
        <!-- Tarjeta de nivel / XP -->
        <div v-if="user" class="rounded-xl border border-default bg-elevated/60 p-3.5">
          <div class="flex items-center gap-3">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <UIcon :name="myLevel?.icon || 'i-lucide-award'" class="text-xl text-primary" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold">{{ myLevel ? t('panel.levelLabel', { name: myLevel.name }) : t('panel.yourProgress') }}</p>
              <p class="text-sm text-muted">{{ t('panel.pointsAccumulated', { count: myPoints }) }}</p>
            </div>
          </div>
          <template v-if="myLevel?.nextAt">
            <UProgress :model-value="levelPct" size="xs" class="mt-3" />
            <p class="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-zap" class="text-primary" />
              {{ t('panel.missingPoints', { count: myLevel.nextAt - myPoints, name: myLevel.nextName || '' }) }}
              <span class="ml-auto font-medium">{{ myPoints }} / {{ myLevel.nextAt }}</span>
            </p>
          </template>
          <p v-else-if="myLevel" class="mt-2 text-xs text-muted">{{ t('panel.maxLevel') }}</p>
        </div>

        <!-- Tema: Claro / Oscuro / Sistema -->
        <div class="flex rounded-full bg-elevated p-1" role="group" :aria-label="t('panel.interfaceTheme')">
          <button
            v-for="opt in themeOptions" :key="opt.value" type="button"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-sm transition"
            :class="colorMode.preference === opt.value ? 'bg-default font-semibold shadow-sm' : 'text-muted'"
            @click="setTheme(opt.value)"
          >
            <UIcon :name="opt.icon" /> {{ opt.label }}
          </button>
        </div>

        <!-- Comunidad actual (+ las demás membresías, si hay) -->
        <div>
          <div class="flex items-center gap-3 rounded-xl border border-default p-3">
            <img v-if="tenant?.iconUrl" :src="tenant.iconUrl" alt="" class="size-10 shrink-0 object-contain">
        <span v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
              {{ (tenant?.name || 'C').charAt(0) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold">{{ tenant?.name || t('common.community') }}</span>
              <span class="block truncate text-xs text-muted">{{ tenant?.slug }}</span>
            </span>
            <UBadge color="primary" variant="soft" size="sm">{{ t('panel.currentBadge') }}</UBadge>
          </div>
          <ul v-if="otherCommunities.length" class="mt-2 space-y-1">
            <li v-for="c in otherCommunities" :key="c.id">
              <a
                v-if="c.domain" :href="`https://${c.domain}`"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-elevated"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" :style="{ backgroundColor: c.brandColor || '#2563eb' }">{{ c.name.charAt(0) }}</span>
                <span class="min-w-0 flex-1 truncate">{{ c.name }}</span>
                <UIcon name="i-lucide-arrow-left-right" class="shrink-0 text-muted" />
              </a>
              <span v-else class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" :style="{ backgroundColor: c.brandColor || '#2563eb' }">{{ c.name.charAt(0) }}</span>
                <span class="min-w-0 flex-1 truncate">{{ c.name }}{{ t('panel.noOwnDomain') }}</span>
              </span>
            </li>
          </ul>
        </div>

        <!-- Navegación principal -->
        <nav :aria-label="t('panel.mainNavigation')">
          <ul class="space-y-0.5">
            <li v-for="item in mainLinks" :key="item.label + item.to">
              <a
                v-if="item.external" :href="item.to" target="_blank" rel="noopener"
                class="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] hover:bg-elevated"
                @click="closePanel"
              >
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated">
                  <UIcon :name="item.icon" class="text-lg text-primary" />
                </span>
                <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                <UIcon name="i-lucide-chevron-right" class="shrink-0 text-muted" />
              </a>
              <NuxtLink
                v-else
                :to="item.to"
                class="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] hover:bg-elevated"
                active-class="bg-elevated font-semibold"
                @click="closePanel"
              >
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated">
                  <UIcon :name="item.icon" class="text-lg text-primary" />
                </span>
                <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                <span v-if="'badge' in item && item.badge" class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{{ item.badge }}</span>
                <UIcon name="i-lucide-chevron-right" class="shrink-0 text-muted" />
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <!-- Canales (mismos grupos y candados que el lateral fijo) -->
        <div v-if="displayGroups.length || legalLinks.length">
          <template v-if="displayGroups.length">
            <div class="mb-1.5 flex items-center gap-1 px-2">
            <h3 class="flex-1 text-xs font-bold tracking-wider text-muted uppercase">{{ t('nav.channels') }}</h3>
            <UButton
              v-if="user?.role === 'admin'" icon="i-lucide-plus" size="xs" color="neutral" variant="ghost"
              :title="t('channelAdmin.groupNewChannel')" :aria-label="t('channelAdmin.groupNewChannel')"
              @click="openChannelCreate(defaultGroupId)"
            />
            <ChannelSectionMenu v-if="user?.role === 'admin'" />
            </div>
            <div v-for="group in displayGroups" :key="group.id" class="mb-0.5">
            <ul class="space-y-0.5">
              <li v-for="ch in group.channels" :key="ch.id">
                <div class="community-channel-row flex items-center rounded-xl" :data-active="$route.path === `/channels/${ch.slug}`">
                  <NuxtLink
                    :to="`/channels/${ch.slug}`"
                    class="community-channel-link flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-[15px]"
                    active-class="font-semibold"
                    @click="closePanel"
                  >
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated">
                      <UIcon :name="ch.icon" class="text-primary" />
                    </span>
                    <span class="min-w-0 flex-1 truncate">{{ ch.name }}</span>
                    <UIcon v-if="ch.type === 'paid'" name="i-lucide-crown" class="shrink-0 text-amber-500" />
                    <UIcon v-else-if="ch.type === 'private'" name="i-lucide-lock" class="shrink-0 text-muted" />
                  </NuxtLink>
                  <ChannelContextMenu :channel="ch" size="sm" />
                </div>
              </li>
            </ul>
            </div>
          </template>
          <div v-if="legalLinks.length" class="mt-3 border-t border-default pt-3">
            <ul class="space-y-0.5">
              <li v-for="item in legalLinks" :key="item.id">
                <a v-if="item.external" :href="item.to" target="_blank" rel="noopener" class="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] hover:bg-elevated" @click="closePanel">
                  <UIcon :name="item.icon" class="shrink-0 text-muted" /> {{ item.label }}
                </a>
                <NuxtLink v-else :to="item.to" class="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] hover:bg-elevated" active-class="bg-elevated font-semibold" @click="closePanel">
                  <UIcon :name="item.icon" class="shrink-0 text-muted" /> {{ item.label }}
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>

        <!-- Accesos secundarios -->
        <div class="border-t border-default pt-3">
          <ul class="space-y-0.5 text-[15px]">
            <li v-if="user">
              <button type="button" class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-elevated" @click="openSettingsFromPanel">
                <UIcon name="i-lucide-settings-2" class="shrink-0 text-muted" /> {{ t('panel.accountSettings') }}
              </button>
            </li>
            <li v-if="user && ['admin', 'moderator', 'course_manager'].includes(user.role || '')">
              <NuxtLink to="/admin" class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-elevated" active-class="bg-elevated font-semibold" @click="closePanel">
                <UIcon name="i-lucide-settings" class="shrink-0 text-muted" /> {{ t('nav.adminPanel') }}
              </NuxtLink>
            </li>
            <!-- Fase 15: Precios y Reglas ya no viven acá — salen del
                 menú configurable en la navegación principal. -->
          </ul>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        v-if="user" color="error" variant="soft" block size="lg"
        icon="i-lucide-log-out" :label="t('nav.logout')"
        @click="emit('logout')"
      />
      <div v-else class="flex w-full gap-2">
        <UButton to="/login" color="neutral" variant="soft" block :label="t('panel.login')" @click="closePanel" />
        <UButton to="/register" block :label="t('panel.createAccount')" @click="closePanel" />
      </div>
    </template>
  </USlideover>
</template>
