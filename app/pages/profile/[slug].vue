<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const { fmtDate, initials } = useFormat()

interface ProfileData {
  profile: { id: number, name: string, slug: string, bio: string, location: string, memberSince: string }
  posts: PostView[]
  comments: { body: string, created_at: string, post_title: string, post_slug: string, channel_slug: string }[]
  channels: { name: string, slug: string }[]
}
const { data, refresh } = await useAsyncData(() => `profile-${slug.value}`, () => api<ProfileData>(`/api/profiles/${slug.value}`), { watch: [slug] })
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
        <UAvatar :text="initials(data.profile.name)" size="3xl" class="-mt-10 ring-4 ring-white dark:ring-neutral-900" />
        <div class="min-w-0 flex-1 pt-1">
          <h1 class="text-2xl font-bold">{{ data.profile.name }}</h1>
          <p class="text-sm text-muted">Miembro desde {{ fmtDate(data.profile.memberSince) }}<span v-if="data.profile.location"> · {{ data.profile.location }}</span></p>
          <p v-if="data.profile.bio" class="mt-2 whitespace-pre-line">{{ data.profile.bio }}</p>
        </div>
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
