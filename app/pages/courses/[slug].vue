<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const toast = useToast()
const { user } = useAuth()
const { fmtMoney } = useFormat()

interface Lesson { id: number, title: string, durationMin: number, isFree: boolean, completed: boolean, canView: boolean }
interface Chapter { id: number, title: string, lessons: Lesson[] }
interface CourseDetail { course: { id: number, slug: string, title: string, description: string, level: string, priceCents: number, enrolled: boolean, progress: { completed: number, total: number, pct: number } }, chapters: Chapter[] }
const { data, refresh } = await useAsyncData(() => `course-${slug.value}`, () => api<CourseDetail>(`/api/courses/${slug.value}`), { watch: [slug] })

const open = ref<string[]>(['0'])
async function enroll() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para inscribirte', color: 'warning' }); return }
  try {
    await api(`/api/courses/${slug.value}/enroll`, { method: 'POST' })
    toast.add({ title: '¡Inscripción confirmada!', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'Este curso es pago', description: (e as { data?: { message?: string } }).data?.message || 'Completá la compra para inscribirte.', color: 'warning' })
  }
}

const { data: billing } = await useAsyncData('billing-status-course', () => api<{ enabled: boolean }>('/api/billing/status'))
const buying = ref(false)
async function buyCourse() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para comprar', color: 'warning' }); return }
  buying.value = true
  try {
    const res = await api<{ url: string }>('/api/billing/checkout', { method: 'POST', body: { kind: 'course', slug: slug.value } })
    window.location.href = res.url
  }
  catch (e) {
    toast.add({ title: 'No se pudo iniciar el pago', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { buying.value = false }
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
      <div v-if="!data.course.enrolled" class="mt-4 flex flex-wrap items-center gap-2">
        <UButton v-if="!(data.course.priceCents > 0)" label="Inscribirme" icon="i-lucide-graduation-cap" @click="enroll" />
        <template v-else-if="billing?.enabled">
          <UButton :label="`Comprar curso · ${fmtMoney(data.course.priceCents)}`" icon="i-lucide-credit-card" :loading="buying" @click="buyCourse" />
          <span class="text-sm text-muted">La inscripción se activa automáticamente al confirmarse el pago.</span>
        </template>
        <template v-else>
          <UButton label="Comprar curso" icon="i-lucide-credit-card" disabled />
          <span class="text-sm text-muted">Pagos en línea próximamente: esta comunidad todavía no activó los pagos con tarjeta.</span>
        </template>
      </div>
      <template v-else>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <UBadge color="success" variant="soft" icon="i-lucide-check" size="lg">Ya estás inscrito</UBadge>
          <UButton v-if="data.course.progress.pct === 100" :to="`/courses/${slug}/certificate`" label="Ver mi certificado" icon="i-lucide-award" color="primary" />
        </div>
        <div class="mt-4 max-w-md">
          <div class="mb-1 flex justify-between text-xs text-muted">
            <span>Tu avance</span><span>{{ data.course.progress.completed }}/{{ data.course.progress.total }} lecciones · {{ data.course.progress.pct }}%</span>
          </div>
          <UProgress :model-value="data.course.progress.pct" />
        </div>
      </template>
    </UCard>

    <UCard>
      <h2 class="mb-3 font-bold">Currículum del curso</h2>
      <UAccordion v-model="open" :items="data.chapters.map((ch, i) => ({ label: `Capítulo ${i + 1}: ${ch.title}`, value: String(i), slot: `chapter-${i}` }))" multiple>
        <template v-for="(ch, i) in data.chapters" :key="ch.id" #[`chapter-${i}`]>
          <ul class="divide-y divide-default">
            <li v-for="l in ch.lessons" :key="l.id" class="flex items-center gap-3 py-2.5 text-sm">
              <UIcon :name="l.completed ? 'i-lucide-check-circle-2' : 'i-lucide-play-circle'" :class="l.completed ? 'text-green-500' : 'text-muted'" />
              <NuxtLink v-if="l.canView" :to="`/courses/${slug}/lessons/${l.id}`" class="flex-1 hover:underline" :class="{ 'text-muted line-through-none': l.completed }">{{ l.title }}</NuxtLink>
              <span v-else class="flex-1">{{ l.title }}</span>
              <span class="text-muted">{{ l.durationMin }} min</span>
              <UBadge v-if="l.completed" color="success" variant="subtle">Completada</UBadge>
              <UBadge v-else-if="l.isFree" color="success" variant="subtle">Gratis</UBadge>
              <UIcon v-else-if="!data.course.enrolled" name="i-lucide-lock" class="text-muted" />
            </li>
          </ul>
        </template>
      </UAccordion>
    </UCard>
  </div>
</template>
