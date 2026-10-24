<script setup lang="ts">
const api = useApi()
const { user } = useAuth()
const { t } = useI18n()
const { fmtMoney } = useFormat()
const q = ref('')
const sort = ref('newest')
const view = ref('grid')
const sortOptions = computed(() => ['newest', 'oldest', 'name'].map(value => ({ value, label: t(`improvements.${value}` as 'improvements.newest') })))
interface CourseCard { id: number, slug: string, title: string, description: string, level: string, priceCents: number, imageUrl: string, chapters: number, lessons: number, enrolled: boolean, progress: { completed: number, total: number, pct: number } }
const { data, refresh } = await useAsyncData('courses', () => api<{ courses: CourseCard[] }>('/api/courses'))
const filteredCourses = computed(() => [...(data.value?.courses || [])].filter(c => `${c.title} ${c.description}`.toLocaleLowerCase().includes(q.value.trim().toLocaleLowerCase())).sort((a, b) => sort.value === 'name' ? a.title.localeCompare(b.title) : sort.value === 'oldest' ? a.id - b.id : b.id - a.id))
function search() { /* filtering is reactive */ }
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">{{ t('courses.title') }}</h1>
        <p class="text-muted">{{ t('courses.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton v-if="user && ['admin', 'course_manager'].includes(user.role || '')" to="/admin/courses" :label="t('courses.createCourse')" icon="i-lucide-plus" color="primary" />
        <UInput v-model="q" :placeholder="t('courses.searchPlaceholder')" icon="i-lucide-search" @keyup.enter="search" />
        <UButton :label="t('common.search')" @click="search" />
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <USelect v-model="sort" :items="sortOptions" :aria-label="t('improvements.sort')" />
      <UButton v-for="mode in ['grid', 'list']" :key="mode" :icon="mode === 'grid' ? 'i-lucide-grid-2x2' : 'i-lucide-list'" :variant="view === mode ? 'solid' : 'soft'" :aria-label="mode === 'grid' ? t('improvements.grid') : t('improvements.list')" :aria-pressed="view === mode" @click="view = mode" />
    </div>
    <div class="grid gap-4" :class="view === 'grid' ? 'sm:grid-cols-2' : ''">
      <UCard v-for="c in filteredCourses" :key="c.id">
        <img v-if="c.imageUrl" :src="c.imageUrl" alt="" class="mb-3 h-36 w-full rounded-lg object-cover">
        <div class="flex items-start justify-between gap-2">
          <UBadge color="primary" variant="subtle">{{ c.level }}</UBadge>
          <UBadge :color="c.priceCents ? 'warning' : 'success'" variant="subtle">{{ fmtMoney(c.priceCents) }}</UBadge>
        </div>
        <NuxtLink :to="`/courses/${c.slug}`" class="mt-3 block text-lg font-bold leading-snug hover:underline">{{ c.title }}</NuxtLink>
        <p class="mt-1 line-clamp-3 text-sm text-muted">{{ c.description }}</p>
        <p class="mt-3 text-xs text-muted">{{ t('courses.chaptersLessons', { chapters: c.chapters, lessons: c.lessons }) }}</p>
        <div v-if="c.enrolled" class="mt-3">
          <div class="mb-1 flex justify-between text-xs text-muted">
            <span>{{ t('courses.yourProgress') }}</span><span>{{ t('courses.lessonsProgress', { completed: c.progress.completed, total: c.progress.total, pct: c.progress.pct }) }}</span>
          </div>
          <UProgress :model-value="c.progress.pct" size="sm" />
        </div>
        <div class="mt-4 flex gap-2">
          <UButton :to="`/courses/${c.slug}`" :label="t('courses.viewCourse')" size="sm" />
          <UButton v-if="user && ['admin', 'course_manager'].includes(user.role || '')" :to="`/admin/courses/${c.id}/edit`" :label="t('common.edit')" size="sm" color="neutral" variant="soft" icon="i-lucide-pencil" />
          <UBadge v-if="c.progress.pct === 100 && c.progress.total > 0" color="success" variant="soft" icon="i-lucide-award">{{ t('courses.completed') }}</UBadge>
          <UBadge v-else-if="c.enrolled" color="success" variant="soft" icon="i-lucide-check">{{ t('courses.enrolled') }}</UBadge>
        </div>
      </UCard>
    </div>
    <UAlert v-if="!filteredCourses.length" color="neutral" variant="soft" :title="t('courses.noResultsTitle')" :description="t('courses.noResultsText')" />
  </div>
</template>
