<script setup lang="ts">
const api = useApi()
const { user } = useAuth()
const { fmtMoney } = useFormat()
const q = ref('')
interface CourseCard { id: number, slug: string, title: string, description: string, level: string, priceCents: number, imageUrl: string, chapters: number, lessons: number, enrolled: boolean, progress: { completed: number, total: number, pct: number } }
const { data, refresh } = await useAsyncData('courses', () => api<{ courses: CourseCard[] }>('/api/courses'))
async function search() {
  data.value = await api<{ courses: CourseCard[] }>('/api/courses', { query: { q: q.value } })
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Cursos</h1>
        <p class="text-muted">Aprendé a tu ritmo con cursos creados por la comunidad.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton v-if="user && ['admin', 'course_manager'].includes(user.role || '')" to="/admin/courses" label="Crear curso" icon="i-lucide-plus" color="primary" />
        <UInput v-model="q" placeholder="Buscar cursos…" icon="i-lucide-search" @keyup.enter="search" />
        <UButton label="Buscar" @click="search" />
      </div>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UCard v-for="c in data?.courses || []" :key="c.id">
        <img v-if="c.imageUrl" :src="c.imageUrl" alt="" class="mb-3 h-36 w-full rounded-lg object-cover">
        <div class="flex items-start justify-between gap-2">
          <UBadge color="primary" variant="subtle">{{ c.level }}</UBadge>
          <UBadge :color="c.priceCents ? 'warning' : 'success'" variant="subtle">{{ fmtMoney(c.priceCents) }}</UBadge>
        </div>
        <NuxtLink :to="`/courses/${c.slug}`" class="mt-3 block text-lg font-bold leading-snug hover:underline">{{ c.title }}</NuxtLink>
        <p class="mt-1 line-clamp-3 text-sm text-muted">{{ c.description }}</p>
        <p class="mt-3 text-xs text-muted">{{ c.chapters }} capítulos · {{ c.lessons }} lecciones</p>
        <div v-if="c.enrolled" class="mt-3">
          <div class="mb-1 flex justify-between text-xs text-muted">
            <span>Tu avance</span><span>{{ c.progress.completed }}/{{ c.progress.total }} lecciones · {{ c.progress.pct }}%</span>
          </div>
          <UProgress :model-value="c.progress.pct" size="sm" />
        </div>
        <div class="mt-4 flex gap-2">
          <UButton :to="`/courses/${c.slug}`" label="Ver curso" size="sm" />
          <UButton v-if="user && ['admin', 'course_manager'].includes(user.role || '')" :to="`/admin/courses/${c.id}/edit`" label="Editar" size="sm" color="neutral" variant="soft" icon="i-lucide-pencil" />
          <UBadge v-if="c.progress.pct === 100 && c.progress.total > 0" color="success" variant="soft" icon="i-lucide-award">Completado</UBadge>
          <UBadge v-else-if="c.enrolled" color="success" variant="soft" icon="i-lucide-check">Inscrito</UBadge>
        </div>
      </UCard>
    </div>
    <UAlert v-if="!(data?.courses?.length)" color="neutral" variant="soft" title="Sin resultados" description="Probá con otra búsqueda." />
  </div>
</template>
