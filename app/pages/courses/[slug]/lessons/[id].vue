<script setup lang="ts">
// Visor de lección (Fase 8): renderiza los 7 tipos de lección —
// video (embed o MP4), texto con formato, audio con reproductor,
// PDF en visor, slides (incrustadas o archivo), descarga e
// incrustado — y los estados de acceso: sin inscripción, bloqueada
// por drip («Disponible el {fecha}») o por prerrequisito.
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const lessonId = computed(() => String(route.params.id))
const api = useApi()
const toast = useToast()
const { user } = useAuth()
const { fmtDate } = useFormat()

interface LessonView {
  id: number, title: string, chapterTitle: string, kind: string, durationMin: number, isFree: boolean,
  canView: boolean, completed: boolean, locked: boolean, lockReason: 'drip' | 'prerequisite' | null, availableAt: string | null,
  content: string, contentHtml: string, videoUrl: string, fileUrl: string, fileName: string, embedUrl: string,
  allowDownload: boolean, resourceUrl: string, resourceName: string,
}
interface LessonData { course: { slug: string, title: string, enrolled: boolean }, lesson: LessonView, prevId: number | null, nextId: number | null }
const { data, refresh } = await useAsyncData(() => `lesson-${slug.value}-${lessonId.value}`, () => api<LessonData>(`/api/courses/${slug.value}/lessons/${lessonId.value}`), { watch: [lessonId] })

