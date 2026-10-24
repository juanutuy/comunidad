<script setup lang="ts">
import type { PostView } from './PostCard.vue'
import type { CommentNode } from '~/utils/reactions'

const props = defineProps<{ post: PostView, initial?: { comments: CommentNode[], total: number, withheld: boolean } | null }>()
const emit = defineEmits<{ close: [], changed: [] }>()
const { t } = useI18n()
const { user } = useAuth()
const { timeAgo, initials } = useFormat()
const guestAccess = useGuestAccess()
const api = useApi()
const toast = useToast()
const reaction = ref(props.post.myReaction)
const top = ref(props.post.reactionTop)
const total = ref(props.post.reactionTotal)
const pending = ref(false)
const textHtml = computed(() => (props.post.bodyHtml || '').replace(/<img\b[^>]*>/gi, '').replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, ''))
watch(() => props.post, post => {
  reaction.value = post.myReaction
  top.value = post.reactionTop
  total.value = post.reactionTotal
})
async function react(type: string) {
  if (!user.value) { guestAccess.requestAccess(); return }
  if (pending.value) return
  pending.value = true
  try {
    const result = await api<{ myReaction: string | null, reactionTop: string[], reactionTotal: number }>(`/api/posts/${props.post.id}/reactions`, { method: 'POST', body: { type } })
    reaction.value = result.myReaction
    top.value = result.reactionTop
    total.value = result.reactionTotal
    emit('changed')
  }
  catch { toast.add({ title: t('comments.commentFailed'), color: 'error' }) }
  finally { pending.value = false }
}
</script>

<template>
  <header class="flex shrink-0 items-center gap-3 border-b border-default px-6 py-5">
    <UAvatar :src="post.author.anonymous && !post.author.mine ? undefined : post.author.avatarUrl" :text="initials(post.author.name)" :icon="post.author.anonymous && !post.author.mine ? 'i-lucide-venetian-mask' : undefined" size="lg" />
    <div class="min-w-0 flex-1">
      <span v-if="post.author.anonymous && !post.author.mine" class="block font-semibold">{{ t('post.anonymous') }}</span>
      <NuxtLink v-else :to="`/profile/${post.author.slug}`" class="block truncate font-semibold hover:underline">{{ post.author.name }}</NuxtLink>
      <div class="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
        <NuxtLink :to="`/channels/${post.channel.slug}`" class="hover:underline">{{ post.channel.name }}</NuxtLink>
        <span>· {{ timeAgo(post.createdAt) }}</span>
      </div>
    </div>
    <UButton color="neutral" variant="ghost" icon="i-lucide-x" class="!size-10 shrink-0 !rounded-full !p-0 hover:bg-elevated" :aria-label="t('post.closePhoto')" @click="emit('close')" />
  </header>
  <PostComments :post-id="post.id" :allow-comments="post.allowComments !== false" :can-interact="post.canInteract !== false" :channel-slug="post.channel.slug" :initial="initial" viewer>
    <template #intro>
      <div v-if="post.title || textHtml || post.body" class="mb-5 space-y-3">
        <h2 v-if="post.title" class="text-lg font-semibold leading-snug">{{ post.title }}</h2>
        <div v-if="textHtml" class="rich-content text-[15px] leading-relaxed" v-html="textHtml" />
        <p v-else-if="!post.bodyHtml" class="whitespace-pre-line text-[15px] leading-relaxed">{{ post.body }}</p>
      </div>
      <div class="mb-5 flex items-center gap-3 border-b border-default pb-5">
        <ReactionPicker :my-reaction="reaction" @select="react">
          <UButton color="neutral" variant="ghost" icon="i-lucide-smile-plus" :label="reaction ? `${reaction} ${t('comments.react')}` : t('comments.react')" class="-ml-2" :loading="pending" />
        </ReactionPicker>
        <ReactionSummary :top="top" :total="total" />
      </div>
    </template>
  </PostComments>
</template>
