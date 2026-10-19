<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const toast = useToast()
const { user, fetchMe } = useAuth()
const { fmtDate, initials } = useFormat()

interface Badge { id: string, name: string, description: string, icon: string, earned: boolean }
interface ProfileData {
  profile: {
    id: number, name: string, slug: string, bio: string, location: string, avatarUrl: string, memberSince: string
    lastSeenAt: string, online: boolean
    points: number, level: { name: string, min: number, nextAt: number | null }, badges: Badge[]
    stats: { posts: number, comments: number, reactionsReceived: number, coursesCompleted: number }
  }
  posts: PostView[]
  comments: { body: string, created_at: string, post_title: string, post_slug: string, channel_slug: string }[]
  channels: { name: string, slug: string }[]
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
const tab = ref('posts')
const tabItems = [
  { label: 'Publicaciones', value: 'posts', icon: 'i-lucide-newspaper' },
  { label: 'Comentarios', value: 'comments', icon: 'i-lucide-message-circle' },
  { label: 'Canales', value: 'channels', icon: 'i-lucide-hash' },
]
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UCard>
      <div class="h-20 rounded-lg bg-gradient-to-r from-primary/60 to-primary/20" />
      <div class="mt-4 flex flex-wrap items-start gap-4">
        <UAvatar :src="data.profile.avatarUrl || undefined" :text="initials(data.profile.name)" size="3xl" class="-mt-10 ring-4 ring-white dark:ring-neutral-900" />
        <div class="min-w-0 flex-1 pt-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-bold">{{ data.profile.name }}</h1>
            <UBadge v-if="data.profile.online" color="success" variant="soft" size="lg"><span class="mr-1 h-2 w-2 rounded-full bg-green-500" /> En línea</UBadge>
            <UBadge color="primary" variant="soft" icon="i-lucide-award" size="lg">Nivel {{ data.profile.level.name }}</UBadge>
            <UBadge color="neutral" variant="subtle" size="lg">{{ data.profile.points }} pts</UBadge>
            <UButton v-if="user && !isOwn" size="sm" variant="soft" icon="i-lucide-message-circle" label="Enviar mensaje" :to="`/messages?with=${data.profile.slug}`" />
          </div>
          <p class="text-sm text-muted">Miembro desde {{ fmtDate(data.profile.memberSince) }}<span v-if="data.profile.location"> · {{ data.profile.location }}</span></p>
          <p class="text-sm text-muted" v-if="data.profile.level.nextAt">Faltan {{ data.profile.level.nextAt - data.profile.points }} pts para el próximo nivel.</p>
          <p v-if="data.profile.bio" class="mt-2 whitespace-pre-line">{{ data.profile.bio }}</p>
          <label v-if="isOwn" class="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary hover:underline">
            <UIcon name="i-lucide-camera" />
            {{ uploadingAvatar ? 'Subiendo…' : 'Cambiar foto de perfil' }}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" :disabled="uploadingAvatar" @change="onAvatarChange">
          </label>
        </div>
      </div>
      <div class="mt-5 border-t border-default pt-4">
        <h2 class="mb-3 text-sm font-bold">Insignias</h2>
        <div class="flex flex-wrap gap-2">
          <UBadge v-for="b in data.profile.badges" :key="b.id" :color="b.earned ? 'primary' : 'neutral'" :variant="b.earned ? 'soft' : 'outline'" :icon="b.icon" size="lg" :title="b.description" :class="{ 'opacity-50': !b.earned }">
            {{ b.name }}
          </UBadge>
        </div>
        <p class="mt-2 text-xs text-muted">Las insignias se ganan con actividad real: publicar, comentar, recibir reacciones, completar cursos y guardar contenido.</p>
      </div>
    </UCard>

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
        <div v-else class="mt-4 flex flex-wrap gap-2">
          <NuxtLink v-for="ch in data.channels" :key="ch.slug" :to="`/channels/${ch.slug}`">
            <UBadge color="neutral" variant="soft" size="lg" icon="i-lucide-hash">{{ ch.name }}</UBadge>
          </NuxtLink>
          <UAlert v-if="!data.channels.length" color="neutral" variant="soft" title="No sigue canales todavía" />
        </div>
      </template>
    </UTabs>
  </div>
</template>
