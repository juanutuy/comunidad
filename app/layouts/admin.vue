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
// La autorización se sigue decidiendo en el servidor: las APIs
// /api/admin/** exigen la capacidad de cada sección (requireAdmin,
// requireModerator o requireCourseManager) y cada página muestra su
// aviso si la cuenta no la tiene. Fase 14: el riel se filtra por rol
// — un moderador ve Miembros y Moderación; un encargado de cursos,
// solo Cursos — y solo se pinta para el staff; sin rol de staff se
// ve la barra y el aviso de la página, nunca datos.
const { user, tenant, logout } = useAuth()
const { initials } = useFormat()
const router = useRouter()
const route = useRoute()

const sections = [
  { label: 'Panel', icon: 'i-lucide-layout-dashboard', to: '/admin', exact: true, roles: ['admin'] },
  { label: 'Miembros', icon: 'i-lucide-users', to: '/admin/members', roles: ['admin', 'moderator'] },
  { label: 'Canales', icon: 'i-lucide-hash', to: '/admin/channels', roles: ['admin'] },
  { label: 'Cursos', icon: 'i-lucide-graduation-cap', to: '/admin/courses', roles: ['admin', 'course_manager'] },
  { label: 'Eventos', icon: 'i-lucide-calendar-days', to: '/admin/events', roles: ['admin'] },
  { label: 'Moderación', icon: 'i-lucide-shield-alert', to: '/admin/moderation', roles: ['admin', 'moderator'] },
  { label: 'Gamificación', icon: 'i-lucide-trophy', to: '/admin/gamification', roles: ['admin'] },
  { label: 'Planes', icon: 'i-lucide-credit-card', to: '/admin/plans', roles: ['admin'] },
  { label: 'Dominios', icon: 'i-lucide-globe', to: '/admin/domains', roles: ['admin'] },
  { label: 'Correos', icon: 'i-lucide-mail', to: '/admin/emails', roles: ['admin'] },
  { label: 'Ajustes de la comunidad', icon: 'i-lucide-settings', to: '/admin/settings', roles: ['admin'] },
]
const visibleSections = computed(() => sections.filter(s => !!user.value?.role && s.roles.includes(user.value.role)))
const isStaff = computed(() => visibleSections.value.length > 0)
function isActive(item: { to: string, exact?: boolean }) {
  if (item.exact) return route.path === item.to
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const railOpen = ref(false)
watch(() => route.fullPath, () => { railOpen.value = false })

const { openSettings: openUserSettings } = useUserSettings()

async function doLogout() {
  await logout()
  router.push('/feeds')
}

const userMenuItems = computed(() => [
  [
    { label: 'Mi perfil', icon: 'i-lucide-user', to: `/profile/${user.value?.slug}` },
    { label: 'Ajustes de cuenta', icon: 'i-lucide-settings-2', onSelect: () => openUserSettings() },
    { label: 'Volver a la comunidad', icon: 'i-lucide-arrow-left', to: '/feeds' },
  ],
  [{ label: 'Cerrar sesión', icon: 'i-lucide-log-out', onSelect: doLogout }],
])
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <header class="sticky top-0 z-40 border-b border-default bg-white/90 backdrop-blur dark:bg-neutral-900/90">
      <div class="flex h-14 items-center gap-3 px-4">
        <UButton
          v-if="isStaff" class="md:hidden" color="neutral" variant="ghost"
          icon="i-lucide-menu" aria-label="Abrir el menú de la consola" @click="railOpen = true"
        />
        <UButton to="/feeds" color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="Volver a la comunidad" class="-ml-2 shrink-0" />
        <span class="hidden h-6 w-px bg-neutral-200 sm:block dark:bg-neutral-800" />
        <span class="flex min-w-0 items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
            {{ (tenant?.name || 'C').charAt(0) }}
          </span>
          <span class="hidden truncate font-bold sm:block">{{ tenant?.name || 'Comunidad' }}</span>
          <UBadge color="primary" variant="subtle" class="shrink-0">Administración</UBadge>
        </span>
        <span class="flex-1" />
        <UButton to="/feeds" color="neutral" variant="ghost" icon="i-lucide-eye" label="Ver la comunidad" class="hidden md:inline-flex" />
        <UColorModeButton class="hidden md:inline-flex" />
        <template v-if="user">
          <UDropdownMenu :items="userMenuItems">
            <UButton color="neutral" variant="ghost" class="gap-2">
              <UAvatar :src="user.avatarUrl || undefined" :text="initials(user.name)" size="sm" />
              <span class="hidden max-w-32 truncate lg:block">{{ user.name }}</span>
            </UButton>
          </UDropdownMenu>
        </template>
        <UButton v-else to="/login" color="neutral" variant="ghost" label="Iniciar sesión" />
      </div>
    </header>

    <div class="mx-auto flex max-w-[1400px] items-start gap-6 px-4 py-6">
      <!-- Riel de secciones: solo iconos en md, completo desde lg. -->
      <aside v-if="isStaff" class="sticky top-20 hidden w-14 shrink-0 md:block lg:w-56">
        <nav aria-label="Secciones de administración">
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

      <main class="min-w-0 flex-1">
        <slot />
      </main>
    </div>

    <!-- Riel como panel deslizable en teléfono. -->
    <USlideover v-model:open="railOpen" side="left" title="Administración" description="Secciones de la consola de administración.">
      <template #body>
        <nav aria-label="Secciones de administración">
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
  </div>
</template>
