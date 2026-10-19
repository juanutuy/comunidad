<script setup lang="ts">
const api = useApi()
const { fmtDateTime } = useFormat()
interface EventCard { id: number, slug: string, title: string, description: string, startsAt: string, endsAt: string, location: string, category: string, host: { name: string }, going: number, myRsvp: boolean, past: boolean }
const { data } = await useAsyncData('events', () => api<{ events: EventCard[] }>('/api/events'))
const upcoming = computed(() => (data.value?.events || []).filter(e => !e.past))
const past = computed(() => (data.value?.events || []).filter(e => e.past))
const monthLabel = computed(() => new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' }))
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">Eventos</h1>
      <p class="text-muted">Encuentros de la comunidad · {{ monthLabel }} · las horas se muestran en tu zona local.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UCard v-for="e in upcoming" :key="e.id">
        <div class="flex items-start justify-between gap-2">
          <UBadge color="primary" variant="subtle">{{ e.category }}</UBadge>
          <span class="text-xs text-muted">{{ e.going }} asistentes</span>
        </div>
        <NuxtLink :to="`/events/${e.slug}`" class="mt-3 block text-lg font-bold leading-snug hover:underline">{{ e.title }}</NuxtLink>
        <p class="mt-2 flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-clock" /> {{ fmtDateTime(e.startsAt) }}</p>
        <p class="mt-1 flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-map-pin" /> {{ e.location }}</p>
        <UButton :to="`/events/${e.slug}`" class="mt-4" size="sm" :label="e.myRsvp ? 'Ya confirmaste asistencia' : 'Ver y reservar'" :color="e.myRsvp ? 'success' : 'primary'" />
      </UCard>
    </div>
    <UAlert v-if="!upcoming.length" color="neutral" variant="soft" title="No hay eventos próximos" />
    <template v-if="past.length">
      <h2 class="text-lg font-bold">Eventos pasados</h2>
      <div class="grid gap-4 opacity-70 sm:grid-cols-2">
        <UCard v-for="e in past" :key="e.id">
          <NuxtLink :to="`/events/${e.slug}`" class="font-bold hover:underline">{{ e.title }}</NuxtLink>
          <p class="mt-1 text-sm text-muted">{{ fmtDateTime(e.startsAt) }} · {{ e.going }} asistentes</p>
        </UCard>
      </div>
    </template>
  </div>
</template>
