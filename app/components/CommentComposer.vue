<script setup lang="ts">
// Compositor de comentario/respuesta (Fase 16-G): texto + UN
// adjunto opcional, como en la referencia. La fila de iconos
// (clip, imagen, video, archivo) filtra el selector según el tipo;
// el archivo sube al momento por /api/uploads (imagen con kind
// 'image', el resto con kind 'file', que ya acepta video MP4 y los
// tipos de la biblioteca) y queda una vista previa retirable antes
// de enviar. El tipo final viaja como mediaType espejo del adjunto
// de posts: image | video | file según el tipo real del archivo.
import type { CommentMediaInput } from '~/composables/usePostComments'

const props = defineProps<{
  framed?: boolean
  placeholder: string
  submitLabel: string
  initialBody?: string
  cancelLabel?: string | null
  autofocus?: boolean
}>()
const emit = defineEmits<{
  submit: [payload: { body: string, media: CommentMediaInput | null }]
  cancel: []
}>()

const { t } = useI18n()
const api = useApi()
const toast = useToast()

const body = ref(props.initialBody || '')
const media = ref<CommentMediaInput | null>(null)
const uploading = ref(false)
const sending = ref(false)

const canSubmit = computed(() => !uploading.value && !sending.value && (!!body.value.trim() || !!media.value))

const imageInput = ref<HTMLInputElement | null>(null)
const videoInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const anyInput = ref<HTMLInputElement | null>(null)

function mediaTypeFor(file: File): string {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}

async function onFile(e: Event, kind: 'image' | 'file') {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', kind)
    const res = await api<{ url: string, name: string }>('/api/uploads', { method: 'POST', body: fd })
    media.value = { mediaType: mediaTypeFor(file), mediaUrl: res.url, mediaName: res.name }
  }
  catch (err) {
    toast.add({ title: t('comments.attachFailed'), description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploading.value = false }
}

async function submit() {
  if (!canSubmit.value) return
  sending.value = true
  try {
    emit('submit', { body: body.value.trim(), media: media.value })
    body.value = ''
    media.value = null
  }
  finally { sending.value = false }
}
</script>

<template>
  <div class="min-w-0 flex-1" :class="framed ? 'rounded-2xl border border-default bg-muted/30 p-3' : undefined">
    <UTextarea
      v-model="body"
      :rows="2"
      :variant="framed ? 'none' : 'outline'"
      :ui="framed ? { base: 'resize-none p-0 shadow-none ring-0 focus:ring-0' } : undefined"
      :placeholder="placeholder"
      :autofocus="autofocus"
      class="w-full"
      @keydown.meta.enter="submit"
      @keydown.ctrl.enter="submit"
    />
    <!-- Vista previa del adjunto: imagen en línea o chip de
         archivo/video, siempre retirable antes de enviar. -->
    <div v-if="media" class="mt-2">
      <div v-if="media.mediaType === 'image'" class="relative inline-block">
        <img :src="media.mediaUrl" :alt="t('comments.attachmentAlt')" class="max-h-32 rounded-lg object-cover">
        <UButton size="xs" color="neutral" icon="i-lucide-x" class="absolute top-1 right-1" :title="t('comments.removeAttachment')" @click="media = null" />
      </div>
      <div v-else class="inline-flex max-w-full items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm">
        <UIcon :name="media.mediaType === 'video' ? 'i-lucide-video' : 'i-lucide-paperclip'" class="shrink-0 text-muted" />
        <span class="min-w-0 truncate font-medium">{{ media.mediaName || t('comments.attachedFile') }}</span>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :title="t('comments.removeAttachment')" @click="media = null" />
      </div>
    </div>
    <div class="mt-2 flex items-center gap-1">
      <input ref="anyInput" type="file" class="hidden" accept="image/*,video/mp4,.pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.zip,.mp3" @change="e => onFile(e, 'file')">
      <input ref="imageInput" type="file" class="hidden" accept="image/*" @change="e => onFile(e, 'image')">
      <input ref="videoInput" type="file" class="hidden" accept="video/*" @change="e => onFile(e, 'file')">
      <input ref="fileInput" type="file" class="hidden" accept=".pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.zip" @change="e => onFile(e, 'file')">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-paperclip" :title="t('comments.attachAny')" :loading="uploading" @click="anyInput?.click()" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-image" :title="t('comments.attachImage')" :loading="uploading" @click="imageInput?.click()" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-video" :title="t('comments.attachVideo')" :loading="uploading" @click="videoInput?.click()" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-file" :title="t('comments.attachFile')" :loading="uploading" @click="fileInput?.click()" />
      <span class="flex-1" />
      <UButton v-if="cancelLabel" size="sm" color="neutral" variant="ghost" :label="cancelLabel" @click="emit('cancel')" />
      <UButton size="sm" :class="framed ? 'rounded-full' : undefined" :label="submitLabel" icon="i-lucide-send" :disabled="!canSubmit" @click="submit" />
    </div>
  </div>
</template>
