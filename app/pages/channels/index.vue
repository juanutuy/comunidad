<script setup lang="ts">
// Directorio de canales (Fase 16-F): la lista completa y real de
// la comunidad — grupos con sus canales, estado de acceso y de
// seguimiento, y entrada a cada canal. Es el destino de «Ver
// canales» del menú de grupo, y el lugar donde viven los canales
// que el miembro dejó de seguir (siguen existiendo acá y en la
// búsqueda, con su acceso intacto). Los secretos sin acceso no
// aparecen: el servidor ni los lista.
const { user } = useAuth()
const { t } = useI18n()
const { fmtMoney } = useFormat()
const api = useApi()

interface DirChannel {
  id: number, slug: string, name: string, icon: string, description: string
  type: string, priceCents: number, contentType?: 'post' | 'image', coverUrl?: string
  visibility?: 'public' | 'private' | 'secret', groupId?: number | null, postPermission?: string
  archived?: boolean, following: boolean, hasAccess: boolean
}
interface DirGroup { id: number, name: string, channels: DirChannel[] }

const { data } = await useAsyncData('channels-dir', () => api<{ groups: DirGroup[] }>('/api/channels'))
const groups = computed(() => data.value?.groups || [])
const total = computed(() => groups.value.reduce((n, g) => n + g.channels.length, 0))
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">{{ t('channelsDir.title') }}</h1>
      <p class="mt-1 text-muted">{{ t('channelsDir.subtitle') }}</p>
    </div>

    <UAlert v-if="!total" color="neutral" variant="soft" icon="i-lucide-hash" :title="t('channelsDir.empty')" />

    <section v-for="g in groups" :key="g.id" class="space-y-3">
      <h2 class="text-xs font-bold tracking-wider text-muted uppercase">{{ g.name }}</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <UCard v-for="ch in g.channels" :key="ch.id" :ui="{ body: 'p-4 sm:p-4' }">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated">
              <UIcon :name="ch.icon" class="text-lg text-primary" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 font-semibold">
                <span class="truncate"># {{ ch.name }}</span>
                <UBadge v-if="ch.type === 'paid'" color="warning" variant="subtle" size="sm" icon="i-lucide-crown">{{ fmtMoney(ch.priceCents) }}</UBadge>
                <UBadge v-else-if="ch.type === 'private'" color="neutral" variant="subtle" size="sm" icon="i-lucide-lock">{{ t('channel.privateBadge') }}</UBadge>
                <UBadge v-if="ch.visibility === 'private'" color="neutral" variant="subtle" size="sm" icon="i-lucide-eye-off">{{ t('channel.lockedBadge') }}</UBadge>
                <UBadge v-if="ch.contentType === 'image'" color="primary" variant="subtle" size="sm" icon="i-lucide-image">{{ t('channel.imageBadge') }}</UBadge>
              </p>
              <p class="mt-0.5 line-clamp-2 text-sm text-muted">{{ ch.description }}</p>
              <p class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <UBadge :color="ch.hasAccess ? 'success' : 'neutral'" variant="soft" size="sm">
                  {{ ch.hasAccess ? t('channelsDir.withAccess') : t('channelsDir.withoutAccess') }}
                </UBadge>
                <UBadge v-if="user && ch.following" color="primary" variant="soft" size="sm" icon="i-lucide-check">
                  {{ t('channel.following') }}
                </UBadge>
              </p>
            </div>
            <ChannelContextMenu :channel="ch" size="sm" />
          </div>
          <UButton :to="`/channels/${ch.slug}`" class="mt-3" size="sm" variant="soft" block :label="t('channelsDir.open')" />
        </UCard>
      </div>
    </section>
  </div>
</template>
