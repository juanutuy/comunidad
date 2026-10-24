<script setup lang="ts">
// Eventos con dos vistas (Fase 2): Lista (próximos/pasados) y Calendario
// mensual con navegación y eventos posicionados por día.
const api = useApi()
const { user } = useAuth()
const { t, locale } = useI18n()
const { fmtDateTime } = useFormat()
interface EventCard { id: number, slug: string, title: string, description: string, startsAt: string, endsAt: string, location: string, category: string, host: { name: string }, going: number, myRsvp: boolean, past: boolean, hosting: boolean }
const { data } = await useAsyncData('events', () => api<{ events: EventCard[] }>('/api/events'))
const category = ref('all')
const participation = ref('all')
const categories = computed(() => [{ value: 'all', label: t('improvements.all') }, ...[...new Set((data.value?.events || []).map(e => e.category))].filter(Boolean).map(value => ({ value, label: value }))])
const participationOptions = computed(() => [{ value: 'all', label: t('improvements.all') }, { value: 'registered', label: t('improvements.registered') }, { value: 'hosting', label: t('improvements.hosting') }])
const filteredEvents = computed(() => (data.value?.events || []).filter(e => (category.value === 'all' || e.category === category.value) && (participation.value === 'all' || (participation.value === 'hosting' ? e.hosting : e.myRsvp))))
const upcoming = computed(() => filteredEvents.value.filter(e => !e.past))
const past = computed(() => filteredEvents.value.filter(e => e.past))

const view = ref<'lista' | 'calendario'>('lista')
const viewOptions = computed(() => [
  { label: t('events.listView'), value: 'lista' as const, icon: 'i-lucide-list' },
  { label: t('events.calendarView'), value: 'calendario' as const, icon: 'i-lucide-calendar-days' },
])

// --- Calendario mensual (semana empieza el lunes) ---
const nowDate = new Date()
const calYear = ref(nowDate.getFullYear())
const calMonth = ref(nowDate.getMonth()) // 0-11
const calLabel = computed(() => new Date(calYear.value, calMonth.value, 1).toLocaleDateString(locale.value === 'en' ? 'en-US' : 'es', { month: 'long', year: 'numeric' }))

function moveMonth(delta: number) {
  const d = new Date(calYear.value, calMonth.value + delta, 1)
  calYear.value = d.getFullYear()
  calMonth.value = d.getMonth()
}
function goToday() {
  calYear.value = nowDate.getFullYear()
  calMonth.value = nowDate.getMonth()
}

