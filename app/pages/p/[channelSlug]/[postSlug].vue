<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'
import type { CommentNode } from '~/utils/reactions'

const route = useRoute()
const channelSlug = computed(() => String(route.params.channelSlug))
const postSlug = computed(() => String(route.params.postSlug))
const { t } = useI18n()
const api = useApi()

// Fase 16-G: los comentarios llegan como ÁRBOL (con respuestas,
// reacciones y adjuntos) y la sección es el componente único
// PostComments, sembrado con estos datos del SSR y compartiendo
// estado con la tarjeta.
interface PostDetailData { post: PostView, comments: CommentNode[], commentTotal: number, commentsWithheld?: boolean }
const { data, refresh } = await useAsyncData(
  () => `post-${channelSlug.value}-${postSlug.value}`,
  () => api<PostDetailData>('/api/post', { query: { channel: channelSlug.value, post: postSlug.value } }),
  { watch: [channelSlug, postSlug] },
)

const router = useRouter()
function onPostDeleted() {
  router.push('/feeds')
}

const commentsInitial = computed(() => data.value
  ? { comments: data.value.comments, total: data.value.commentTotal ?? data.value.comments.length, withheld: !!data.value.commentsWithheld }
  : null)
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UButton to="/feeds" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="t('postDetail.backToFeed')" class="-ml-2" />
    <PostCard :key="`card-${data.post.id}`" :post="data.post" :linkable="false" :inline-comments="false" @changed="refresh" @deleted="onPostDeleted" />

    <UCard v-if="!data.post.locked" id="post-comments">
      <PostComments
        :key="`comments-${data.post.id}`"
        :post-id="data.post.id"
        :allow-comments="data.post.allowComments !== false"
        :can-interact="data.post.canInteract !== false"
        :channel-slug="channelSlug"
        :initial="commentsInitial"
      />
    </UCard>
  </div>
</template>
