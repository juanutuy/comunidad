<script setup lang="ts">
// Landing del curso. Vive en [slug]/index.vue A PROPÓSITO: si fuera
// [slug].vue, Nuxt la trataría como componente padre de lessons/ y
// certificate/ y, sin <NuxtPage />, esas rutas hijas nunca se verían
// (bug corregido: el visor de lecciones mostraba esta landing).
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const toast = useToast()
const { user } = useAuth()
const { fmtMoney } = useFormat()

interface Lesson { id: number, title: string, kind: string, durationMin: number, isFree: boolean, completed: boolean, canView: boolean, locked: boolean, lockReason: 'drip' | 'prerequisite' | null, availableAt: string | null }
interface Chapter { id: number, title: string, lessons: Lesson[] }
interface CourseDetail { course: { id: number, slug: string, title: string, description: string, shortDescription: string, descriptionHtml: string, level: string, priceCents: number, imageUrl: string, bannerUrl: string, certificateEnabled: boolean, enrolled: boolean, progress: { completed: number, total: number, pct: number } }, chapters: Chapter[] }
const { data, refresh } = await useAsyncData(() => `course-${slug.value}`, () => api<CourseDetail>(`/api/courses/${slug.value}`), { watch: [slug] })
const { fmtDate } = useFormat()
const kindIcon: Record<string, string> = {
  video: 'i-lucide-play-circle', text: 'i-lucide-file-text', audio: 'i-lucide-music', pdf: 'i-lucide-file',
  slides: 'i-lucide-presentation', download: 'i-lucide-download', embedded: 'i-lucide-monitor-play',
}

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

const { data: billing } = await useAsyncData('billing-status-course', () => api<{ enabled: boolean, manualEnabled: boolean }>('/api/billing/status'))
// Fase 17: pago manual de la inscripción (queda en revisión hasta
// que un admin lo aprueba en Ingresos: declarar no inscribe).
const manualOpen = ref(false)
function openManual() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para comprar', color: 'warning' }); return }
  manualOpen.value = true
}
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
      <img v-if="data.course.bannerUrl" :src="data.course.bannerUrl" alt="" class="mt-3 h-52 w-full rounded-lg object-cover">
      <img v-else-if="data.course.imageUrl" :src="data.course.imageUrl" alt="" class="mt-3 h-52 w-full rounded-lg object-cover">
      <h1 class="mt-3 text-2xl font-bold">{{ data.course.title }}</h1>
      <p v-if="data.course.shortDescription" class="mt-2 text-muted">{{ data.course.shortDescription }}</p>
      <!-- eslint-disable-next-line vue/no-v-html -- descripción del curso: HTML sanitizado en el servidor -->
      <div v-if="data.course.descriptionHtml" class="rich-content mt-3" v-html="data.course.descriptionHtml" />
      <p v-else-if="!data.course.shortDescription" class="mt-2 whitespace-pre-line text-muted">{{ data.course.description }}</p>
      <div v-if="!data.course.enrolled" class="mt-4 flex flex-wrap items-center gap-2">
        <UButton v-if="!(data.course.priceCents > 0)" label="Inscribirme" icon="i-lucide-graduation-cap" @click="enroll" />
        <template v-else>
          <UButton v-if="billing?.enabled" :label="`Comprar curso · ${fmtMoney(data.course.priceCents)}`" icon="i-lucide-credit-card" :loading="buying" @click="buyCourse" />
          <UButton v-if="billing?.manualEnabled" :label="`Pago manual · ${fmtMoney(data.course.priceCents)}`" color="neutral" variant="soft" icon="i-lucide-hand-coins" @click="openManual" />
          <UButton v-if="!billing?.enabled && !billing?.manualEnabled" label="Comprar curso" icon="i-lucide-credit-card" disabled />
          <span v-if="billing?.enabled" class="text-sm text-muted">La inscripción se activa automáticamente al confirmarse el pago.</span>
          <span v-else-if="billing?.manualEnabled" class="text-sm text-muted">Pagás por fuera y la administración verifica el pago: la inscripción se activa al aprobarlo.</span>
          <span v-else class="text-sm text-muted">Pagos próximamente: esta comunidad todavía no activó ningún medio de pago.</span>
        </template>
      </div>
      <template v-else>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <UBadge color="success" variant="soft" icon="i-lucide-check" size="lg">Ya estás inscrito</UBadge>
          <UButton v-if="data.course.progress.pct === 100 && data.course.certificateEnabled" :to="`/courses/${slug}/certificate`" label="Ver mi certificado" icon="i-lucide-award" color="primary" />
        </div>
        <div class="mt-4 max-w-md">
          <div class="mb-1 flex justify-between text-xs text-muted">
            <span>Tu avance</span><span>{{ data.course.progress.completed }}/{{ data.course.progress.total }} lecciones · {{ data.course.progress.pct }}%</span>
          </div>
          <UProgress :model-value="data.course.progress.pct" />
        </div>
      </template>
      <ManualPaymentDialog
        v-model:open="manualOpen" kind="course" :slug="slug" :item-id="data.course.id"
        :product-name="`Curso ${data.course.title}`" :amount-cents="data.course.priceCents"
      />
    </UCard>

    <UCard>
      <h2 class="mb-3 font-bold">Currículum del curso</h2>
      <UAccordion v-model="open" :items="data.chapters.map((ch, i) => ({ label: `Capítulo ${i + 1}: ${ch.title}`, value: String(i), slot: `chapter-${i}` }))" multiple>
        <template v-for="(ch, i) in data.chapters" :key="ch.id" #[`chapter-${i}`]>
          <ul class="divide-y divide-default">
            <li v-for="l in ch.lessons" :key="l.id" class="flex items-center gap-3 py-2.5 text-sm">
              <UIcon :name="l.completed ? 'i-lucide-check-circle-2' : (kindIcon[l.kind] || 'i-lucide-file-text')" :class="l.completed ? 'text-green-500' : 'text-muted'" />
              <NuxtLink v-if="l.canView" :to="`/courses/${slug}/lessons/${l.id}`" class="flex-1 hover:underline" :class="{ 'text-muted': l.completed }">{{ l.title }}</NuxtLink>
              <span v-else class="flex-1">{{ l.title }}</span>
              <span v-if="l.durationMin" class="text-muted">{{ l.durationMin }} min</span>
              <UBadge v-if="l.completed" color="success" variant="subtle">Completada</UBadge>
              <template v-else-if="l.locked">
                <UBadge v-if="l.lockReason === 'drip' && l.availableAt" color="warning" variant="subtle" icon="i-lucide-lock">Disponible el {{ fmtDate(l.availableAt) }}</UBadge>
                <UBadge v-else color="warning" variant="subtle" icon="i-lucide-lock">Completá la anterior</UBadge>
              </template>
              <UBadge v-else-if="l.isFree" color="success" variant="subtle">Gratis</UBadge>
              <UIcon v-else-if="!data.course.enrolled" name="i-lucide-lock" class="text-muted" />
            </li>
          </ul>
        </template>
      </UAccordion>
    </UCard>
  </div>
</template>