// Embed de video: YouTube/Vimeo → iframe; archivo directo → <video>.
const embed = computed(() => (data.value?.lesson.videoUrl ? videoEmbedUrl(data.value.lesson.videoUrl) : null))
const isDirectVideo = computed(() => {
  const u = data.value?.lesson.videoUrl || ''
  return !!u && !videoEmbedUrl(u)
})
const toggling = ref(false)
async function toggleComplete() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para registrar tu avance', color: 'warning' }); return }
  toggling.value = true
  try {
    const res = await api<{ completed: boolean }>(`/api/lessons/${lessonId.value}/complete`, { method: 'POST' })
    toast.add({ title: res.completed ? 'Lección completada' : 'Marcada como no completada', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo actualizar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { toggling.value = false }
}
</script>

<template>
  <div v-if="data" class="mx-auto max-w-3xl space-y-5">
    <UButton :to="`/courses/${slug}`" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="`Volver a ${data.course.title}`" class="-ml-2" />
    <div>
      <p class="text-sm text-muted">{{ data.lesson.chapterTitle }}</p>
      <h1 class="mt-1 text-2xl font-bold">{{ data.lesson.title }}</h1>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <UBadge v-if="data.lesson.isFree" color="success" variant="subtle">Vista previa gratuita</UBadge>
        <UBadge v-if="data.lesson.durationMin" color="neutral" variant="subtle" icon="i-lucide-clock">{{ data.lesson.durationMin }} min</UBadge>
        <UBadge v-if="data.lesson.completed" color="success" variant="soft" icon="i-lucide-check">Completada</UBadge>
      </div>
    </div>

    <!-- Sin acceso o bloqueada -->
    <UCard v-if="!data.lesson.canView">
      <div class="py-8 text-center">
        <UIcon name="i-lucide-lock" class="mx-auto mb-3 size-10 text-muted" />
        <template v-if="data.lesson.locked && data.lesson.lockReason === 'drip' && data.lesson.availableAt">
          <p class="font-semibold">Todavía no está disponible</p>
          <p class="mx-auto mt-1 max-w-md text-sm text-muted">Esta lección se libera el <strong>{{ fmtDate(data.lesson.availableAt) }}</strong>. Volvé en esa fecha para verla.</p>
        </template>
        <template v-else-if="data.lesson.locked && data.lesson.lockReason === 'prerequisite'">
          <p class="font-semibold">Completá primero la lección anterior</p>
          <p class="mx-auto mt-1 max-w-md text-sm text-muted">Esta lección se habilita cuando marques como completada la lección previa del curso.</p>
        </template>
        <template v-else>
          <p class="font-semibold">Inscribite para ver esta lección</p>
          <p class="mx-auto mt-1 max-w-md text-sm text-muted">El contenido completo es para los inscritos del curso. Algunas lecciones marcadas como gratuitas se pueden ver como muestra.</p>
          <UButton :to="`/courses/${slug}`" label="Ver el curso e inscribirme" class="mt-4" icon="i-lucide-graduation-cap" />
        </template>
      </div>
    </UCard>

    <!-- Contenido según el tipo -->
    <template v-else>
      <UCard v-if="data.lesson.kind === 'video'">
        <div v-if="embed" class="rich-video">
          <iframe :src="embed" title="Video de la lección" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen />
        </div>
        <video v-else-if="isDirectVideo" :src="data.lesson.videoUrl" controls class="w-full rounded-lg" />
        <p v-else class="text-muted">Esta lección de video todavía no tiene una URL cargada.</p>
        <!-- eslint-disable-next-line vue/no-v-html -- descripción sanitizada en el servidor -->
        <div v-if="data.lesson.contentHtml" class="rich-content mt-4" v-html="data.lesson.contentHtml" />
        <p v-else-if="data.lesson.content" class="mt-4 whitespace-pre-line">{{ data.lesson.content }}</p>
      </UCard>

      <UCard v-else-if="data.lesson.kind === 'text'">
        <!-- eslint-disable-next-line vue/no-v-html -- contenido sanitizado en el servidor -->
        <div v-if="data.lesson.contentHtml" class="rich-content" v-html="data.lesson.contentHtml" />
        <p v-else class="whitespace-pre-line">{{ data.lesson.content }}</p>
      </UCard>

      <UCard v-else-if="data.lesson.kind === 'audio'">
        <audio v-if="data.lesson.fileUrl" :src="data.lesson.fileUrl" controls class="w-full" />
        <p v-else class="text-muted">Esta lección de audio todavía no tiene un archivo cargado.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton v-if="data.lesson.allowDownload && data.lesson.fileUrl" :to="data.lesson.fileUrl" external download label="Descargar audio" icon="i-lucide-download" size="sm" color="neutral" variant="soft" />
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- descripción sanitizada en el servidor -->
        <div v-if="data.lesson.contentHtml" class="rich-content mt-4" v-html="data.lesson.contentHtml" />
        <p v-else-if="data.lesson.content" class="mt-4 whitespace-pre-line">{{ data.lesson.content }}</p>
      </UCard>

      <UCard v-else-if="data.lesson.kind === 'pdf'">
        <iframe v-if="data.lesson.fileUrl" :src="data.lesson.fileUrl" class="h-[70vh] w-full rounded-lg border border-default" title="Documento PDF" />
        <p v-else class="text-muted">Esta lección todavía no tiene un PDF cargado.</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton v-if="data.lesson.allowDownload && data.lesson.fileUrl" :to="data.lesson.fileUrl" external download :label="`Descargar ${data.lesson.fileName || 'PDF'}`" icon="i-lucide-download" size="sm" color="neutral" variant="soft" />
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- descripción sanitizada en el servidor -->
        <div v-if="data.lesson.contentHtml" class="rich-content mt-4" v-html="data.lesson.contentHtml" />
        <p v-else-if="data.lesson.content" class="mt-4 whitespace-pre-line">{{ data.lesson.content }}</p>
      </UCard>

      <UCard v-else-if="data.lesson.kind === 'slides'">
        <div v-if="data.lesson.embedUrl" class="rich-video">
          <iframe :src="data.lesson.embedUrl" title="Presentación" loading="lazy" allowfullscreen />
        </div>
        <iframe v-else-if="data.lesson.fileUrl && data.lesson.fileUrl.toLowerCase().endsWith('.pdf')" :src="data.lesson.fileUrl" class="h-[70vh] w-full rounded-lg border border-default" title="Presentación en PDF" />
        <div v-else-if="data.lesson.fileUrl" class="py-6 text-center">
          <UIcon name="i-lucide-presentation" class="mx-auto mb-2 size-8 text-muted" />
          <p class="text-sm text-muted">La presentación está cargada como archivo.</p>
          <UButton :to="data.lesson.fileUrl" external :download="data.lesson.allowDownload || undefined" :label="`Abrir ${data.lesson.fileName || 'presentación'}`" icon="i-lucide-presentation" class="mt-3" />
        </div>
        <p v-else class="text-muted">Esta lección todavía no tiene una presentación cargada.</p>
        <!-- eslint-disable-next-line vue/no-v-html -- descripción sanitizada en el servidor -->
        <div v-if="data.lesson.contentHtml" class="rich-content mt-4" v-html="data.lesson.contentHtml" />
        <p v-else-if="data.lesson.content" class="mt-4 whitespace-pre-line">{{ data.lesson.content }}</p>
      </UCard>

      <UCard v-else-if="data.lesson.kind === 'download'">
        <div class="py-4 text-center">
          <UIcon name="i-lucide-download" class="mx-auto mb-2 size-10 text-muted" />
          <p class="font-semibold">{{ data.lesson.fileName || 'Archivo de la lección' }}</p>
          <p class="mx-auto mt-1 max-w-md text-sm text-muted">El material de esta lección es un archivo para descargar.</p>
          <UButton v-if="data.lesson.fileUrl" :to="data.lesson.fileUrl" external download label="Descargar archivo" icon="i-lucide-download" class="mt-4" />
          <p v-else class="mt-3 text-sm text-muted">Todavía no se cargó el archivo.</p>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- descripción sanitizada en el servidor -->
        <div v-if="data.lesson.contentHtml" class="rich-content mt-4" v-html="data.lesson.contentHtml" />
        <p v-else-if="data.lesson.content" class="mt-4 whitespace-pre-line">{{ data.lesson.content }}</p>
      </UCard>

      <UCard v-else-if="data.lesson.kind === 'embedded'">
        <div v-if="data.lesson.embedUrl" class="rich-video">
          <iframe :src="data.lesson.embedUrl" title="Contenido incrustado" loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allowfullscreen />
        </div>
        <p v-else class="text-muted">Esta lección todavía no tiene un contenido incrustado cargado.</p>
        <!-- eslint-disable-next-line vue/no-v-html -- descripción sanitizada en el servidor -->
        <div v-if="data.lesson.contentHtml" class="rich-content mt-4" v-html="data.lesson.contentHtml" />
        <p v-else-if="data.lesson.content" class="mt-4 whitespace-pre-line">{{ data.lesson.content }}</p>
      </UCard>

      <!-- Recurso descargable adjunto -->
      <UCard v-if="data.lesson.resourceUrl">
        <div class="flex flex-wrap items-center gap-3">
          <UIcon name="i-lucide-paperclip" class="size-5 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">Recurso de la lección</p>
            <p class="truncate text-xs text-muted">{{ data.lesson.resourceName || 'Archivo adjunto' }}</p>
          </div>
          <UButton :to="data.lesson.resourceUrl" external download label="Descargar" icon="i-lucide-download" size="sm" color="neutral" variant="soft" />
        </div>
      </UCard>

      <div class="flex items-center justify-between gap-3">
        <UButton v-if="data.prevId" :to="`/courses/${slug}/lessons/${data.prevId}`" label="Anterior" icon="i-lucide-arrow-left" color="neutral" variant="soft" />
        <span v-else />
        <UButton :label="data.lesson.completed ? 'Marcar como no completada' : 'Marcar como completada'"
          :icon="data.lesson.completed ? 'i-lucide-rotate-ccw' : 'i-lucide-check-circle-2'"
          :color="data.lesson.completed ? 'neutral' : 'primary'" :variant="data.lesson.completed ? 'soft' : 'solid'"
          :loading="toggling" @click="toggleComplete" />
        <UButton v-if="data.nextId" :to="`/courses/${slug}/lessons/${data.nextId}`" label="Siguiente" trailing-icon="i-lucide-arrow-right" color="neutral" variant="soft" />
        <span v-else />
      </div>
    </template>
  </div>
</template>
