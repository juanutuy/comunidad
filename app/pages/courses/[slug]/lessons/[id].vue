<script setup lang="ts">
// Visor de lección (Fase 2): contenido completo para lecciones gratuitas
// o miembros inscritos; botón para marcar completada (actualiza el avance).
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const lessonId = computed(() => String(route.params.id))
const api = useApi()
const toast = useToast()
const { user } = useAuth()

interface LessonData {
  course: { slug: string, title: string, enrolled: boolean }
  lesson: { id: number, title: string, chapterTitle: string, durationMin: number, isFree: boolean, content: string, videoUrl: string, canView: boolean, completed: boolean }
  prevId: number | null
  nextId: number | null
}
const { data, refresh } = await useAsyncData(
  () => `lesson-${slug.value}-${lessonId.value}`,
  () => api<LessonData>(`/api/courses/${slug.value}/lessons/${lessonId.value}`),
  { watch: [slug, lessonId] },
)

const youtubeEmbed = computed(() => {
  const url = data.value?.lesson.videoUrl || ''
  if (!url) return ''
  if (url.includes('/embed/')) return url
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : ''
})

const toggling = ref(false)
async function toggleComplete() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para registrar tu avance', color: 'warning' }); return }
  toggling.value = true
  try {
    const res = await api<{ completed: boolean, progress: { pct: number } }>(`/api/lessons/${lessonId.value}/complete`, { method: 'POST' })
    toast.add({ title: res.completed ? `Lección completada · avance del curso: ${res.progress.pct}%` : 'Lección desmarcada', color: 'success' })
    await refresh()
    await refreshNuxtData('courses')
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar tu avance', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { toggling.value = false }
}
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UButton :to="`/courses/${slug}`" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="`Volver a ${data.course.title}`" class="-ml-2" />
    <UCard>
      <p class="text-xs font-bold tracking-wider text-muted uppercase">{{ data.lesson.chapterTitle }} · {{ data.lesson.durationMin }} min</p>
      <h1 class="mt-2 text-2xl font-bold">{{ data.lesson.title }}</h1>
      <div class="mt-3 flex flex-wrap gap-2">
        <UBadge v-if="data.lesson.isFree" color="success" variant="subtle">Lección gratuita</UBadge>
        <UBadge v-if="data.lesson.completed" color="success" variant="soft" icon="i-lucide-check">Completada</UBadge>
      </div>

      <div v-if="data.lesson.canView && data.lesson.videoUrl" class="mt-5 aspect-video overflow-hidden rounded-lg">
        <iframe v-if="youtubeEmbed" :src="youtubeEmbed" class="h-full w-full" allowfullscreen title="Video de la lección" />
        <a v-else :href="data.lesson.videoUrl" target="_blank" rel="noopener" class="flex h-full items-center justify-center bg-elevated text-primary hover:underline">Ver el video de la lección</a>
      </div>
      <div v-if="data.lesson.canView" class="mt-5 space-y-4 leading-relaxed">
        <p v-for="(para, i) in data.lesson.content.split('\n\n')" :key="i" class="whitespace-pre-line">{{ para }}</p>
      </div>
      <UAlert v-else class="mt-5" color="warning" variant="soft" icon="i-lucide-lock" title="Lección solo para inscritos" description="Inscribite al curso para ver el contenido completo y registrar tu avance.">
        <template #actions>
          <UButton :to="`/courses/${slug}`" size="sm" label="Ir al curso" />
        </template>
      </UAlert>

      <div v-if="data.lesson.canView" class="mt-6 flex flex-wrap items-center gap-2 border-t border-default pt-4">
        <UButton
          :label="data.lesson.completed ? 'Desmarcar como completada' : 'Marcar como completada'"
          :icon="data.lesson.completed ? 'i-lucide-undo-2' : 'i-lucide-check-circle-2'"
          :color="data.lesson.completed ? 'neutral' : 'primary'"
          :loading="toggling"
          @click="toggleComplete"
        />
        <span class="flex-1" />
        <UButton v-if="data.prevId" :to="`/courses/${slug}/lessons/${data.prevId}`" color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="Anterior" />
        <UButton v-if="data.nextId" :to="`/courses/${slug}/lessons/${data.nextId}`" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right" label="Siguiente" />
      </div>
    </UCard>
  </div>
</template>
