<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const toast = useToast()
const { user, fetchMe } = useAuth()
const { fmtDate, fmtDateTime, timeAgo, initials } = useFormat()

interface Badge { id: string, name: string, description: string, icon: string, earned: boolean }
interface ProfileEvent { slug: string, title: string, startsAt: string, endsAt: string, location: string, category: string, past: boolean }
interface ProfileData {
  profile: {
    id: number, name: string, slug: string, bio: string, location: string, avatarUrl: string, coverUrl: string, website: string
    memberSince: string, lastSeenAt: string, online: boolean
    points: number, level: { name: string, min: number, nextAt: number | null, nextName: string | null }, badges: Badge[]
    followedByMe: boolean, blockedByMe?: boolean
    stats: { posts: number, comments: number, reactionsReceived: number, coursesCompleted: number, followers: number, following: number }
  }
  posts: PostView[]
  comments: { body: string, created_at: string, post_title: string, post_slug: string, channel_slug: string }[]
  channels: { name: string, slug: string }[]
  events: ProfileEvent[]
  saved?: PostView[]
}
const { data, refresh } = await useAsyncData(() => `profile-${slug.value}`, () => api<ProfileData>(`/api/profiles/${slug.value}`), { watch: [slug] })

const isOwn = computed(() => !!user.value && user.value.slug === slug.value)
const uploadingAvatar = ref(false)
async function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingAvatar.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'avatar')
    await api('/api/uploads', { method: 'POST', body: fd })
    toast.add({ title: 'Foto de perfil actualizada', color: 'success' })
    await fetchMe()
    await refresh()
  }
  catch (err) {
    toast.add({ title: 'No se pudo subir la foto', description: (err as { data?: { message?: string } }).data?.message || 'Probá con otra imagen.', color: 'error' })
  }
  finally { uploadingAvatar.value = false }
}
// Fase 6: foto de portada real (kind 'cover'). Sin portada, el perfil
// muestra el degradado de marca por defecto.
const uploadingCover = ref(false)
async function onCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingCover.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'cover')
    await api('/api/uploads', { method: 'POST', body: fd })
    toast.add({ title: 'Foto de portada actualizada', color: 'success' })
    await refresh()
  }
  catch (err) {
    toast.add({ title: 'No se pudo subir la portada', description: (err as { data?: { message?: string } }).data?.message || 'Probá con otra imagen.', color: 'error' })
  }
  finally { uploadingCover.value = false }
}
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
    toast.add({ title: 'No se pudo completar la acción', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
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
      toast.add({ title: 'Miembro desbloqueado', description: 'Su contenido vuelve a verse en tu feed.', color: 'success' })
    }
    else {
      await api(`/api/users/${slug.value}/block`, { method: 'POST' })
      toast.add({ title: 'Miembro bloqueado', description: 'Ya no vas a ver sus publicaciones ni comentarios, y los mensajes directos quedan impedidos.', color: 'success' })
    }
    confirmBlock.value = false
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo completar la acción', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { blockingBusy.value = false }
}

// Progreso hacia el próximo nivel (barra de la tarjeta lateral).
const levelPct = computed(() => {
  const p = data.value?.profile
  if (!p) return 0
  if (!p.level.nextAt) return 100
  const span = p.level.nextAt - p.level.min
  return span > 0 ? Math.min(100, Math.max(0, Math.round(((p.points - p.level.min) / span) * 100))) : 0
})
const badgesEarned = computed(() => (data.value?.profile.badges || []).filter(b => b.earned).length)
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
    { label: 'Publicaciones', value: s.posts },
    { label: 'Comentarios', value: s.comments },
    { label: 'Reacciones recibidas', value: s.reactionsReceived },
    { label: 'Cursos completados', value: s.coursesCompleted },
    { label: 'Seguidores', value: s.followers },
    { label: 'Siguiendo', value: s.following },
  ]
})

