<script setup lang="ts">
// Un comentario (Fase 16-G): avatar, nombre, hora, cuerpo, adjunto,
// resumen de reacciones y acciones Reaccionar · Responder · menú
// «⋯» (Editar/Eliminar propios, Eliminar del staff, Reportar
// ajenos — lo mismo que ya existía, ahora también en respuestas).
// La raíz pinta además sus respuestas (UN nivel) y la caja de
// respuesta; «Responder» en una respuesta abre la caja de la raíz.
import type { CommentNode } from '~/utils/reactions'

const props = defineProps<{
  postId: number
  node: CommentNode
  isReply?: boolean
  allowComments: boolean
  canInteract: boolean
  onReply?: () => void
}>()

const { user } = useAuth()
const guestAccess = useGuestAccess()
const { t } = useI18n()
const { timeAgo, initials } = useFormat()
const toast = useToast()
const { openReport } = useReportDialog()
const commentsApi = usePostComments()

const replyOpen = ref(false)
const replyBoxEl = ref<HTMLElement | null>(null)
const editing = ref(false)
const editBody = ref('')

const isMine = computed(() => !!user.value && user.value.slug === props.node.author.slug)
const isStaff = computed(() => !!user.value && ['admin', 'moderator'].includes(user.value.role || ''))

function openReply() {
  if (!user.value) { guestAccess.requestAccess(); return }
  if (props.isReply && props.onReply) { props.onReply(); return }
  replyOpen.value = true
}

function focusReply() {
  replyOpen.value = true
  nextTick(() => replyBoxEl.value?.querySelector('textarea')?.focus())
}

