<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const toast = useToast()
const { user } = useAuth()
const { fmtMoney } = useFormat()

interface Lesson { id: number, title: string, durationMin: number, isFree: boolean }
interface Chapter { id: number, title: string, lessons: Lesson[] }
interface CourseDetail { course: { id: number, slug: string, title: string, description: string, level: string, priceCents: number, enrolled: boolean }, chapters: Chapter[] }
const { data, refresh } = await useAsyncData(() => `course-${slug.value}`, () => api<CourseDetail>(`/api/courses/${slug.value}`), { watch: [slug] })

const open = ref<string[]>(['0'])
async function enroll() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para inscribirte', color: 'warning' }); return }
  await api(`/api/courses/${slug.value}/enroll`, { method: 'POST' })
  toast.add({ title: '¡Inscripción confirmada!', color: 'success' })
  await refresh()
}
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UButton to="/courses" color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="Todos los cursos" class="-ml-2" />
    <UCard>
      <div class="flex flex-wrap gap-2">
        <UBadge color="primary" variant="subtle">{{ data.course.level }}</UBadge>
        <UBadge :color="data.course.priceCents ? 'warning' : 'success'" variant="subtle">{{ fmtMoney(data.course.priceCents) }}{{ data.course.priceCents ? ' · Pago único' : '' }}</UBadge>
      </div>
      <h1 class="mt-3 text-2xl font-bold">{{ data.course.title }}</h1>
      <p class="mt-2 whitespace-pre-line text-muted">{{ data.course.description }}</p>
      <UButton v-if="!data.course.enrolled" class="mt-4" label="Inscribirme" icon="i-lucide-graduation-cap" @click="enroll" />
      <UBadge v-else class="mt-4" color="success" variant="soft" icon="i-lucide-check" size="lg">Ya estás inscrito</UBadge>
    </UCard>

    <UCard>
      <h2 class="mb-3 font-bold">Currículum del curso</h2>
      <UAccordion v-model="open" :items="data.chapters.map((ch, i) => ({ label: `Capítulo ${i + 1}: ${ch.title}`, value: String(i), slot: `chapter-${i}` }))" multiple>
        <template v-for="(ch, i) in data.chapters" :key="ch.id" #[`chapter-${i}`]>
          <ul class="divide-y divide-default">
            <li v-for="l in ch.lessons" :key="l.id" class="flex items-center gap-3 py-2.5 text-sm">
              <UIcon name="i-lucide-play-circle" class="text-muted" />
              <span class="flex-1">{{ l.title }}</span>
              <span class="text-muted">{{ l.durationMin }} min</span>
              <UBadge v-if="l.isFree" color="success" variant="subtle">Gratis</UBadge>
              <UIcon v-else-if="!data.course.enrolled" name="i-lucide-lock" class="text-muted" />
            </li>
          </ul>
        </template>
      </UAccordion>
    </UCard>
  </div>
</template>
