<script setup lang="ts">
export interface PostView {
  id: number
  slug: string
  title: string
  body: string
  teaser: string
  locked: boolean
  mediaType: string
  mediaUrl: string
  pinned: boolean
  createdAt: string
  author: { name: string, slug: string }
  channel: { name: string, slug: string, type: string }
  reactions: Record<string, number>
  myReactions: string[]
  commentCount: number
  bookmarked: boolean
}

const props = defineProps<{ post: PostView, linkable?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { user } = useAuth()
const { timeAgo, initials } = useFormat()
const api = useApi()
const toast = useToast()

const reactionMeta = [
  { type: 'love', icon: 'i-lucide-heart', label: 'Me encanta' },
  { type: 'like', icon: 'i-lucide-thumbs-up', label: 'Me gusta' },
  { type: 'fire', icon: 'i-lucide-flame', label: 'Fuego' },
  { type: 'clap', icon: 'i-lucide-hand-metal', label: 'Aplausos' },
]

const localReactions = ref({ ...props.post.reactions })
const localMine = ref([...props.post.myReactions])
const localBookmarked = ref(props.post.bookmarked)
watch(() => props.post, (p) => {
  localReactions.value = { ...p.reactions }
  localMine.value = [...p.myReactions]
  localBookmarked.value = p.bookmarked
})

const youtubeEmbed = computed(() => {
  if (props.post.mediaType !== 'video') return ''
  const url = props.post.mediaUrl
  if (url.includes('/embed/')) return url
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : ''
})

async function toggleReaction(type: string) {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para reaccionar', color: 'warning' }); return }
  const wasActive = localMine.value.includes(type)
  localMine.value = wasActive ? localMine.value.filter(t => t !== type) : [...localMine.value, type]
  localReactions.value[type] = (localReactions.value[type] || 0) + (wasActive ? -1 : 1)
  try { await api(`/api/posts/${props.post.id}/reactions`, { method: 'POST', body: { type } }) }
  catch { emit('changed') }
}

async function toggleBookmark() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para guardar', color: 'warning' }); return }
  localBookmarked.value = !localBookmarked.value
  try { await api(`/api/posts/${props.post.id}/bookmark`, { method: 'POST' }) }
  catch { emit('changed') }
}

async function togglePin() {
  try {
    await api(`/api/posts/${props.post.id}/pin`, { method: 'POST' })
    toast.add({ title: 'Publicación actualizada', color: 'success' })
    emit('changed')
  }
  catch { toast.add({ title: 'No se pudo fijar la publicación', color: 'error' }) }
}
</script>

<template>
  <UCard>
    <div class="flex items-start gap-3">
      <UAvatar :text="initials(post.author.name)" size="md" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <NuxtLink :to="`/profile/${post.author.slug}`" class="font-semibold hover:underline">
            {{ post.author.name }}
          </NuxtLink>
          <span class="text-muted">en</span>
          <NuxtLink :to="`/channels/${post.channel.slug}`" class="font-medium text-primary hover:underline">
            {{ post.channel.name }}
          </NuxtLink>
          <span class="text-muted">· {{ timeAgo(post.createdAt) }}</span>
          <UBadge v-if="post.pinned" color="warning" variant="subtle" icon="i-lucide-pin">
            Fijado
          </UBadge>
          <UBadge v-if="post.channel.type === 'paid'" color="neutral" variant="subtle" icon="i-lucide-crown">
            Premium
          </UBadge>
        </div>

        <NuxtLink v-if="linkable !== false" :to="`/p/${post.channel.slug}/${post.slug}`" class="mt-1 block text-lg font-bold leading-snug hover:underline">
          {{ post.title }}
        </NuxtLink>
        <h1 v-else class="mt-1 text-2xl font-bold leading-snug">
          {{ post.title }}
        </h1>

        <div v-if="post.locked" class="mt-3 rounded-lg border border-dashed border-default p-4">
          <p class="text-sm text-muted">
            {{ post.teaser }}
          </p>
          <div class="mt-3 flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-lock" />
            Contenido completo solo con acceso a este canal.
            <NuxtLink :to="`/channels/${post.channel.slug}`" class="text-primary hover:underline">
              Obtener acceso
            </NuxtLink>
          </div>
        </div>
        <div v-else>
          <p class="mt-2 whitespace-pre-line text-[15px] leading-relaxed">
            {{ post.body }}
          </p>
          <div v-if="post.mediaType === 'video' && youtubeEmbed" class="mt-3 aspect-video overflow-hidden rounded-lg">
            <iframe :src="youtubeEmbed" class="h-full w-full" allowfullscreen title="Video de la publicación" />
          </div>
          <div v-else-if="post.mediaType === 'image' && post.mediaUrl" class="mt-3">
            <img :src="post.mediaUrl" alt="Imagen de la publicación" class="max-h-96 w-full rounded-lg object-cover">
          </div>
          <div v-else-if="post.mediaType === 'video' && post.mediaUrl" class="mt-3 text-sm">
            <a :href="post.mediaUrl" target="_blank" rel="noopener" class="text-primary hover:underline">Ver video</a>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-1 border-t border-default pt-3">
          <UButton
            v-for="r in reactionMeta"
            :key="r.type"
            size="sm"
            :color="localMine.includes(r.type) ? 'primary' : 'neutral'"
            :variant="localMine.includes(r.type) ? 'soft' : 'ghost'"
            :icon="r.icon"
            :label="`${localReactions[r.type] || 0}`"
            :title="r.label"
            @click="toggleReaction(r.type)"
          />
          <NuxtLink :to="`/p/${post.channel.slug}/${post.slug}`" class="ml-1">
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-message-circle" :label="`${post.commentCount} comentarios`" />
          </NuxtLink>
          <span class="flex-1" />
          <UButton size="sm" color="neutral" :variant="localBookmarked ? 'soft' : 'ghost'" icon="i-lucide-bookmark" @click="toggleBookmark" />
          <UButton v-if="user?.role === 'admin'" size="sm" color="neutral" variant="ghost" icon="i-lucide-pin" title="Fijar / desfijar (admin)" @click="togglePin" />
        </div>
      </div>
    </div>
  </UCard>
</template>