function sameLocalDay(iso: string, y: number, m: number, d: number) {
  const dt = new Date(iso)
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d
}
const calCells = computed(() => {
  const first = new Date(calYear.value, calMonth.value, 1)
  const lead = (first.getDay() + 6) % 7 // lunes = 0
  const daysInMonth = new Date(calYear.value, calMonth.value + 1, 0).getDate()
  const cells: { day: number, events: EventCard[], isToday: boolean }[] = []
  for (let i = 0; i < lead; i++) cells.push({ day: 0, events: [], isToday: false })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      events: filteredEvents.value.filter(e => sameLocalDay(e.startsAt, calYear.value, calMonth.value, d)),
      isToday: sameLocalDay(nowDate.toISOString(), calYear.value, calMonth.value, d) && nowDate.getDate() === d,
    })
  }
  while (cells.length % 7) cells.push({ day: 0, events: [], isToday: false })
  return cells
})
const weekDays = computed(() => t('events.weekdays').split('|'))
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap gap-3">
      <USelect v-model="category" :items="categories" :aria-label="t('improvements.category')" />
      <USelect v-if="user" v-model="participation" :items="participationOptions" :aria-label="t('improvements.eventFilter')" />
    </div>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">{{ t('events.title') }}</h1>
        <p class="text-muted">{{ t('events.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton v-if="user?.role === 'admin'" to="/admin/events" :label="t('events.createEvent')" icon="i-lucide-plus" color="primary" size="sm" />
        <div class="flex overflow-hidden rounded-lg border border-default">
          <UButton
            v-for="v in viewOptions" :key="v.value" :icon="v.icon" :label="v.label" size="sm"
            :color="view === v.value ? 'primary' : 'neutral'" :variant="view === v.value ? 'solid' : 'ghost'"
            class="rounded-none" @click="view = v.value"
          />
        </div>
      </div>
    </div>

    <template v-if="view === 'lista'">
      <div class="grid gap-4 sm:grid-cols-2">
        <UCard v-for="e in upcoming" :key="e.id">
          <div class="flex items-start justify-between gap-2">
            <UBadge color="primary" variant="subtle">{{ e.category }}</UBadge>
            <span class="text-xs text-muted">{{ t('events.attendeesCount', { count: e.going }) }}</span>
          </div>
          <NuxtLink :to="`/events/${e.slug}`" class="mt-3 block text-lg font-bold leading-snug hover:underline">{{ e.title }}</NuxtLink>
          <p class="mt-2 flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-clock" /> {{ fmtDateTime(e.startsAt) }}</p>
          <p class="mt-1 flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-map-pin" /> {{ e.location }}</p>
          <UButton :to="`/events/${e.slug}`" class="mt-4" size="sm" :label="e.myRsvp ? t('events.rsvpDone') : t('events.viewReserve')" :color="e.myRsvp ? 'success' : 'primary'" />
        </UCard>
      </div>
      <UAlert v-if="!upcoming.length" color="neutral" variant="soft" :title="t('events.noUpcoming')" />
      <template v-if="past.length">
        <h2 class="text-lg font-bold">{{ t('events.pastEvents') }}</h2>
        <div class="grid gap-4 opacity-70 sm:grid-cols-2">
          <UCard v-for="e in past" :key="e.id">
            <NuxtLink :to="`/events/${e.slug}`" class="font-bold hover:underline">{{ e.title }}</NuxtLink>
            <p class="mt-1 text-sm text-muted">{{ fmtDateTime(e.startsAt) }} · {{ t('events.attendeesCount', { count: e.going }) }}</p>
          </UCard>
        </div>
      </template>
    </template>

    <UCard v-else :ui="{ body: 'p-3 sm:p-4' }">
      <div class="mb-3 flex items-center gap-2">
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-left" :aria-label="t('events.prevMonth')" @click="moveMonth(-1)" />
        <h2 class="flex-1 text-center font-bold capitalize">{{ calLabel }}</h2>
        <UButton color="neutral" variant="ghost" size="sm" :label="t('events.today')" @click="goToday" />
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-chevron-right" :aria-label="t('events.nextMonth')" @click="moveMonth(1)" />
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs font-bold tracking-wider text-muted uppercase">
        <span v-for="d in weekDays" :key="d" class="py-1">{{ d }}</span>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <div
          v-for="(cell, i) in calCells" :key="i"
          class="min-h-20 rounded-lg border p-1.5 sm:min-h-24"
          :class="cell.day ? 'border-default bg-white dark:bg-neutral-900' : 'border-transparent bg-transparent'"
        >
          <template v-if="cell.day">
            <p class="text-xs font-semibold" :class="cell.isToday ? 'text-primary' : 'text-muted'">{{ cell.day }}<span v-if="cell.isToday">{{ t('events.todaySuffix') }}</span></p>
            <div class="mt-1 space-y-1">
              <NuxtLink
                v-for="e in cell.events" :key="e.id" :to="`/events/${e.slug}`"
                class="block truncate rounded bg-primary/10 px-1.5 py-1 text-[11px] leading-tight font-medium text-primary hover:bg-primary/20"
                :title="`${e.title} · ${fmtDateTime(e.startsAt)}`"
              >
                {{ e.title }}
              </NuxtLink>
            </div>
          </template>
        </div>
      </div>
      <p class="mt-3 text-xs text-muted">{{ t('events.calendarHint') }}</p>
    </UCard>
  </div>
</template>
