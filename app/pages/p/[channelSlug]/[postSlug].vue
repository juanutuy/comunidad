<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const channelSlug = computed(() => String(route.params.channelSlug))
const postSlug = computed(() => String(route.params.postSlug))
const { user } = useAuth()
const { fmtDateTime, initials } = useFormat()
const api = useApi()
const toast = useToast()

interface CommentView { id: number, body: string, createdAt: string, author: { name: string, slug: string } }
const { data, refresh } = await useAsyncData(
  () => `post-${channelSlug.value}-${postSlug.value}`,
  () => api<{ post: PostView, comments: CommentView[] }>('/api/post', { query: { channel: channelSlug.value, post: postSlug.value } }),
  { watch: [channelSlug, postSlug] },
)

const newComment = ref('')
const sending = ref(false)
async function sendComment() {
  if (!newComment.value.trim()) return
  sending.value = true
  try {
    await api(`/api/posts/${data.value!.post.id}/comments`, { method: 'POST', body: { body: newComment.value } })
    newComment.value = ''
    await refresh()
  }
  catch { toast.add({ title: 'No se pudo comentar', color: 'error' }) }
  finally { sending.value = false }
}
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UButton to="/feeds" color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="Volver al feed" class="-ml-2" />
    <PostCard :post="data.post" :linkable="false" @changed="refresh" />

    <UCard v-if="!data.post.locked">
      <h2 class="mb-4 flex items-center gap-2 font-bold">
        <UIcon name="i-lucide-message-circle" /> Comentarios ({{ data.comments.length }})
      </h2>
      <div class="space-y-4">
        <div v-for="c in data.comments" :key="c.id" class="flex gap-3">
          <UAvatar :text="initials(c.author.name)" size="sm" />
          <div class="min-w-0 flex-1 rounded-lg bg-elevated p-3">
            <p class="text-sm">
              <NuxtLink :to="`/profile/${c.author.slug}`" class="font-semibold hover:underline">{{ c.author.name }}</NuxtLink>
              <span class="ml-2 text-xs text-muted">{{ fmtDateTime(c.createdAt) }}</span>
            </p>
            <p class="mt-1 whitespace-pre-line text-sm">{{ c.body }}</p>
          </div>
        </div>
        <p v-if="!data.comments.length" class="text-sm text-muted">Todavía no hay comentarios. ¡Empezá la conversación!</p>
      </div>
      <div v-if="user" class="mt-5 flex gap-2">
        <UTextarea v-model="newComment" :rows="2" placeholder="Escribí un comentario…" class="flex-1" />
        <UButton label="Comentar" icon="i-lucide-send" :loading="sending" @click="sendComment" />
      </div>
      <UAlert v-else class="mt-5" color="neutral" variant="soft" title="Iniciá sesión para comentar" />
    </UCard>
  </div>
</template>
