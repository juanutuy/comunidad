<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const channelSlug = computed(() => String(route.params.channelSlug))
const postSlug = computed(() => String(route.params.postSlug))
const { user } = useAuth()
const { t } = useI18n()
const { fmtDateTime, initials } = useFormat()
const api = useApi()
const toast = useToast()

interface CommentView { id: number, body: string, createdAt: string, author: { name: string, slug: string, avatarUrl?: string } }
const { data, refresh } = await useAsyncData(
  () => `post-${channelSlug.value}-${postSlug.value}`,
  () => api<{ post: PostView, comments: CommentView[], commentsWithheld?: boolean }>('/api/post', { query: { channel: channelSlug.value, post: postSlug.value } }),
  { watch: [channelSlug, postSlug] },
)

const router = useRouter()
function onPostDeleted() {
  router.push('/feeds')
}

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
  catch { toast.add({ title: t('postDetail.commentFailed'), color: 'error' }) }
  finally { sending.value = false }
}

async function deleteComment(id: number) {
  try {
    await api(`/api/comments/${id}`, { method: 'DELETE' })
    toast.add({ title: t('postDetail.commentDeleted'), color: 'success' })
    await refresh()
  }
  catch { toast.add({ title: t('postDetail.commentDeleteFailed'), color: 'error' }) }
}

// Fase 12: reportar un comentario ajeno desde su menú «…».
const { openReport } = useReportDialog()
function commentMenuItems(c: CommentView) {
  return [[{ label: t('postDetail.report'), icon: 'i-lucide-flag', onSelect: () => openReport({ type: 'comment', id: c.id, label: c.body.slice(0, 80) }) }]]
}
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UButton to="/feeds" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="t('postDetail.backToFeed')" class="-ml-2" />
    <PostCard :post="data.post" :linkable="false" @changed="refresh" @deleted="onPostDeleted" />

    <UCard v-if="!data.post.locked">
      <h2 class="mb-4 flex items-center gap-2 font-bold">
        <UIcon name="i-lucide-message-circle" /> {{ t('postDetail.commentsTitle', { count: data.comments.length }) }}
      </h2>
      <div class="space-y-4">
        <div v-for="c in data.comments" :key="c.id" class="flex gap-3">
          <UAvatar :src="c.author.avatarUrl || undefined" :text="initials(c.author.name)" size="sm" />
          <div class="min-w-0 flex-1 rounded-lg bg-elevated p-3">
            <p class="flex items-center gap-2 text-sm">
              <NuxtLink :to="`/profile/${c.author.slug}`" class="font-semibold hover:underline">{{ c.author.name }}</NuxtLink>
              <span class="text-xs text-muted">{{ fmtDateTime(c.createdAt) }}</span>
              <span class="flex-1" />
              <UButton v-if="user && (['admin', 'moderator'].includes(user.role || '') || user.slug === c.author.slug)" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" :title="t('postDetail.deleteComment')" @click="deleteComment(c.id)" />
              <UDropdownMenu v-if="user && user.slug !== c.author.slug" :items="commentMenuItems(c)">
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-more-horizontal" :title="t('postDetail.commentActions')" />
              </UDropdownMenu>
            </p>
            <p class="mt-1 whitespace-pre-line text-sm">{{ c.body }}</p>
          </div>
        </div>
        <p v-if="!data.comments.length && data.commentsWithheld" class="text-sm text-muted">{{ t('postDetail.commentsMembersOnly') }}</p>
        <p v-else-if="!data.comments.length" class="text-sm text-muted">{{ t('postDetail.noComments') }}</p>
      </div>
      <UAlert v-if="data.post.allowComments === false" class="mt-5" color="neutral" variant="soft" icon="i-lucide-lock" :title="t('postDetail.commentsDisabledTitle')" :description="t('postDetail.commentsDisabledText')" />
      <!-- Fase 15: anticipo completo = solo lectura. Se puede leer la
           publicación entera, pero participar requiere el acceso. -->
      <UAlert v-else-if="data.post.canInteract === false" class="mt-5" color="neutral" variant="soft" icon="i-lucide-lock" :title="t('postDetail.readOnlyTitle')" :description="t('postDetail.readOnlyText')">
        <template #actions>
          <UButton :to="`/channels/${channelSlug}`" size="sm" :label="t('postDetail.getAccess')" />
        </template>
      </UAlert>
      <div v-else-if="user" class="mt-5 flex gap-2">
        <UTextarea v-model="newComment" :rows="2" :placeholder="t('postDetail.commentPlaceholder')" class="flex-1" />
        <UButton :label="t('postDetail.commentButton')" icon="i-lucide-send" :loading="sending" @click="sendComment" />
      </div>
      <UAlert v-else class="mt-5" color="neutral" variant="soft" :title="t('postDetail.loginToComment')" />
    </UCard>
  </div>
</template>
