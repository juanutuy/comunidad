<script setup lang="ts">
const guestAccess = useGuestAccess()
import type { PostView } from '~/components/PostCard.vue'

// Página de canal (Fase 16-F): superficie INDEPENDIENTE del feed —
// cabecera propia con portada y su menú «⋯», sin riel derecho (el
// layout lo suprime en /channels/*). Un canal con visibilidad
// PRIVADA sin acceso abre acá su pantalla de bloqueo (portada y
// metadatos, cero publicaciones; la compra reusa el flujo de
// siempre). Un canal de IMAGEN suma el conmutador Feed | Galería |
// Álbum bajo la cabecera.
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { user, tenant } = useAuth()
const { t } = useI18n()
const { fmtMoney } = useFormat()
const api = useApi()
const toast = useToast()

interface ChannelDetail {
  channel: {
    id: number, slug: string, name: string, icon: string, description: string, type: string, priceCents: number
    contentType?: 'post' | 'image', coverUrl?: string, visibility?: 'public' | 'private' | 'secret', groupId?: number | null
    following: boolean, hasAccess: boolean, archived?: boolean, postPermission?: string, visibilityLocked?: boolean
  }
  pinnedPosts: PostView[]
  posts: PostView[]
  nextOffset: number | null
}
const offset = ref(0)
watch(slug, () => { offset.value = 0 })
const { data, refresh } = await useAsyncData(() => `channel-${slug.value}`, () => api<ChannelDetail>(`/api/channels/${slug.value}`, { query: { offset: offset.value } }), { watch: [slug, offset] })
const pinnedIndex = ref(0)
watch(slug, () => { pinnedIndex.value = 0 })
watch(() => data.value?.pinnedPosts.length, (count) => { if (!count || pinnedIndex.value >= count) pinnedIndex.value = 0 })
const currentPinned = computed(() => data.value?.pinnedPosts[pinnedIndex.value])
const tab = ref('posts')
const tabItems = computed(() => [
  { label: t('channel.postsTab'), value: 'posts', icon: 'i-lucide-newspaper' },
  { label: t('channel.chatTab'), value: 'chat', icon: 'i-lucide-messages-square' },
])

// Los menús contextuales y el modal de canal viven fuera de esta
// página: cuando algo cambia (editar, portada, accesos), se
// refresca el detalle sin recargar.
const { changedTick } = useChannelAdmin()
const editorSavedTick = useState('channel-editor-saved', () => 0)
watch([changedTick, editorSavedTick], () => { void refresh() })

const isImageChannel = computed(() => data.value?.channel.contentType === 'image')
const view = ref<'feed' | 'gallery' | 'album'>('feed')
const viewItems = computed(() => [
  { value: 'feed' as const, label: t('channel.viewFeed'), icon: 'i-lucide-newspaper' },
  { value: 'gallery' as const, label: t('channel.viewGallery'), icon: 'i-lucide-layout-grid' },
  { value: 'album' as const, label: t('channel.viewAlbum'), icon: 'i-lucide-folder-open' },
])
// Galería: solo publicaciones CON imagen y legibles (sin candado).
const galleryPosts = computed(() => (data.value?.posts || []).filter(p => !p.locked && p.mediaType === 'image' && !!p.mediaUrl))
// Álbum: agrupado por el texto de álbum del post; «Sin álbum» al final.
const albumGroups = computed(() => {
  const map = new Map<string, PostView[]>()
  for (const p of data.value?.posts || []) {
    const key = (p.album || '').trim()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === '' ? 1 : 0) - (b[0] === '' ? 1 : 0) || a[0].localeCompare(b[0]))
    .map(([name, posts]) => ({ name, posts }))
})

async function toggleFollow() {
  if (!user.value) { guestAccess.requestAccess(); return }
  await api(`/api/channels/${slug.value}/follow`, { method: 'POST' })
  await refresh()
  await refreshNuxtData('layout-channels')
}

async function demoAccess() {
  try {
    await api(`/api/channels/${slug.value}/access`, { method: 'POST' })
    toast.add({ title: t('channel.demoAccessToast'), description: t('channel.demoAccessToastText'), color: 'success' })
    await refresh()
  }
  catch { toast.add({ title: t('channel.demoAccessFailed'), color: 'error' }) }
}