const tab = ref('posts')
const tabItems = computed(() => {
  const items = [
    { label: 'Publicaciones', value: 'posts', icon: 'i-lucide-newspaper' },
    { label: 'Comentarios', value: 'comments', icon: 'i-lucide-message-circle' },
    { label: 'Canales', value: 'channels', icon: 'i-lucide-hash' },
    { label: 'Eventos', value: 'events', icon: 'i-lucide-calendar-days' },
  ]
  // Guardados: solo en el perfil propio (la API ni los devuelve a otros).
  if (isOwn.value) items.push({ label: 'Guardados', value: 'saved', icon: 'i-lucide-bookmark' })
  return items
})
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UCard>
      <div class="relative">
        <div class="h-40 overflow-hidden rounded-lg bg-gradient-to-r from-primary/60 to-primary/20 sm:h-48">
          <img v-if="data.profile.coverUrl" :src="data.profile.coverUrl" alt="" class="h-full w-full object-cover">
        </div>
        <label v-if="isOwn" class="absolute right-3 bottom-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-black/55 px-3 py-1.5 text-sm font-medium text-white backdrop-blur transition hover:bg-black/70">
          <UIcon name="i-lucide-camera" />
          {{ uploadingCover ? 'Subiendo…' : 'Cambiar portada' }}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" :disabled="uploadingCover" @change="onCoverChange">
        </label>
      </div>
      <div class="mt-4 flex flex-wrap items-start gap-4">
        <div class="relative -mt-12 shrink-0">
          <UAvatar :src="data.profile.avatarUrl || undefined" :text="initials(data.profile.name)" size="3xl" class="ring-4 ring-white dark:ring-neutral-900" />
          <span
            class="absolute right-0.5 bottom-0.5 h-4 w-4 rounded-full ring-2 ring-white dark:ring-neutral-900"
            :class="data.profile.online ? 'bg-green-500' : 'bg-neutral-400'"
            :title="data.profile.online ? 'En línea ahora' : 'No está en línea'"
          />
        </div>
        <div class="min-w-0 flex-1 pt-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-bold">{{ data.profile.name }}</h1>
            <UBadge color="primary" variant="soft" icon="i-lucide-award" size="lg">Nivel {{ data.profile.level.name }}</UBadge>
            <UBadge color="neutral" variant="subtle" size="lg">{{ data.profile.points }} pts</UBadge>
          </div>
          <p class="text-sm text-muted">@{{ data.profile.slug }}</p>
          <p class="mt-0.5 text-sm text-muted">
            Miembro desde {{ fmtDate(data.profile.memberSince) }}<span v-if="data.profile.location"> · {{ data.profile.location }}</span>
            <span v-if="data.profile.online"> · <span class="font-medium text-green-600 dark:text-green-400">Activo ahora</span></span>
            <span v-else-if="data.profile.lastSeenAt"> · Última vez {{ timeAgo(data.profile.lastSeenAt) }}</span>
          </p>
          <UAlert v-if="data.profile.blockedByMe" class="mt-2" color="warning" variant="soft" icon="i-lucide-ban" title="Tenés bloqueado a este miembro" description="No ves sus publicaciones ni comentarios y los mensajes directos entre ustedes están impedidos. Podés desbloquearlo desde aquí o desde Ajustes de cuenta." />
        </div>
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <template v-if="isOwn">
            <UButton size="sm" variant="soft" icon="i-lucide-pencil" label="Editar perfil" to="/settings" />
            <label class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary hover:underline">
              <UIcon name="i-lucide-camera" />
              {{ uploadingAvatar ? 'Subiendo…' : 'Cambiar foto de perfil' }}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" :disabled="uploadingAvatar" @change="onAvatarChange">
            </label>
          </template>
          <template v-else-if="user">
            <UButton
              v-if="!data.profile.blockedByMe" size="sm"
              :color="data.profile.followedByMe ? 'neutral' : 'primary'"
              :variant="data.profile.followedByMe ? 'soft' : 'solid'"
              :icon="data.profile.followedByMe ? 'i-lucide-user-check' : 'i-lucide-user-plus'"
              :label="data.profile.followedByMe ? 'Siguiendo' : 'Seguir'"
              :loading="followBusy" @click="toggleFollow"
            />
            <UButton v-if="!data.profile.blockedByMe" size="sm" variant="soft" icon="i-lucide-message-circle" label="Enviar mensaje" :to="`/messages?with=${data.profile.slug}`" />
            <UButton v-if="!data.profile.blockedByMe" size="sm" color="error" variant="ghost" icon="i-lucide-ban" label="Bloquear" @click="confirmBlock = true" />
            <UButton v-else size="sm" color="neutral" variant="soft" icon="i-lucide-undo-2" label="Desbloquear" :loading="blockingBusy" @click="toggleBlock" />
          </template>
        </div>
      </div>
      <div class="mt-5 grid grid-cols-3 gap-3 border-t border-default pt-4 sm:grid-cols-6">
        <div v-for="s in statCells" :key="s.label" class="text-center">
          <p class="text-xl font-bold">{{ s.value }}</p>
          <p class="text-xs text-muted">{{ s.label }}</p>
        </div>
      </div>
    </UCard>

    <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <UTabs v-model="tab" :items="tabItems">
        <template #content="{ item }">
          <div v-if="item.value === 'posts'" class="mt-4 space-y-4">
            <PostCard v-for="p in data.posts" :key="p.id" :post="p" @changed="refresh" />
            <UAlert v-if="!data.posts.length" color="neutral" variant="soft" title="Sin publicaciones todavía" />
          </div>
          <div v-else-if="item.value === 'comments'" class="mt-4 space-y-3">
            <UCard v-for="(c, i) in data.comments" :key="i">
              <p class="text-sm text-muted">
                Comentó en <NuxtLink :to="`/p/${c.channel_slug}/${c.post_slug}`" class="font-medium text-primary hover:underline">{{ c.post_title }}</NuxtLink> · {{ fmtDate(c.created_at) }}
              </p>
              <p class="mt-1 whitespace-pre-line text-sm">{{ c.body }}</p>
            </UCard>
            <UAlert v-if="!data.comments.length" color="neutral" variant="soft" title="Sin comentarios todavía" />
          </div>
          <div v-else-if="item.value === 'channels'" class="mt-4 flex flex-wrap gap-2">
            <NuxtLink v-for="ch in data.channels" :key="ch.slug" :to="`/channels/${ch.slug}`">
              <UBadge color="neutral" variant="soft" size="lg" icon="i-lucide-hash">{{ ch.name }}</UBadge>
            </NuxtLink>
            <UAlert v-if="!data.channels.length" color="neutral" variant="soft" title="No sigue canales todavía" />
          </div>
          <div v-else-if="item.value === 'events'" class="mt-4 space-y-3">
            <UCard v-for="e in data.events" :key="e.slug">
              <div class="flex flex-wrap items-center gap-3">
                <div class="flex-1">
                  <NuxtLink :to="`/events/${e.slug}`" class="font-bold hover:underline">{{ e.title }}</NuxtLink>
                  <p class="mt-0.5 text-sm text-muted">{{ fmtDateTime(e.startsAt) }} · {{ e.location }}</p>
                </div>
                <UBadge :color="e.past ? 'neutral' : 'success'" variant="soft">{{ e.past ? 'Finalizado' : 'Confirmado' }}</UBadge>
              </div>
            </UCard>
            <UAlert v-if="!data.events.length" color="neutral" variant="soft" title="Sin eventos confirmados todavía" description="Cuando confirme asistencia a un evento, va a aparecer acá." />
          </div>
          <div v-else-if="item.value === 'saved'" class="mt-4 space-y-4">
            <PostCard v-for="p in data.saved || []" :key="p.id" :post="p" @changed="refresh" />
            <UAlert v-if="!(data.saved?.length)" color="neutral" variant="soft" title="Todavía no guardaste publicaciones" description="Tocá el marcador en cualquier publicación para encontrarla acá." />
          </div>
        </template>
      </UTabs>

      <div class="space-y-5">
        <UCard>
          <h2 class="mb-3 text-sm font-bold">Acerca de</h2>
          <p v-if="data.profile.bio" class="whitespace-pre-line text-sm">{{ data.profile.bio }}</p>
          <p v-else class="text-sm text-muted">Este miembro todavía no escribió su bio.</p>
          <ul class="mt-3 space-y-2 text-sm">
            <li v-if="data.profile.location" class="flex items-center gap-2">
              <UIcon name="i-lucide-map-pin" class="text-muted" /> {{ data.profile.location }}
            </li>
            <li v-if="websiteHref" class="flex items-center gap-2">
              <UIcon name="i-lucide-globe" class="text-muted" />
              <a :href="websiteHref" target="_blank" rel="noopener noreferrer" class="font-medium text-primary hover:underline">{{ websiteLabel }}</a>
            </li>
            <li class="flex items-center gap-2">
              <UIcon name="i-lucide-calendar" class="text-muted" /> Miembro desde {{ fmtDate(data.profile.memberSince) }}
            </li>
          </ul>
        </UCard>

        <UCard>
          <h2 class="mb-1 text-sm font-bold">Nivel {{ data.profile.level.name }}</h2>
          <p class="text-sm text-muted">{{ data.profile.points }} pts acumulados</p>
          <UProgress :model-value="levelPct" size="sm" class="mt-3" />
          <p v-if="data.profile.level.nextAt" class="mt-2 text-xs text-muted">
            Te faltan {{ data.profile.level.nextAt - data.profile.points }} pts para {{ data.profile.level.nextName }}.
          </p>
          <p v-else class="mt-2 text-xs text-muted">Nivel máximo alcanzado.</p>
        </UCard>

        <UCard>
          <h2 class="mb-3 text-sm font-bold">Insignias · {{ badgesEarned }} de {{ data.profile.badges.length }}</h2>
          <div class="grid grid-cols-2 gap-2">
            <div
              v-for="b in data.profile.badges" :key="b.id"
              class="flex items-center gap-2 rounded-lg border border-default px-2.5 py-2"
              :class="{ 'opacity-50': !b.earned }"
              :title="b.description"
            >
              <UIcon :name="b.icon" :class="b.earned ? 'text-primary' : 'text-muted'" />
              <span class="text-xs font-medium">{{ b.name }}</span>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted">Las insignias se ganan con actividad real: publicar, comentar, recibir reacciones, completar cursos y guardar contenido.</p>
        </UCard>
      </div>
    </div>
    <UModal v-model:open="confirmBlock" title="Bloquear a este miembro" :description="`Si bloqueás a ${data.profile.name}, dejás de ver sus publicaciones y comentarios, y ninguno de los dos podrá enviarse mensajes directos. La otra persona no recibe ningún aviso.`">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="confirmBlock = false" />
          <UButton color="error" label="Sí, bloquear" icon="i-lucide-ban" :loading="blockingBusy" @click="toggleBlock" />
        </div>
      </template>
    </UModal>
  </div>
</template>
