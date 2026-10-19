<script setup lang="ts">
// Panel deslizable móvil (Fase 10, estilo referencia): UN solo cajón
// ordenado que reemplaza la fila deslizable de destinos de la Fase 7.
// De arriba abajo: cabecera de usuario, tarjeta de nivel/XP (datos
// reales de la gamificación del tenant, misma fuente que el perfil),
// selector de tema segmentado, fila de comunidad, navegación principal
// con chevrons, canales con sus candados y Cerrar sesión en rojo.
// Solo se monta en el layout; se abre desde la barra superior y desde
// la barra inferior (estado compartido en useMobilePanel).
interface ChannelItem { id: number, slug: string, name: string, icon: string, type: string, priceCents: number, following: boolean }
interface ChannelGroup { id: number, name: string, channels: ChannelItem[] }
interface LevelInfo { name: string, min: number, icon: string, nextAt: number | null, nextName: string | null, nextIcon: string | null }
interface Community { id: number, slug: string, name: string, brandColor: string, role: string, domain: string | null }

const props = defineProps<{ dmUnread: number, groups: ChannelGroup[] }>()
const emit = defineEmits<{ logout: [] }>()

const { user, tenant } = useAuth()
const { initials } = useFormat()
const api = useApi()
const { open, closePanel } = useMobilePanel()
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

const themeOptions = [
  { value: 'light', label: 'Claro', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Oscuro', icon: 'i-lucide-moon' },
  { value: 'system', label: 'Sistema', icon: 'i-lucide-monitor' },
] as const
function setTheme(v: 'light' | 'dark' | 'system') { colorMode.preference = v }

const mainLinks = computed(() => [
  { label: 'Inicio', to: '/feeds', icon: 'i-lucide-home' },
  { label: 'Cursos', to: '/courses', icon: 'i-lucide-graduation-cap' },
  { label: 'Eventos', to: '/events', icon: 'i-lucide-calendar-days' },
  { label: 'Miembros', to: '/members', icon: 'i-lucide-users' },
  { label: 'Ranking', to: '/leaderboard', icon: 'i-lucide-trophy' },
  { label: 'Videos', to: '/videos', icon: 'i-lucide-play-square' },
  { label: 'Biblioteca', to: '/library', icon: 'i-lucide-book-open' },
  ...(user.value
    ? [
        { label: 'Mensajes', to: '/messages', icon: 'i-lucide-message-circle', badge: props.dmUnread },
        { label: 'Borradores', to: '/drafts', icon: 'i-lucide-file-edit' },
      ]
    : []),
])
</script>

<template>
  <USlideover
    v-model:open="open" side="left" title="Menú de navegación"
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
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
          {{ (tenant?.name || 'C').charAt(0) }}
        </span>
        <span class="min-w-0">
          <span class="block truncate font-semibold">{{ tenant?.name || 'Comunidad' }}</span>
          <span class="block truncate text-sm text-muted">Estás como visitante</span>
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
              <p class="truncate font-semibold">{{ myLevel ? `Nivel ${myLevel.name}` : 'Tu progreso' }}</p>
              <p class="text-sm text-muted">{{ myPoints }} pts acumulados</p>
            </div>
          </div>
          <template v-if="myLevel?.nextAt">
            <UProgress :model-value="levelPct" size="xs" class="mt-3" />
            <p class="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-zap" class="text-primary" />
              Te faltan {{ myLevel.nextAt - myPoints }} pts para {{ myLevel.nextName }}
              <span class="ml-auto font-medium">{{ myPoints }} / {{ myLevel.nextAt }}</span>
            </p>
          </template>
          <p v-else-if="myLevel" class="mt-2 text-xs text-muted">Nivel máximo alcanzado.</p>
        </div>

        <!-- Tema: Claro / Oscuro / Sistema -->
        <div class="flex rounded-full bg-elevated p-1" role="group" aria-label="Tema de la interfaz">
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
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
              {{ (tenant?.name || 'C').charAt(0) }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-semibold">{{ tenant?.name || 'Comunidad' }}</span>
              <span class="block truncate text-xs text-muted">{{ tenant?.slug }}</span>
            </span>
            <UBadge color="primary" variant="soft" size="sm">Actual</UBadge>
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
                <span class="min-w-0 flex-1 truncate">{{ c.name }} · sin dominio propio</span>
              </span>
            </li>
          </ul>
        </div>

        <!-- Navegación principal -->
        <nav aria-label="Navegación principal">
          <ul class="space-y-0.5">
            <li v-for="item in mainLinks" :key="item.to">
              <NuxtLink
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
        <div v-if="groups.length">
          <h3 class="mb-1.5 px-2 text-xs font-bold tracking-wider text-muted uppercase">Canales</h3>
          <div v-for="group in groups" :key="group.id" class="mb-2">
            <p class="mb-0.5 px-2 text-[11px] font-semibold tracking-wide text-muted">{{ group.name }}</p>
            <ul class="space-y-0.5">
              <li v-for="ch in group.channels" :key="ch.id">
                <NuxtLink
                  :to="`/channels/${ch.slug}`"
                  class="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] hover:bg-elevated"
                  active-class="bg-elevated font-semibold"
                  @click="closePanel"
                >
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated">
                    <UIcon :name="ch.icon" class="text-primary" />
                  </span>
                  <span class="min-w-0 flex-1 truncate">{{ ch.name }}</span>
                  <UIcon v-if="ch.type === 'paid'" name="i-lucide-crown" class="shrink-0 text-amber-500" />
                  <UIcon v-else-if="ch.type === 'private'" name="i-lucide-lock" class="shrink-0 text-muted" />
                  <UIcon name="i-lucide-chevron-right" class="shrink-0 text-muted" />
                </NuxtLink>
              </li>
            </ul>
          </div>
        </div>

        <!-- Accesos secundarios -->
        <div class="border-t border-default pt-3">
          <ul class="space-y-0.5 text-[15px]">
            <li v-if="user">
              <NuxtLink to="/settings" class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-elevated" active-class="bg-elevated font-semibold" @click="closePanel">
                <UIcon name="i-lucide-settings-2" class="shrink-0 text-muted" /> Ajustes de cuenta
              </NuxtLink>
            </li>
            <li v-if="user?.role === 'admin'">
              <NuxtLink to="/admin" class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-elevated" active-class="bg-elevated font-semibold" @click="closePanel">
                <UIcon name="i-lucide-settings" class="shrink-0 text-muted" /> Panel de administración
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/pricing" class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-elevated" active-class="bg-elevated font-semibold" @click="closePanel">
                <UIcon name="i-lucide-tag" class="shrink-0 text-muted" /> Precios
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/guidelines" class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-elevated" active-class="bg-elevated font-semibold" @click="closePanel">
                <UIcon name="i-lucide-scroll-text" class="shrink-0 text-muted" /> Reglas
              </NuxtLink>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        v-if="user" color="error" variant="soft" block size="lg"
        icon="i-lucide-log-out" label="Cerrar sesión"
        @click="emit('logout')"
      />
      <div v-else class="flex w-full gap-2">
        <UButton to="/login" color="neutral" variant="soft" block label="Iniciar sesión" @click="closePanel" />
        <UButton to="/register" block label="Crear cuenta" @click="closePanel" />
      </div>
    </template>
  </USlideover>
</template>
