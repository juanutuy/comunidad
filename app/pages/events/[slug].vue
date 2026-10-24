<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const api = useApi()
const toast = useToast()
const { user } = useAuth()
const { t } = useI18n()
const { fmtDateTime, initials } = useFormat()

interface EventDetail { event: { id: number, slug: string, title: string, description: string, descriptionHtml: string, startsAt: string, endsAt: string, location: string, category: string, agenda: string[], host: { name: string, slug: string }, going: number, myRsvp: boolean }, attendees: { name: string, slug: string }[] }
const { data, refresh } = await useAsyncData(() => `event-${slug.value}`, () => api<EventDetail>(`/api/events/${slug.value}`), { watch: [slug] })

async function toggleRsvp() {
  if (!user.value) { toast.add({ title: t('event.loginToRsvp'), color: 'warning' }); return }
  await api(`/api/events/${slug.value}/rsvp`, { method: 'POST' })
  await refresh()
}
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UButton to="/events" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :label="t('event.allEvents')" class="-ml-2" />
    <UCard>
      <UBadge color="primary" variant="subtle">{{ data.event.category }}</UBadge>
      <h1 class="mt-3 text-2xl font-bold">{{ data.event.title }}</h1>
      <p class="mt-1 text-sm text-muted">
        {{ t('event.hostedBy') }} <NuxtLink v-if="data.event.host.slug && !data.event.host.slug.startsWith('deleted-')" :to="`/profile/${data.event.host.slug}`" class="font-medium hover:underline">{{ data.event.host.name }}</NuxtLink><span v-else class="font-medium">{{ data.event.host.name }}</span>
      </p>
      <div class="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <p class="flex items-center gap-2"><UIcon name="i-lucide-calendar" /> {{ fmtDateTime(data.event.startsAt) }}</p>
        <p class="flex items-center gap-2"><UIcon name="i-lucide-clock" /> {{ t('event.until') }} {{ fmtDateTime(data.event.endsAt) }}</p>
        <p class="flex items-center gap-2"><UIcon name="i-lucide-map-pin" /> {{ data.event.location }}</p>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -- descripción del evento: HTML sanitizado en el servidor -->
      <div v-if="data.event.descriptionHtml" class="rich-content mt-4" v-html="data.event.descriptionHtml" />
      <p v-else class="mt-4 whitespace-pre-line leading-relaxed">{{ data.event.description }}</p>
      <div v-if="data.event.agenda?.length" class="mt-5">
        <h2 class="mb-2 flex items-center gap-2 font-bold"><UIcon name="i-lucide-list-ordered" /> {{ t('event.agenda') }}</h2>
        <ol class="space-y-1.5">
          <li v-for="(item, i) in data.event.agenda" :key="i" class="flex gap-2.5 text-sm leading-relaxed">
            <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">{{ i + 1 }}</span>
            <span class="whitespace-pre-line">{{ item }}</span>
          </li>
        </ol>
      </div>
      <p class="mt-3 text-sm text-muted">{{ t('event.virtualNote') }}</p>
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <UButton
          :label="data.event.myRsvp ? t('event.rsvpCancel') : t('event.rsvpAttend')"
          :color="data.event.myRsvp ? 'success' : 'primary'"
          icon="i-lucide-check"
          @click="toggleRsvp"
        />
        <span class="text-sm text-muted">{{ t('event.goingCount', { count: data.event.going }) }}</span>
      </div>
    </UCard>
    <UCard v-if="data.attendees.length">
      <h2 class="mb-3 font-bold">{{ t('event.attendees') }}</h2>
      <div class="flex flex-wrap gap-2">
        <NuxtLink v-for="a in data.attendees" :key="a.slug" :to="`/profile/${a.slug}`">
          <UBadge color="neutral" variant="soft" size="lg">
            <UAvatar :text="initials(a.name)" size="2xs" class="mr-1" /> {{ a.name }}
          </UBadge>
        </NuxtLink>
      </div>
    </UCard>
  </div>
</template>
