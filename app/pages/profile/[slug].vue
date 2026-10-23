<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const toast = useToast()
const { user } = useAuth()
const guestAccess = useGuestAccess()
const { t } = useI18n()
const { fmtDate, fmtDateTime, timeAgo, initials } = useFormat()

interface Badge { id: string, name: string, description: string, icon: string, earned: boolean }
interface LevelBadge { id: number, name: string, min: number, icon: string, order: number, earned: boolean }
interface ProfileEvent { slug: string, title: string, startsAt: string, endsAt: string, location: string, category: string, past: boolean }
interface ProfileData {
  profile: {
    id: number, name: string, slug: string, bio: string, location: string, avatarUrl: string, coverUrl: string, website: string
    memberSince: string, lastSeenAt: string, online: boolean
    points: number
    level: { name: string, min: number, icon: string, nextAt: number | null, nextName: string | null, nextIcon: string | null }
    levels: LevelBadge[]
    badges: Badge[]
    followedByMe: boolean, blockedByMe?: boolean
    stats: { posts: number, comments: number, reactionsReceived: number, coursesCompleted: number, followers: number, following: number }
  }
  posts: PostView[]
  comments: { body: string, created_at: string, post_title: string, post_slug: string, channel_slug: string }[]
  channels: { name: string, slug: string }[]
  events: ProfileEvent[]
  saved?: PostView[]
}
const { data, error, refresh } = await useAsyncData(() => `profile-${slug.value}`, () => user.value ? api<ProfileData>(`/api/profiles/${slug.value}`) : Promise.resolve(null), { watch: [slug, () => user.value?.id] })
onMounted(() => { if (!user.value) guestAccess.requestAccess() })

const isOwn = computed(() => !!user.value && user.value.slug === slug.value)

// Edición del perfil propio: UN solo editor, el modal de Ajustes
// (Fase 11). El botón «Editar perfil» y el botón de portada de la
// cabecera solo abren ese modal en su sección «Perfil» — que ya
// incluye nombre, bio, ubicación, sitio web y las subidas de avatar
// y portada contra los mismos endpoints. Los modales propios que
// esta página tenía desde la Fase 9 se retiraron para no duplicar
// la edición de los mismos datos. Al cerrar el modal, si este es el
// perfil propio, se recargan los datos para reflejar los cambios.
const { openSettings, open: settingsOpen } = useUserSettings()
watch(settingsOpen, (isOpen, wasOpen) => {
  if (!isOpen && wasOpen && isOwn.value) refresh()
})