const { data: billing } = await useAsyncData('billing-status-channel', () => api<{ enabled: boolean, manualEnabled: boolean }>('/api/billing/status'))
// Fase 17: pago manual del acceso a este canal (queda en revisión
// hasta que un admin lo aprueba: no concede nada al declararlo).
const manualOpen = ref(false)
const buying = ref(false)
async function buyAccess() {
  buying.value = true
  try {
    const res = await api<{ url: string }>('/api/billing/checkout', { method: 'POST', body: { kind: 'channel', slug: slug.value } })
    window.location.href = res.url
  }
  catch (e) {
    toast.add({ title: t('channel.buyFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { buying.value = false }
}
</script>

<template>
  <div v-if="data" class="space-y-5">
    <CommunityBanner />
    <!-- Cabecera propia del canal: portada (o la franja de marca),
         # nombre, descripción y SU menú «⋯» con la administración
         en contexto. -->
    <UCard :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden">
      <img v-if="data.channel.coverUrl" :src="data.channel.coverUrl" alt="" class="h-36 w-full object-cover sm:h-44">
      <div v-else class="h-14" :style="{ background: `linear-gradient(120deg, ${tenant?.brandColor || '#2563eb'} 0%, ${tenant?.brandColor || '#2563eb'}80 100%)` }" />
      <div class="px-5 py-4">
        <div class="flex flex-wrap items-start gap-4">
          <span class="-mt-9 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow ring-1 ring-black/5 dark:bg-neutral-900">
            <UIcon :name="data.channel.icon" class="text-2xl" />
          </span>
          <div class="min-w-0 flex-1">
            <h1 class="flex flex-wrap items-center gap-2 text-2xl font-bold">
              # {{ data.channel.name }}
              <UBadge v-if="data.channel.type === 'paid'" color="warning" variant="subtle" icon="i-lucide-crown">
                {{ t('channel.paidBadge', { price: fmtMoney(data.channel.priceCents) }) }}
              </UBadge>
              <UBadge v-else-if="data.channel.type === 'private'" color="neutral" variant="subtle" icon="i-lucide-lock">
                {{ t('channel.privateBadge') }}
              </UBadge>
              <UBadge v-else color="success" variant="subtle">
                {{ t('channel.freeBadge') }}
              </UBadge>
              <UBadge v-if="data.channel.visibility === 'private'" color="neutral" variant="subtle" icon="i-lucide-eye-off">
                {{ t('channel.lockedBadge') }}
              </UBadge>
              <UBadge v-else-if="data.channel.visibility === 'secret'" color="neutral" variant="subtle" icon="i-lucide-eye-off">
                {{ t('channel.secretBadge') }}
              </UBadge>
              <UBadge v-if="isImageChannel" color="primary" variant="subtle" icon="i-lucide-image">
                {{ t('channel.imageBadge') }}
              </UBadge>
            </h1>
            <p class="mt-1 text-muted">{{ data.channel.description }}</p>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              :color="data.channel.following ? 'neutral' : 'primary'"
              :variant="data.channel.following ? 'soft' : 'solid'"
              :icon="data.channel.following ? 'i-lucide-check' : 'i-lucide-plus'"
              :label="data.channel.following ? t('channel.following') : t('channel.follow')"
              @click="toggleFollow"
            />
            <ChannelContextMenu :channel="data.channel" size="sm" with-cover />
          </div>
        </div>
      </div>
      <UAlert v-if="data.channel.type === 'paid' && !data.channel.hasAccess" class="mx-5 mb-4" color="warning" variant="soft" icon="i-lucide-lock" :title="t('channel.paidChannelTitle')" :description="billing?.enabled ? t('channel.paidDescStripe') : billing?.manualEnabled ? t('channel.paidDescManual') : t('channel.paidDescNone')">
        <template #actions>
          <UButton v-if="user && billing?.enabled" size="sm" color="warning" :label="t('channel.buyAccess', { price: fmtMoney(data.channel.priceCents) })" icon="i-lucide-credit-card" :loading="buying" @click="buyAccess" />
          <UButton v-if="user && billing?.manualEnabled" size="sm" color="warning" variant="soft" :label="t('channel.manualAccess', { price: fmtMoney(data.channel.priceCents) })" icon="i-lucide-hand-coins" @click="manualOpen = true" />
          <UButton v-if="user" size="sm" color="warning" variant="soft" :label="t('channel.demoAccess')" icon="i-lucide-key-round" @click="demoAccess" />
          <UButton v-if="user" size="sm" to="/pricing" color="neutral" variant="soft" :label="t('channel.viewPlans')" />
          <UButton v-else size="sm" to="/login" :label="t('nav.login')" />
        </template>
      </UAlert>
    </UCard>

    <section v-if="data.pinnedPosts.length" aria-labelledby="pinned-posts-heading" class="space-y-3">
      <div class="flex items-center gap-2">
        <h2 id="pinned-posts-heading" class="flex-1 text-lg font-bold">{{ t('channel.pinnedPosts') }}</h2>
        <span v-if="data.pinnedPosts.length > 1" class="text-sm text-muted">{{ pinnedIndex + 1 }} / {{ data.pinnedPosts.length }}</span>
        <UButton v-if="data.pinnedPosts.length > 1" size="sm" color="neutral" variant="ghost" icon="i-lucide-chevron-left" :aria-label="t('channel.previousPinned')" @click="pinnedIndex = (pinnedIndex - 1 + data.pinnedPosts.length) % data.pinnedPosts.length" />
        <UButton v-if="data.pinnedPosts.length > 1" size="sm" color="neutral" variant="ghost" icon="i-lucide-chevron-right" :aria-label="t('channel.nextPinned')" @click="pinnedIndex = (pinnedIndex + 1) % data.pinnedPosts.length" />
      </div>
      <PostCard v-if="currentPinned" :key="currentPinned.id" :post="currentPinned" photo-source="channel" @changed="refresh" />
    </section>

    <UAlert
      v-if="data.channel.archived" color="neutral" variant="soft" icon="i-lucide-archive"
      :title="t('channel.archivedTitle')"
      :description="t('channel.archivedText')"
      class="mb-4"
    />

    <!-- Visibilidad privada sin acceso: pantalla de bloqueo. La
         cabecera y la portada se ven; las publicaciones y el chat
         no existen en esta vista (el servidor ni las manda). -->
    <UCard v-if="data.channel.visibilityLocked" class="py-10 text-center">
      <UIcon name="i-lucide-lock" class="mx-auto text-4xl text-muted" />
      <h2 class="mt-3 text-lg font-bold">{{ t('channel.lockedTitle') }}</h2>
      <p class="mx-auto mt-1 max-w-md text-sm text-muted">
        {{ data.channel.type === 'paid' ? t('channel.lockedPaidText') : t('channel.lockedText') }}
      </p>
    </UCard>

    <UTabs v-else v-model="tab" :items="tabItems">
      <template #content="{ item }">
        <div v-if="item.value === 'posts'" class="mt-4 space-y-5">
          <!-- Conmutador de vistas de un canal de imagen -->
          <div v-if="isImageChannel" class="flex w-fit rounded-full bg-elevated p-1" role="group" :aria-label="t('channel.viewFeed')">
            <button
              v-for="v in viewItems" :key="v.value" type="button"
              class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition"
              :class="view === v.value ? 'bg-default shadow' : 'text-muted'"
              @click="view = v.value"
            >
              <UIcon :name="v.icon" /> {{ v.label }}
            </button>
          </div>

          <template v-if="!isImageChannel || view === 'feed'">
            <PostComposer v-if="user && data.channel.hasAccess" :channel-slug="slug" @published="refresh" />
            <PostCard v-for="post in data.posts" :key="post.id" :post="post" photo-source="channel" @changed="refresh" />
            <UAlert v-if="!data.posts.length && !data.pinnedPosts.length" color="neutral" variant="soft" :title="t('channel.noPostsTitle')" :description="t('channel.noPostsText')" />
          </template>

          <!-- Galería: cuadrícula con la imagen de cada publicación
               que tenga una; clic abre el detalle del post. -->
          <template v-else-if="view === 'gallery'">
            <div v-if="galleryPosts.length" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <NuxtLink
                v-for="post in galleryPosts" :key="post.id"
                :to="{ path: `/p/${post.channel.slug}/${post.slug}`, query: { photo: post.slug, pi: '1', from: 'channel' } }"
                class="group relative block overflow-hidden rounded-lg"
              >
                <img :src="post.mediaUrl" :alt="post.title" class="aspect-square w-full object-cover transition group-hover:scale-105">
                <span class="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-xs text-white">{{ post.title }}</span>
              </NuxtLink>
            </div>
            <UAlert v-else color="neutral" variant="soft" icon="i-lucide-image-off" :title="t('channel.galleryEmpty')" :description="t('channel.galleryEmptyText')" />
          </template>

          <!-- Álbum: las publicaciones agrupadas por su álbum. -->
          <template v-else>
            <PostComposer v-if="user && data.channel.hasAccess" :channel-slug="slug" @published="refresh" />
            <div v-for="g in albumGroups" :key="g.name || '__none'" class="space-y-4">
              <h3 class="flex items-center gap-2 pt-2 font-bold">
                <UIcon name="i-lucide-folder-open" class="text-muted" />
                {{ g.name || t('channel.noAlbum') }}
                <span class="text-sm font-normal text-muted">{{ t('channel.albumCount', { count: g.posts.length }) }}</span>
              </h3>
              <PostCard v-for="post in g.posts" :key="post.id" :post="post" photo-source="channel" @changed="refresh" />
            </div>
            <UAlert v-if="!data.posts.length && !data.pinnedPosts.length" color="neutral" variant="soft" :title="t('channel.noPostsTitle')" :description="t('channel.noPostsText')" />
          </template>
          <ListPagination :offset="offset" :next-offset="data.nextOffset" @update:offset="offset = $event" />
        </div>
        <UCard v-else class="mt-4">
          <ChannelChat v-if="user && data.channel.hasAccess" :slug="slug" />
          <UAlert v-else-if="!user" color="neutral" variant="soft" icon="i-lucide-lock" :title="t('channel.chatLoginTitle')" :description="t('channel.chatLoginText')">
            <template #actions>
              <UButton size="sm" to="/login" :label="t('nav.login')" />
            </template>
          </UAlert>
          <UAlert v-else color="warning" variant="soft" icon="i-lucide-lock" :title="t('channel.chatNoAccessTitle')" :description="t('channel.chatNoAccessText')" />
        </UCard>
      </template>
    </UTabs>

    <ManualPaymentDialog
      v-model:open="manualOpen" kind="channel" :slug="slug" :item-id="data.channel.id"
      :product-name="t('channel.manualProductName', { name: data.channel.name })" :amount-cents="data.channel.priceCents"
    />
  </div>
</template>
