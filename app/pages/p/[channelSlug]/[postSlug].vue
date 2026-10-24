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
function bodyImageSources(html: string) {
  return [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
    .map(match => match[1] || match[2] || match[3] || '')
    .filter(Boolean)
}
const inlineImages = computed(() => bodyImageSources(data.value?.post.bodyHtml || ''))
const inlineImageIndex = computed(() => Number(route.query.image || 0) - 1)
const postMediaImage = computed(() => data.value?.post.mediaType === 'image' ? data.value.post.mediaUrl : '')
const selectedPhotoUrl = computed(() => {
  if (route.query.image) {
    // `image=1` is used for rich-body images, while feed media images
    // may carry the same parameter for older/shared links. Keep either
    // link opening the image instead of leaving the viewer blank.
    return inlineImages.value[inlineImageIndex.value] || postMediaImage.value || ''
  }
  return postMediaImage.value || inlineImages.value[0] || ''
})
const photoOpen = computed(() => String(route.query.photo || '') === postSlug.value && !!selectedPhotoUrl.value)
const photoModalOpen = computed({
  get: () => photoOpen.value,
  set: (open: boolean) => { if (!open) closePhotoViewer() },
})

interface PhotoChannelData { pinnedPosts: PostView[], posts: PostView[] }
// El post se pinta con los datos ya cargados; el resto del canal solo
// sirve para habilitar anterior/siguiente. No bloquear la apertura
// del visor esperando hasta 30 publicaciones del canal.
const { data: photoChannel } = useLazyAsyncData(
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

function openPhotoViewer(source?: string, inlineImageIndex?: number) {
  const imageIndex = inlineImageIndex ?? (source ? inlineImages.value.findIndex(candidate => candidate === source) : -1)
  void router.push({
    path: `/p/${channelSlug.value}/${postSlug.value}`,
    query: {
      photo: postSlug.value,
      pi: String(photoIndex.value + 1),
      from: 'post',
      ...(imageIndex >= 0 ? { image: String(imageIndex + 1) } : {}),
    },
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
  delete query.image
  void router.replace({ path: route.path, query, hash: route.hash })
}
function movePhoto(direction: -1 | 1) {
  if (route.query.image && inlineImages.value.length) {
    const nextImage = inlineImageIndex.value + direction
    if (nextImage < 0 || nextImage >= inlineImages.value.length) return
    void router.push({ path: route.path, query: { ...route.query, image: String(nextImage + 1) } })
    return
  }
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
      v-if="photoOpen"
      v-model:open="photoModalOpen"
      :title="t('post.photoViewerTitle')"
      :ui="{ content: '!h-dvh !w-screen !max-w-none !max-h-none !rounded-none !border-0 !p-0 !shadow-2xl sm:!h-[calc(100dvh-2rem)] sm:!w-[calc(100vw-2rem)] sm:!rounded-2xl sm:!border sm:!border-default', body: 'h-full p-0' }"
    >
      <template #content>
        <div v-if="data" class="grid h-full min-h-0 grid-rows-[minmax(38vh,1fr)_minmax(0,1fr)] overflow-hidden bg-black sm:grid-cols-[minmax(0,1fr)_minmax(360px,34vw)] sm:grid-rows-1">
          <section class="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-black" :aria-label="t('post.photoViewerTitle')">
            <img :src="selectedPhotoUrl" :alt="t('post.postImageAlt')" class="h-full w-full object-contain">
            <UButton v-if="(route.query.image ? inlineImages.length : photoPosts.length) > 1" color="neutral" variant="solid" icon="i-lucide-chevron-left" class="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/75" :aria-label="t('post.previousPhoto')" :disabled="route.query.image ? inlineImageIndex === 0 : photoIndex === 0" @click="movePhoto(-1)" />
            <UButton v-if="(route.query.image ? inlineImages.length : photoPosts.length) > 1" color="neutral" variant="solid" icon="i-lucide-chevron-right" class="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/75" :aria-label="t('post.nextPhoto')" :disabled="route.query.image ? inlineImageIndex === inlineImages.length - 1 : photoIndex === photoPosts.length - 1" @click="movePhoto(1)" />
            <span v-if="(route.query.image ? inlineImages.length : photoPosts.length) > 1" class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-white">{{ (route.query.image ? inlineImageIndex : photoIndex) + 1 }} / {{ route.query.image ? inlineImages.length : photoPosts.length }}</span>
          </section>
          <aside class="photo-viewer-sidebar flex min-h-0 flex-col border-l border-default bg-default text-default">
            <div class="photo-viewer-post min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <PostCard :key="`photo-card-${data.post.id}`" :post="data.post" :linkable="false" :show-media="false" :inline-comments="true" :comments-initially-open="true" viewer @changed="refresh" @deleted="onPostDeleted">
                <template #header-actions>
                  <UButton
                    color="neutral" variant="ghost" icon="i-lucide-x"
                    class="size-10 shrink-0 rounded-full p-0 hover:bg-elevated focus-visible:ring-2 focus-visible:ring-primary"
                    :aria-label="t('post.closePhoto')"
                    @click.stop="closePhotoViewer"
                  />
                </template>
              </PostCard>
            </div>
          </aside>
        </div>
      </template>
    </UModal>
  </div>
</template>
