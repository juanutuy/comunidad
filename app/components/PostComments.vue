<script setup lang="ts">
const guestAccess = useGuestAccess()
// LA sección de comentarios (Fase 16-G): un solo componente para
// la tarjeta (se expande dentro de la misma tarjeta, como en el
// original) y para la página de detalle (nace expandida). Lee y
// escribe el estado compartido por post (usePostComments), así
// ambas superficies muestran la misma conversación.
//
// Estructura como la referencia: compositor «Añade un comentario…»
// arriba con su fila de adjuntos, línea «N comentarios» con el
// selector de orden (Más recientes / Más antiguos — reordena las
// raíces; las respuestas siempre van cronológicas) y la lista de
// hilos. Sin acceso real al canal el servidor no entrega la
// conversación (withheld) y se muestra el aviso; con los
// comentarios desactivados no hay compositores ni respuestas.
import type { CommentNode } from '~/utils/reactions'

const props = defineProps<{
  viewer?: boolean
  postId: number
  allowComments: boolean
  canInteract: boolean
  channelSlug?: string
  initial?: { comments: CommentNode[], total: number, withheld: boolean } | null
}>()

const { user } = useAuth()
const { t } = useI18n()
const toast = useToast()
const commentsApi = usePostComments()
const s = commentsApi.state(props.postId)

// Con datos iniciales (detalle) la siembra es en setup: la sección
// también se renderiza en el servidor, como siempre en el detalle.
// Sin datos iniciales (tarjeta) se carga al montar — la tarjeta
// solo monta la sección al expandirla.
if (props.initial) commentsApi.seed(props.postId, props.initial.comments, props.initial.total, props.initial.withheld)
onMounted(() => {
  if (!props.initial) commentsApi.load(props.postId)
})

const sortItems = computed(() => [
  { label: t('comments.sortRecent'), value: 'recent' as const },
  { label: t('comments.sortOldest'), value: 'oldest' as const },
])
const roots = computed(() => commentsApi.sortedRoots(props.postId))

async function submitComment(payload: { body: string, media: { mediaType: string, mediaUrl: string, mediaName: string } | null }) {
  try {
    await commentsApi.add(props.postId, { body: payload.body, media: payload.media })
  }
  catch (e) { toast.add({ title: t('comments.commentFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' }) }
}
</script>

<template>
  <div v-if="viewer" class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
      <slot name="intro" />
      <div v-if="s.loading && !s.loaded" class="flex justify-center py-6 text-muted"><UIcon name="i-lucide-loader-2" class="animate-spin" /></div>
      <template v-else-if="!s.withheld && s.total">
        <div class="mb-5 flex items-center justify-between gap-3 text-sm text-muted">
          <span>{{ t('comments.countLabel', { count: s.total }) }}</span>
          <USelect v-model="s.sort" :items="sortItems" size="xs" class="w-36" />
        </div>
        <div class="space-y-5">
          <PostCommentItem v-for="root in roots" :key="root.id" :post-id="postId" :node="root" :allow-comments="allowComments" :can-interact="canInteract" />
        </div>
      </template>
    </div>
    <div class="shrink-0 border-t border-default p-4 sm:p-5">
      <UButton v-if="!user" block color="primary" icon="i-lucide-log-in" :label="t('postDetail.loginToComment')" @click="guestAccess.requestAccess()" />
      <p v-else-if="s.withheld" class="text-sm text-muted">{{ t('postDetail.commentsMembersOnly') }}</p>
      <p v-else-if="!allowComments" class="text-sm text-muted">{{ t('postDetail.commentsDisabledText') }}</p>
      <p v-else-if="!canInteract" class="text-sm text-muted">{{ t('postDetail.readOnlyText') }}</p>
      <CommentComposer v-else framed :placeholder="t('comments.addPlaceholder')" :submit-label="t('comments.commentButton')" @submit="submitComment" />
    </div>
  </div>
  <div v-else class="border-t border-default pt-4">
    <div v-if="s.loading && !s.loaded" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-2" class="animate-spin" /> {{ t('common.loading') }}
    </div>
    <template v-else>
      <!-- Sin acceso: la conversación no viaja (detalle y tarjeta
           comparten el criterio del servidor). -->
      <UButton v-if="!user" color="neutral" variant="soft" icon="i-lucide-log-in" :label="t('postDetail.loginToComment')" @click="guestAccess.requestAccess()" />
      <p v-else-if="s.withheld" class="text-sm text-muted">{{ t('postDetail.commentsMembersOnly') }}</p>
      <template v-else>
        <div class="mb-4 flex items-center gap-2">
          <h3 class="flex items-center gap-2 text-sm font-bold">
            <UIcon name="i-lucide-message-circle" />
            {{ t('comments.countLabel', { count: s.total }) }}
          </h3>
          <span class="flex-1" />
          <USelect v-model="s.sort" :items="sortItems" size="xs" class="w-36" />
        </div>

        <UAlert
          v-if="!allowComments" color="neutral" variant="soft" icon="i-lucide-lock" class="mb-4"
          :title="t('postDetail.commentsDisabledTitle')" :description="t('postDetail.commentsDisabledText')"
        />
        <UAlert
          v-else-if="!canInteract" color="neutral" variant="soft" icon="i-lucide-lock" class="mb-4"
          :title="t('postDetail.readOnlyTitle')" :description="t('postDetail.readOnlyText')"
        >
          <template v-if="channelSlug" #actions>
            <UButton :to="`/channels/${channelSlug}`" size="sm" :label="t('postDetail.getAccess')" />
          </template>
        </UAlert>
        <div v-else-if="user" class="mb-5 flex gap-2">
          <CommentComposer
            :placeholder="t('comments.addPlaceholder')"
            :submit-label="t('comments.commentButton')"
            @submit="submitComment"
          />
        </div>
        <UButton v-else class="mb-4" color="neutral" variant="soft" icon="i-lucide-message-circle" :label="t('postDetail.loginToComment')" @click="guestAccess.requestAccess()" />

        <div class="space-y-4">
          <PostCommentItem
            v-for="root in roots"
            :key="root.id"
            :post-id="postId"
            :node="root"
            :allow-comments="allowComments"
            :can-interact="canInteract"
          />
          <p v-if="!roots.length" class="text-sm text-muted">{{ t('postDetail.noComments') }}</p>
        </div>
      </template>
    </template>
  </div>
</template>