async function onReact(emoji: string) {
  if (!user.value) { guestAccess.requestAccess(); return }
  try { await commentsApi.react(props.postId, props.node.id, emoji) }
  catch (e) { toast.add({ title: t('comments.reactFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' }) }
}

async function submitReply(payload: { body: string, media: { mediaType: string, mediaUrl: string, mediaName: string } | null }) {
  try {
    await commentsApi.add(props.postId, { body: payload.body, media: payload.media, parentId: props.node.id })
    replyOpen.value = false
    toast.add({ title: t('comments.replySent'), color: 'success' })
  }
  catch (e) { toast.add({ title: t('comments.commentFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' }) }
}

function startEdit() {
  editBody.value = props.node.body
  editing.value = true
}

async function saveEdit() {
  try {
    await commentsApi.edit(props.postId, props.node.id, editBody.value)
    editing.value = false
  }
  catch (e) { toast.add({ title: t('comments.editFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' }) }
}

async function deleteComment() {
  try {
    await commentsApi.remove(props.postId, props.node.id)
    toast.add({ title: t('comments.commentDeleted'), color: 'success' })
  }
  catch { toast.add({ title: t('comments.commentDeleteFailed'), color: 'error' }) }
}

const menuItems = computed(() => {
  const items: { label: string, icon: string, color?: 'error', onSelect: () => void }[] = []
  if (!user.value) return [items]
  if (isMine.value) {
    items.push({ label: t('comments.edit'), icon: 'i-lucide-pencil', onSelect: startEdit })
    items.push({ label: t('comments.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: deleteComment })
  }
  else {
    if (isStaff.value) items.push({ label: t('comments.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: deleteComment })
    items.push({ label: t('comments.report'), icon: 'i-lucide-flag', onSelect: () => openReport({ type: 'comment', id: props.node.id, label: props.node.body.slice(0, 80) || props.node.mediaName }) })
  }
  return [items]
})
</script>

<template>
  <div class="flex gap-3">
    <UAvatar :src="node.author.avatarUrl || undefined" :text="initials(node.author.name)" size="sm" class="mt-0.5 shrink-0" />
    <div class="min-w-0 flex-1">
      <div class="rounded-lg bg-elevated p-3">
        <p class="flex items-center gap-2 text-sm">
          <NuxtLink :to="`/profile/${node.author.slug}`" class="font-semibold hover:underline">{{ node.author.name }}</NuxtLink>
          <span class="text-xs text-muted">{{ timeAgo(node.createdAt) }}</span>
          <span class="flex-1" />
          <UDropdownMenu v-if="user && menuItems[0]?.length" :items="menuItems">
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-more-horizontal" :title="t('comments.actions')" />
          </UDropdownMenu>
        </p>
        <div v-if="editing" class="mt-2">
          <UTextarea v-model="editBody" :rows="2" class="w-full" autofocus />
          <div class="mt-2 flex justify-end gap-2">
            <UButton size="xs" color="neutral" variant="ghost" :label="t('common.cancel')" @click="editing = false" />
            <UButton size="xs" :label="t('common.save')" icon="i-lucide-check" @click="saveEdit" />
          </div>
        </div>
        <template v-else>
          <p v-if="node.body" class="mt-1 whitespace-pre-line text-sm">{{ node.body }}</p>
          <!-- Adjunto del comentario: imagen en línea, video con
               reproductor o chip de archivo con su nombre. -->
          <img v-if="node.mediaType === 'image' && node.mediaUrl" :src="node.mediaUrl" :alt="t('comments.attachmentAlt')" class="mt-2 max-h-56 rounded-lg object-cover">
          <video v-else-if="node.mediaType === 'video' && node.mediaUrl" :src="node.mediaUrl" controls class="mt-2 max-h-56 w-full rounded-lg" />
          <a v-else-if="node.mediaType === 'file' && node.mediaUrl" :href="node.mediaUrl" download class="mt-2 flex items-center gap-3 rounded-lg border border-default p-2.5 text-sm transition hover:bg-accented">
            <UIcon name="i-lucide-paperclip" class="shrink-0 text-muted" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ node.mediaName || t('comments.attachedFile') }}</span>
            <span class="flex shrink-0 items-center gap-1 text-primary"><UIcon name="i-lucide-download" /> {{ t('post.download') }}</span>
          </a>
        </template>
      </div>

      <div class="mt-1.5 flex flex-wrap items-center gap-1 px-1">
        <ReactionSummary :top="node.reactionTop" :total="node.reactionTotal" small class="mr-1" />
        <ReactionPicker :my-reaction="node.myReaction" @select="onReact">
          <UButton
            size="xs" variant="ghost"
            :color="node.myReaction ? 'primary' : 'neutral'"
            :label="node.myReaction ? `${node.myReaction} ${t('comments.react')}` : t('comments.react')"
            :title="t('comments.react')"
          />
        </ReactionPicker>
        <UButton
          v-if="allowComments && canInteract && user"
          size="xs" color="neutral" variant="ghost" icon="i-lucide-reply"
          :label="t('comments.reply')" @click="openReply"
        />
        <span v-if="!isReply && node.replies.length" class="text-xs text-muted">
          {{ t(node.replies.length === 1 ? 'comments.replyOne' : 'comments.repliesMany', { count: node.replies.length }) }}
        </span>
      </div>

      <!-- Respuestas del hilo (un nivel) y su caja. -->
      <div v-if="!isReply && (node.replies.length || replyOpen)" class="mt-3 space-y-3 border-l-2 border-default pl-3">
        <PostCommentItem
          v-for="reply in node.replies"
          :key="reply.id"
          :post-id="postId"
          :node="reply"
          is-reply
          :allow-comments="allowComments"
          :can-interact="canInteract"
          :on-reply="focusReply"
        />
        <div v-if="replyOpen" ref="replyBoxEl" class="flex gap-2">
          <CommentComposer
            :placeholder="t('comments.replyPlaceholder')"
            :submit-label="t('comments.replyButton')"
            :cancel-label="t('common.cancel')"
            autofocus
            @submit="submitReply"
            @cancel="replyOpen = false"
          />
        </div>
      </div>
    </div>
  </div>
</template>
