<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'
import type { CommentNode } from '~/utils/reactions'

const route = useRoute()
const channelSlug = computed(() => String(route.params.channelSlug))
const postSlug = computed(() => String(route.params.postSlug))
const { t } = useI18n()
const api = useApi()
const router = useRouter()

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
const photoOpen = computed(() => String(route.query.photo || '') === postSlug.value && !!route.query.photo && data.value?.post.mediaType === 'image' && !!data.value.post.mediaUrl)

interface PhotoChannelData { pinnedPosts: PostView[], posts: PostView[] }
const { data: photoChannel } = await useAsyncData(
  () => `photo-channel-${channelSlug.value}`,
  () => photoOpen.value
    ? api<PhotoChannelData>(`/api/channels/${channelSlug.value}`, { query: { limit: 30 } })
    : Promise.resolve(null),
  { watch: [channelSlug, photoOpen], default: () => null },
)
const photoPosts = computed(() => {
  const posts = [...(photoChannel.value?.pinnedPosts || []), ...(photoChannel.value?.posts || [])]
  if (data.value && !posts.some(post => post.id === data.value!.post.id)) posts.push(data.value.post)
  return posts.filter((post, index, all) => post.mediaType === 'image' && !!post.mediaUrl && !post.locked && all.findIndex(item => item.id === post.id) === index)
})
const photoIndex = computed(() => Math.max(0, photoPosts.value.findIndex(post => post.slug === postSlug.value)))

function openPhotoViewer() {
  void router.push({
    path: `/p/${channelSlug.value}/${postSlug.value}`,
    query: { photo: postSlug.value, pi: String(photoIndex.value + 1), from: 'post' },
  })
}
function closePhotoViewer() {
  const from = String(route.query.from || '')
  if (from === 'channel') {
    void router.replace(`/channels/${channelSlug.value}`)
    return
  }
  if (from === 'feed') {
    void router.replace('/feeds')
    return
  }
  const query = { ...route.query }
  delete query.photo
  delete query.pi
  delete query.from
  void router.replace({ path: route.path, query, hash: route.hash })
}
function movePhoto(direction: -1 | 1) {
  const next = photoIndex.value + direction
  const target = photoPosts.value[next]
  if (!target) return
  void router.push({
    path: `/p/${channelSlug.value}/${target.slug}`,
    query: { photo: target.slug, pi: String(next + 1), from: String(route.query.from || 'channel') },
  })
}
function onPostDeleted() {
  router.push('/feeds')
}

const commentsInitial = computed(() => data.value
  ? { comments: data.value.comments, total: data.value.commentTotal ?? data.value.comments.length, withheld: !!data.value.commentsWithheld }
  : null)
async function focusComments() {
  if (!import.meta.client || route.hash !== '#post-comments' || !data.value || data.value.post.locked) return
  await nextTick()
  const section = document.getElementById('post-comments')
  section?.scrollIntoView({ block: 'start' })
  section?.focus({ preventScroll: true })
}
onMounted(focusComments)
watch([() => route.fullPath, data], focusComments, { flush: 'post' })
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UButton to="/feeds" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="t('postDetail.backToFeed')" class="-ml-2" />
    <PostCard :key="`card-${data.post.id}`" :post="data.post" :linkable="false" :inline-comments="false" @open-photo="openPhotoViewer" @changed="refresh" @deleted="onPostDeleted" />

    <UCard v-if="!data.post.locked" id="post-comments" tabindex="-1" class="scroll-mt-4 focus:outline-none">
      <PostComments
        :key="`comments-${data.post.id}`"
        :post-id="data.post.id"
        :allow-comments="data.post.allowComments !== false"
        :can-interact="data.post.canInteract !== false"
        :channel-slug="channelSlug"
        :initial="commentsInitial"
      />
    </UCard>

    <UModal
      :open="photoOpen"
      :title="t('post.photoViewerTitle')"
      :ui="{ content: '!h-[100dvh] !w-screen !max-w-none !max-h-[100dvh] !rounded-none !p-0', body: 'h-full p-0' }"
      @update:open="(open: boolean) => { if (!open) closePhotoViewer() }"
    >
      <template #content>
        <div v-if="data" class="grid h-[100dvh] min-h-0 grid-rows-[minmax(38vh,1fr)_minmax(0,1fr)] bg-black sm:grid-cols-[minmax(0,1fr)_400px] sm:grid-rows-1">
          <section class="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-black" :aria-label="t('post.photoViewerTitle')">
            <img :src="data.post.mediaUrl" :alt="t('post.postImageAlt')" class="h-full w-full object-contain">
            <UButton v-if="photoPosts.length > 1" color="neutral" variant="solid" icon="i-lucide-chevron-left" class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/75" :aria-label="t('post.previousPhoto')" :disabled="photoIndex === 0" @click="movePhoto(-1)" />
            <UButton v-if="photoPosts.length > 1" color="neutral" variant="solid" icon="i-lucide-chevron-right" class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/75" :aria-label="t('post.nextPhoto')" :disabled="photoIndex === photoPosts.length - 1" @click="movePhoto(1)" />
            <span v-if="photoPosts.length > 1" class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-white">{{ photoIndex + 1 }} / {{ photoPosts.length }}</span>
          </section>
          <aside class="flex min-h-0 flex-col border-l border-default bg-default text-default">
            <div class="flex justify-end border-b border-default p-2">
              <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('post.closePhoto')" @click="closePhotoViewer" />
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto p-4">
              <PostCard :key="`photo-card-${data.post.id}`" :post="data.post" :linkable="false" :show-media="false" :inline-comments="true" @changed="refresh" @deleted="onPostDeleted" />
            </div>
          </aside>
        </div>
      </template>
    </UModal>
  </div>
</template>
