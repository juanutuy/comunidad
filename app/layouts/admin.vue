<script setup lang="ts">
// Consola de administración dedicada (Fase 11): las rutas /admin/** ya
// no viven dentro del layout de miembro. Como en la referencia, la
// administración es una superficie propia a pantalla completa: barra
// superior mínima (volver a la comunidad + nombre + «Administración»),
// riel de secciones a la izquierda y el contenido. Sin lateral de
// canales, sin RightRail, sin barra inferior ni panel móvil.
//
// Responsive del riel: completo (icono + etiqueta) desde lg; solo
// iconos en md–lg; oculto en teléfono, donde se abre como panel
// deslizable desde el botón de menú de la barra superior.
//
// El middleware global comprueba sesión y rol antes de renderizar /admin/**.
// Las APIs mantienen sus comprobaciones de capacidad por sección.
// El layout exige además staff activo para ocultarse al perder la sesión.
const { user, tenant, status, logout } = useAuth()
const { t } = useI18n()
const { initials } = useFormat()
const router = useRouter()
const route = useRoute()

// Fase 18: los rótulos del cascarón de la consola sí se traducen; los
// cuerpos de las páginas /admin/** quedan en español en esta fase
// (declarado en el README).
const sections = computed(() => [
  { label: t('adminShell.sectionPanel'), icon: 'i-lucide-layout-dashboard', to: '/admin', exact: true, roles: ['admin'] },
  { label: t('adminShell.sectionMembers'), icon: 'i-lucide-users', to: '/admin/members', roles: ['admin', 'moderator'] },
  { label: t('adminShell.sectionChannels'), icon: 'i-lucide-hash', to: '/admin/channels', roles: ['admin'] },
  { label: t('adminShell.sectionContent'), icon: 'i-lucide-folder-open', to: '/admin/content', roles: ['admin', 'moderator'] },
  { label: t('adminShell.sectionCourses'), icon: 'i-lucide-graduation-cap', to: '/admin/courses', roles: ['admin', 'course_manager'] },
  { label: t('adminShell.sectionEvents'), icon: 'i-lucide-calendar-days', to: '/admin/events', roles: ['admin'] },
  { label: t('adminShell.sectionModeration'), icon: 'i-lucide-shield-alert', to: '/admin/moderation', roles: ['admin', 'moderator'] },
  { label: t('adminShell.sectionGamification'), icon: 'i-lucide-trophy', to: '/admin/gamification', roles: ['admin'] },
  { label: t('adminShell.sectionPlans'), icon: 'i-lucide-credit-card', to: '/admin/plans', roles: ['admin'] },
  { label: t('adminShell.sectionEarnings'), icon: 'i-lucide-chart-line', to: '/admin/earnings', roles: ['admin', 'moderator'] },
  { label: t('adminShell.sectionDomains'), icon: 'i-lucide-globe', to: '/admin/domains', roles: ['admin'] },
  { label: t('adminShell.sectionEmails'), icon: 'i-lucide-mail', to: '/admin/emails', roles: ['admin'] },
  { label: t('adminShell.sectionSettings'), icon: 'i-lucide-settings', to: '/admin/settings', roles: ['admin'] },
])
const visibleSections = computed(() => sections.value.filter(s => !!user.value?.role && s.roles.includes(user.value.role)))
const isStaff = computed(() => status.value === 'active' && visibleSections.value.length > 0)
function isActive(item: { to: string, exact?: boolean }) {
  if (item.exact) return route.path === item.to
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const railOpen = ref(false)
// Fase 16-E: marco fijo también en la consola. El contenido de la
// sección es el desplazador (el riel queda fijo con su propio
// scroll) y al cambiar de sección — o de subsección, que vive en
// ?tab= — vuelve arriba: acá sí se mira el fullPath, porque cambiar
// de pestaña de subsección ES cambiar de vista.
const contentScroller = ref<HTMLElement | null>(null)
watch(() => route.fullPath, () => {
  railOpen.value = false
  nextTick(() => contentScroller.value?.scrollTo({ top: 0 }))
})

const { openSettings: openUserSettings } = useUserSettings()

async function doLogout() {
  await logout()
  router.push('/feeds')
}

const userMenuItems = computed(() => [
  [
    { label: t('nav.myProfile'), icon: 'i-lucide-user', to: `/profile/${user.value?.slug}` },
    { label: t('nav.accountSettings'), icon: 'i-lucide-settings-2', onSelect: () => openUserSettings() },
    { label: t('adminShell.backToCommunity'), icon: 'i-lucide-arrow-left', to: '/feeds' },
  ],
  [{ label: t('nav.logout'), icon: 'i-lucide-log-out', onSelect: doLogout }],
])
</script>

<template>
  <div v-if="isStaff" data-frame="admin" class="flex h-dvh flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
    <header class="z-40 shrink-0 border-b border-default bg-white/90 backdrop-blur dark:bg-neutral-900/90">
      <div class="flex h-14 items-center gap-3 px-4">
        <UButton
          v-if="isStaff" class="md:hidden" color="neutral" variant="ghost"
          icon="i-lucide-menu" :aria-label="t('adminShell.consoleMenu')" @click="railOpen = true"
        />
        <UButton to="/feeds" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="t('adminShell.backToCommunity')" class="-ml-2 shrink-0" />
        <span class="hidden h-6 w-px bg-neutral-200 sm:block dark:bg-neutral-800" />
        <span class="flex min-w-0 items-center gap-2">
          <img v-if="tenant?.iconUrl" :src="tenant.iconUrl" alt="" class="h-8 w-8 shrink-0 object-contain">
          <span v-else class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
            {{ (tenant?.name || 'C').charAt(0) }}
          </span>
          <span class="hidden truncate font-bold sm:block">{{ tenant?.name || 'Comunidad' }}</span>
          <UBadge color="primary" variant="subtle" class="shrink-0">{{ t('adminShell.administration') }}</UBadge>
        </span>
        <span class="flex-1" />
        <UButton to="/feeds" color="neutral" variant="ghost" icon="i-lucide-eye" :label="t('adminShell.viewCommunity')" class="hidden md:inline-flex" />
        <UColorModeButton class="hidden md:inline-flex" />
        <template v-if="user">
          <UDropdownMenu :items="userMenuItems">
            <UButton color="neutral" variant="ghost" class="gap-2">
              <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.name)" size="sm" />
              <span class="hidden max-w-32 truncate lg:block">{{ user.name }}</span>
            </UButton>
          </UDropdownMenu>
        </template>
        <UButton v-else to="/login" color="neutral" variant="ghost" :label="t('nav.login')" />
      </div>
    </header>

    <div class="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 gap-6 px-4">
      <!-- Riel de secciones FIJO (Fase 16-E): solo iconos en md,
           completo desde lg; si su contenido no cabe, se desplaza
           por dentro sin mover el contenido. -->
      <aside v-if="isStaff" data-scroll-region="admin-rail" class="hidden min-h-0 w-14 shrink-0 overflow-y-auto py-6 md:block lg:w-56">
        <nav :aria-label="t('adminShell.consoleNavLabel')">
          <ul class="space-y-0.5">
            <li v-for="item in visibleSections" :key="item.to">
              <NuxtLink
                :to="item.to" :title="item.label"
                class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-elevated"
                :class="isActive(item) ? 'bg-elevated font-semibold text-highlighted' : 'text-muted'"
              >
                <UIcon :name="item.icon" class="shrink-0 text-base" />
                <span class="hidden truncate lg:block">{{ item.label }}</span>
              </NuxtLink>
            </li>
          </ul>
        </nav>
      </aside>

      <main ref="contentScroller" data-scroll-region="admin-content" class="min-h-0 min-w-0 flex-1 overflow-y-auto py-6">
        <slot />
      </main>
    </div>

    <!-- Riel como panel deslizable en teléfono. -->
    <USlideover v-model:open="railOpen" side="left" :title="t('adminShell.administration')" :description="t('adminShell.slideoverText')">
      <template #body>
        <nav :aria-label="t('adminShell.consoleNavLabel')">
          <ul class="space-y-0.5">
            <li v-for="item in visibleSections" :key="item.to">
              <NuxtLink
                :to="item.to"
                class="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] hover:bg-elevated"
                :class="isActive(item) ? 'bg-elevated font-semibold' : ''"
                @click="railOpen = false"
              >
                <UIcon :name="item.icon" class="shrink-0" /> {{ item.label }}
              </NuxtLink>
            </li>
          </ul>
        </nav>
      </template>
    </USlideover>

    <UserSettingsModal />
    <!-- Fase 16-F: el modal único de canal también vive en la
         consola (lo abre Administrar canales), y el anfitrión de
         administración en contexto con él (eliminar canal pide la
         misma confirmación en las dos superficies). -->
    <ChannelFormModal />
    <ChannelAdminHost />
  </div>
</template>
