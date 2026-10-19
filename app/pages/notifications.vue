<script setup lang="ts">
// Página completa de notificaciones (Fase 2): lista, marcar una o todas
// como leídas. La campana del encabezado muestra las últimas 8.
interface NotificationView {
  id: number
  type: string
  title: string
  link: string
  isRead: boolean
  createdAt: string
  actor: { name: string, slug: string, avatarUrl: string } | null
}

const { user } = useAuth()
const { fmtDateTime, initials } = useFormat()
const api = useApi()
const toast = useToast()

const { data, refresh } = await useAsyncData('notifications-page', () =>
  user.value ? api<{ unread: number, notifications: NotificationView[] }>('/api/notifications') : Promise.resolve({ unread: 0, notifications: [] as NotificationView[] }))

const typeIcons: Record<string, string> = {
  reaction: 'i-lucide-heart',
  comment: 'i-lucide-message-circle',
  new_post: 'i-lucide-pen-square',
  mention: 'i-lucide-at-sign',
}

async function markOne(n: NotificationView) {
  if (!n.isRead) {
    await api('/api/notifications/read', { method: 'POST', body: { id: n.id } })
    await refresh()
  }
}

async function markAll() {
  await api('/api/notifications/read', { method: 'POST', body: {} })
  toast.add({ title: 'Todas las notificaciones quedaron marcadas como leídas', color: 'success' })
  await refresh()
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Notificaciones</h1>
        <p class="text-muted">Reacciones, comentarios, menciones y publicaciones nuevas de tus canales.</p>
      </div>
      <UButton v-if="data?.unread" label="Marcar todas como leídas" icon="i-lucide-check-check" size="sm" @click="markAll" />
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" title="Iniciá sesión para ver tus notificaciones" />
    <template v-else>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="n in data?.notifications || []" :key="n.id">
            <NuxtLink :to="n.link || '/notifications'" class="flex items-start gap-3 px-4 py-3 hover:bg-elevated" :class="{ 'opacity-70': n.isRead }" @click="markOne(n)">
              <UAvatar :src="n.actor?.avatarUrl || undefined" :text="n.actor ? initials(n.actor.name) : undefined" :icon="typeIcons[n.type] || 'i-lucide-bell'" size="md" class="shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block leading-snug">{{ n.title }}</span>
                <span class="block text-xs text-muted">{{ fmtDateTime(n.createdAt) }}</span>
              </span>
              <span v-if="!n.isRead" class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            </NuxtLink>
          </li>
        </ul>
      </UCard>
      <UAlert v-if="!(data?.notifications?.length)" color="neutral" variant="soft" title="Sin notificaciones todavía" description="Cuando alguien reaccione o comente tus publicaciones, lo vas a ver aquí." />
    </template>
  </div>
</template>