// Fase 6: seguir / dejar de seguir a este miembro.
const followBusy = ref(false)
async function toggleFollow() {
  if (!data.value) return
  followBusy.value = true
  try {
    await api(`/api/users/${slug.value}/follow`, { method: data.value.profile.followedByMe ? 'DELETE' : 'POST' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: t('profile.actionFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { followBusy.value = false }
}
// Fase 5: bloquear / desbloquear a este miembro (con confirmación).
const confirmBlock = ref(false)
const blockingBusy = ref(false)
async function toggleBlock() {
  if (!data.value) return
  blockingBusy.value = true
  try {
    if (data.value.profile.blockedByMe) {
      await api(`/api/users/${slug.value}/block`, { method: 'DELETE' })
      toast.add({ title: t('profile.unblockedToast'), description: t('profile.unblockedToastText'), color: 'success' })
    }
    else {
      await api(`/api/users/${slug.value}/block`, { method: 'POST' })
      toast.add({ title: t('profile.blockedToast'), description: t('profile.blockedToastText'), color: 'success' })
    }
    confirmBlock.value = false
    await refresh()
  }
  catch (e) {
    toast.add({ title: t('profile.actionFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { blockingBusy.value = false }
}

// Progreso hacia el próximo nivel (barra de la tarjeta de nivel).
const levelPct = computed(() => {
  const p = data.value?.profile
  if (!p) return 0
  if (!p.level.nextAt) return 100
  const span = p.level.nextAt - p.level.min
  return span > 0 ? Math.min(100, Math.max(0, Math.round(((p.points - p.level.min) / span) * 100))) : 0
})
// Insignias de NIVEL ganadas (tarjeta de la columna izquierda) y de
// actividad (Fase 6, fila secundaria de la misma tarjeta).
const levelBadgesEarned = computed(() => (data.value?.profile.levels || []).filter(b => b.earned).length)
const activityEarned = computed(() => (data.value?.profile.badges || []).filter(b => b.earned).length)
// «Sin insignia aún»: todavía no alcanzó el primer nivel con puntos > 0.
const hasLevelBadge = computed(() => {
  const p = data.value?.profile
  if (!p) return false
  const firstPositive = (p.levels || []).find(l => l.min > 0)
  return !firstPositive || p.points >= firstPositive.min
})
const levelCardIcon = computed(() => {
  const p = data.value?.profile
  if (!p) return 'i-lucide-award'
  return hasLevelBadge.value ? p.level.icon : (p.level.nextIcon || p.level.icon)
})
// El sitio web se guardó tal cual se escribió: al enlazar se normaliza.
const websiteHref = computed(() => {
  const w = data.value?.profile.website || ''
  if (!w) return ''
  return /^https?:\/\//i.test(w) ? w : `https://${w}`
})
const websiteLabel = computed(() => (data.value?.profile.website || '').replace(/^https?:\/\//i, ''))

const statCells = computed(() => {
  const s = data.value?.profile.stats
  if (!s) return []
  return [
    { label: t('profile.statPosts'), value: s.posts },
    { label: t('profile.statComments'), value: s.comments },
    { label: t('profile.statReactions'), value: s.reactionsReceived },
    { label: t('profile.statCourses'), value: s.coursesCompleted },
    { label: t('profile.statFollowers'), value: s.followers },
    { label: t('profile.statFollowing'), value: s.following },
  ]
})

// Fase 9: navegación vertical de secciones (etiquetas completas).
const tab = ref('posts')
const navItems = computed(() => {
  const items = [
    { label: t('profile.tabPosts'), value: 'posts', icon: 'i-lucide-newspaper' },
    { label: t('profile.tabComments'), value: 'comments', icon: 'i-lucide-message-circle' },
    { label: t('profile.tabChannels'), value: 'channels', icon: 'i-lucide-hash' },
    { label: t('profile.tabEvents'), value: 'events', icon: 'i-lucide-calendar-days' },
  ]
  // Guardados: solo en el perfil propio (la API ni los devuelve a otros).
  if (isOwn.value) items.push({ label: t('profile.tabSaved'), value: 'saved', icon: 'i-lucide-bookmark' })
  return items
})
</script>

<template>
  <UCard v-if="!user" class="mx-auto max-w-lg">
    <div class="py-6 text-center">
      <UIcon name="i-lucide-user-round-lock" class="mb-3 size-10 text-muted" />
      <h1 class="text-xl font-semibold">{{ t('guest.profileTitle') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('guest.profileDescription') }}</p>
      <UButton class="mt-5" icon="i-lucide-log-in" :label="t('nav.login')" @click="guestAccess.requestAccess()" />
    </div>
  </UCard>
  <UAlert v-else-if="error" color="neutral" variant="soft" icon="i-lucide-user-round-x" :title="t('guest.profileUnavailable')" />
  <div v-else-if="data" class="space-y-5">
    <UCard>
      <div class="relative">
        <div class="h-32 overflow-hidden rounded-lg bg-gradient-to-r from-primary/60 to-primary/20 sm:h-40">
          <img v-if="data.profile.coverUrl" :src="data.profile.coverUrl" alt="" class="h-full w-full object-cover">
        </div>
        <button
          v-if="isOwn" type="button"
          class="absolute right-3 bottom-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-black/55 px-3 py-1.5 text-sm font-medium text-white backdrop-blur transition hover:bg-black/70"
          @click="openSettings('perfil')"
        >
          <UIcon name="i-lucide-camera" />
          {{ data.profile.coverUrl ? t('profile.changeCover') : t('profile.addCover') }}
        </button>
      </div>
      <div class="mt-4 flex flex-wrap items-start gap-4">
        <div class="relative -mt-12 shrink-0">
          <UAvatar :src="data.profile.avatarUrl || undefined" :text="initials(data.profile.name)" size="3xl" class="ring-4 ring-white dark:ring-neutral-900" />
          <span
            class="absolute right-0.5 bottom-0.5 h-4 w-4 rounded-full ring-2 ring-white dark:ring-neutral-900"
            :class="data.profile.online ? 'bg-green-500' : 'bg-neutral-400'"
            :title="data.profile.online ? t('profile.onlineNow') : t('profile.notOnline')"
          />
        </div>
        <div class="min-w-0 flex-1 pt-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-bold">{{ data.profile.name }}</h1>
            <UBadge color="primary" variant="soft" :icon="data.profile.level.icon" size="lg">{{ t('profile.levelBadge', { name: data.profile.level.name }) }}</UBadge>
            <UBadge color="neutral" variant="subtle" size="lg">{{ data.profile.points }} {{ t('common.points') }}</UBadge>
          </div>
          <p class="text-sm text-muted">@{{ data.profile.slug }}</p>
          <p class="mt-0.5 text-sm text-muted">
            {{ t('profile.memberSince', { date: fmtDate(data.profile.memberSince) }) }}<span v-if="data.profile.location"> · {{ data.profile.location }}</span>
            <span v-if="data.profile.online"> · <span class="font-medium text-green-600 dark:text-green-400">{{ t('profile.activeNow') }}</span></span>
            <span v-else-if="data.profile.lastSeenAt"> · {{ t('profile.lastSeen', { time: timeAgo(data.profile.lastSeenAt) }) }}</span>
          </p>
          <UAlert v-if="data.profile.blockedByMe" class="mt-2" color="warning" variant="soft" icon="i-lucide-ban" :title="t('profile.blockedTitle')" :description="t('profile.blockedText')" />
        </div>
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <template v-if="isOwn">
            <UButton size="sm" icon="i-lucide-pencil" :label="t('profile.editProfile')" @click="openSettings('perfil')" />
          </template>
          <template v-else-if="user">
            <UButton
              v-if="!data.profile.blockedByMe" size="sm"
              :color="data.profile.followedByMe ? 'neutral' : 'primary'"
              :variant="data.profile.followedByMe ? 'soft' : 'solid'"
              :icon="data.profile.followedByMe ? 'i-lucide-user-check' : 'i-lucide-user-plus'"
              :label="data.profile.followedByMe ? t('profile.following') : t('profile.follow')"
              :loading="followBusy" @click="toggleFollow"
            />
            <UButton v-if="!data.profile.blockedByMe" size="sm" variant="soft" icon="i-lucide-message-circle" :label="t('profile.sendMessage')" :to="`/messages?with=${data.profile.slug}`" />
            <UButton v-if="!data.profile.blockedByMe" size="sm" color="error" variant="ghost" icon="i-lucide-ban" :label="t('profile.block')" @click="confirmBlock = true" />
            <UButton v-else size="sm" color="neutral" variant="soft" icon="i-lucide-undo-2" :label="t('profile.unblock')" :loading="blockingBusy" @click="toggleBlock" />
          </template>
        </div>
      </div>
      <div class="mt-5 grid grid-cols-3 gap-3 border-t border-default pt-4 sm:grid-cols-6">
        <div v-for="s in statCells" :key="s.label" class="text-center">
          <p class="text-lg font-bold">{{ s.value }}</p>
          <p class="text-[11px] text-muted">{{ s.label }}</p>
        </div>
      </div>
    </UCard>

    <div class="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)_300px]">
      <!-- Columna izquierda: navegación de secciones + insignias -->
      <div class="space-y-5">
        <UCard :ui="{ body: 'p-2 sm:p-2' }">
          <nav class="space-y-1">
            <button
              v-for="item in navItems" :key="item.value" type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition"
              :class="tab === item.value ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-elevated hover:text-highlighted'"
              @click="tab = item.value"
            >
              <UIcon :name="item.icon" class="shrink-0" />
              {{ item.label }}
            </button>
          </nav>
        </UCard>

        <UCard>
          <div class="mb-3 flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-bold">{{ t('profile.badgesEarned') }}</h2>
            <span class="text-xs text-muted">{{ t('profile.ofCount', { a: levelBadgesEarned, b: data.profile.levels.length }) }}</span>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div
              v-for="b in data.profile.levels" :key="b.id"
              class="flex flex-col items-center gap-1.5 rounded-lg border border-default px-1 py-3 text-center"
              :class="{ 'opacity-45': !b.earned }"
              :title="t('profile.badgeTitle', { name: b.name, min: b.min })"
            >
              <span class="relative flex h-11 w-11 items-center justify-center rounded-full" :class="b.earned ? 'bg-primary/15' : 'bg-elevated'">
                <UIcon :name="b.icon" class="text-[22px]" :class="b.earned ? 'text-primary' : 'text-muted'" />
                <span class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-500 text-[9px] font-bold text-white">{{ b.order }}</span>
              </span>
              <span class="text-[11px] leading-tight font-medium">{{ b.name }}</span>
              <span class="text-[10px] text-muted">{{ b.min }} {{ t('common.points') }}</span>
            </div>
          </div>
          <div class="mt-4 border-t border-default pt-3">
            <div class="mb-2 flex items-baseline justify-between gap-2">
              <h3 class="text-xs font-bold tracking-wide text-muted uppercase">{{ t('profile.activityBadges') }}</h3>
              <span class="text-xs text-muted">{{ t('profile.ofCount', { a: activityEarned, b: data.profile.badges.length }) }}</span>
            </div>
            <ul class="space-y-1.5">
              <li
                v-for="b in data.profile.badges" :key="b.id"
                class="flex items-center gap-2 text-xs"
                :class="{ 'opacity-50': !b.earned }"
                :title="b.description"
              >
                <UIcon :name="b.icon" class="shrink-0" :class="b.earned ? 'text-primary' : 'text-muted'" />
                <span class="font-medium">{{ b.name }}</span>
              </li>
            </ul>
            <p class="mt-2 text-[11px] text-muted">{{ t('profile.activityNote') }}</p>
          </div>
        </UCard>
      </div>

      <!-- Columna central: contenido de la sección activa -->
      <div class="min-w-0">
        <div v-if="tab === 'posts'" class="space-y-4">
          <PostCard v-for="p in data.posts" :key="p.id" :post="p" @changed="refresh" />
          <EmptyState v-if="!data.posts.length" icon="i-lucide-newspaper" :title="t('profile.noPostsTitle')" :description="t('profile.noPostsText')" />
        </div>
        <div v-else-if="tab === 'comments'" class="space-y-3">
          <UCard v-for="(c, i) in data.comments" :key="i">
            <p class="text-sm text-muted">
              {{ t('profile.commentedOn') }} <NuxtLink :to="`/p/${c.channel_slug}/${c.post_slug}`" class="font-medium text-primary hover:underline">{{ c.post_title }}</NuxtLink> · {{ fmtDate(c.created_at) }}
            </p>
            <p class="mt-1 whitespace-pre-line text-sm">{{ c.body }}</p>
          </UCard>
          <EmptyState v-if="!data.comments.length" icon="i-lucide-message-circle" :title="t('profile.noCommentsTitle')" :description="t('profile.noCommentsText')" />
        </div>
        <div v-else-if="tab === 'channels'" class="flex flex-wrap gap-2">
          <NuxtLink v-for="ch in data.channels" :key="ch.slug" :to="`/channels/${ch.slug}`">
            <UBadge color="neutral" variant="soft" size="lg" icon="i-lucide-hash">{{ ch.name }}</UBadge>
          </NuxtLink>
          <EmptyState v-if="!data.channels.length" class="w-full" icon="i-lucide-hash" :title="t('profile.noChannelsTitle')" :description="t('profile.noChannelsText')" />
        </div>
        <div v-else-if="tab === 'events'" class="space-y-3">
          <UCard v-for="e in data.events" :key="e.slug">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex-1">
                <NuxtLink :to="`/events/${e.slug}`" class="font-bold hover:underline">{{ e.title }}</NuxtLink>
                <p class="mt-0.5 text-sm text-muted">{{ fmtDateTime(e.startsAt) }} · {{ e.location }}</p>
              </div>
              <UBadge :color="e.past ? 'neutral' : 'success'" variant="soft">{{ e.past ? t('profile.finished') : t('profile.confirmed') }}</UBadge>
            </div>
          </UCard>
          <EmptyState v-if="!data.events.length" icon="i-lucide-calendar-days" :title="t('profile.noEventsTitle')" :description="t('profile.noEventsText')" />
        </div>
        <div v-else-if="tab === 'saved'" class="space-y-4">
          <PostCard v-for="p in data.saved || []" :key="p.id" :post="p" @changed="refresh" />
          <EmptyState v-if="!(data.saved?.length)" icon="i-lucide-bookmark" :title="t('profile.noSavedTitle')" :description="t('profile.noSavedText')" />
        </div>
      </div>

      <!-- Columna derecha: nivel + acerca de -->
      <div class="space-y-5">
        <UCard>
          <div class="flex flex-col items-center text-center">
            <span class="relative flex h-16 w-16 items-center justify-center rounded-full" :class="hasLevelBadge ? 'bg-primary/15' : 'bg-elevated'">
              <UIcon :name="levelCardIcon" class="text-3xl" :class="hasLevelBadge ? 'text-primary' : 'text-muted'" />
            </span>
            <h2 class="mt-2 font-bold">{{ hasLevelBadge ? data.profile.level.name : t('profile.noBadgeYet') }}</h2>
            <p class="text-sm text-muted">{{ t('profile.pointsAccumulated', { count: data.profile.points }) }}</p>
          </div>
          <template v-if="data.profile.level.nextAt">
            <div class="mt-4 flex items-baseline justify-between text-xs">
              <span class="text-muted">{{ t('profile.progressTo', { name: data.profile.level.nextName || '' }) }}</span>
              <span class="font-semibold">{{ data.profile.points }} / {{ data.profile.level.nextAt }}</span>
            </div>
            <UProgress :model-value="levelPct" size="sm" class="mt-1.5" />
            <p class="mt-2 text-center text-xs text-muted">
              {{ t('profile.missingPoints', { count: data.profile.level.nextAt - data.profile.points, name: data.profile.level.nextName || '' }) }}
            </p>
          </template>
          <p v-else class="mt-3 text-center text-xs text-muted">{{ t('profile.maxLevel') }}</p>
        </UCard>

        <UCard>
          <h2 class="mb-3 text-sm font-bold">{{ t('profile.about') }}</h2>
          <p v-if="data.profile.bio" class="whitespace-pre-line text-sm">{{ data.profile.bio }}</p>
          <p v-else class="text-sm text-muted">{{ t('profile.noBio') }}</p>
          <ul class="mt-3 space-y-2 text-sm">
            <li v-if="data.profile.location" class="flex items-center gap-2">
              <UIcon name="i-lucide-map-pin" class="text-muted" /> {{ data.profile.location }}
            </li>
            <li v-if="websiteHref" class="flex items-center gap-2">
              <UIcon name="i-lucide-globe" class="text-muted" />
              <a :href="websiteHref" target="_blank" rel="noopener noreferrer" class="font-medium text-primary hover:underline">{{ websiteLabel }}</a>
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-lucide-calendar" class="text-muted" /> {{ t('profile.memberSince', { date: fmtDate(data.profile.memberSince) }) }}
            </li>
          </ul>
          <div class="mt-4 border-t border-default pt-3">
            <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{{ t('profile.activeIn') }}</h3>
            <ul v-if="data.channels.length" class="space-y-1.5">
              <li v-for="ch in data.channels" :key="ch.slug">
                <NuxtLink :to="`/channels/${ch.slug}`" class="flex items-center gap-1.5 text-sm font-medium hover:text-primary">
                  <UIcon name="i-lucide-hash" class="text-muted" /> {{ ch.name }}
                </NuxtLink>
              </li>
            </ul>
            <p v-else class="text-sm text-muted">{{ t('profile.notFollowingYet') }}</p>
          </div>
        </UCard>
      </div>
    </div>

    <UModal v-model:open="confirmBlock" :title="t('profile.blockModalTitle')" :description="t('profile.blockModalText', { name: data.profile.name })">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="confirmBlock = false" />
          <UButton color="error" :label="t('profile.yesBlock')" icon="i-lucide-ban" :loading="blockingBusy" @click="toggleBlock" />
        </div>
      </template>
    </UModal>
  </div>
</template>
