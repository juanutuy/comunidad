<script setup lang="ts">
// Directorio de miembros (Fase 5): buscador, filtro por rol y punto
// de «en línea». Respeta el ajuste de privacidad de cada miembro.
interface DirectoryMember {
  id: number
  name: string
  slug: string
  bio: string
  avatarUrl: string
  role: string
  memberSince: string
  online: boolean
  lastSeenAt: string
}

const { user } = useAuth()
const { t } = useI18n()
const { fmtDate, timeAgo, initials } = useFormat()
const api = useApi()

const q = ref('')
const role = ref('all')
const roleTabs = computed(() => [
  { label: t('members.tabAll'), value: 'all' },
  { label: t('members.tabAdmins'), value: 'admin' },
  { label: t('members.tabMembers'), value: 'member' },
])
// Fase 15: el directorio puede abrirse a visitantes (modo público +
// audiencia «todos») o cerrarse del todo («desactivado» / «solo
// pagos»): la página pide siempre y muestra el motivo del servidor
// cuando no hay acceso, en vez de asumir que falta la sesión.
interface DirectoryData { members: DirectoryMember[], total: number, error?: string }
const { data, refresh } = await useAsyncData('members-directory', (): Promise<DirectoryData> =>
  api<DirectoryData>('/api/members/directory', { query: { q: q.value, role: role.value } })
    .catch((e: { data?: { message?: string } }) => ({ members: [] as DirectoryMember[], total: 0, error: e?.data?.message || t('members.loadError') })))

let debounce: ReturnType<typeof setTimeout> | null = null
watch(q, () => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(refresh, 300)
})
watch(role, () => refresh())
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">{{ t('members.title') }}</h1>
      <p class="text-muted">{{ t('members.subtitle') }}</p>
    </div>
    <UAlert v-if="data?.error" color="neutral" variant="soft" icon="i-lucide-lock" :title="data.error">
      <template v-if="!user" #actions>
        <UButton to="/login" size="sm" color="neutral" :label="t('nav.login')" />
        <UButton to="/register" size="sm" :label="t('nav.join')" />
      </template>
    </UAlert>
    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <UInput v-model="q" :placeholder="t('members.searchPlaceholder')" icon="i-lucide-search" class="w-64" />
        <UTabs v-model="role" :items="roleTabs" :content="false" size="sm" />
        <span class="text-sm text-muted">{{ t((data?.total ?? 0) === 1 ? 'members.countOne' : 'members.countMany', { count: data?.total ?? 0 }) }}</span>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <UCard v-for="m in data?.members || []" :key="m.id">
          <div class="flex items-start gap-3">
            <span class="relative shrink-0">
              <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="lg" />
              <span v-if="m.online" class="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" :title="t('common.online')" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <NuxtLink :to="`/profile/${m.slug}`" class="font-bold hover:underline">{{ m.name }}</NuxtLink>
                <UBadge v-if="m.role === 'admin'" color="primary" variant="subtle" size="sm">{{ t('members.adminBadge') }}</UBadge>
                <UBadge v-else-if="m.role === 'moderator'" color="warning" variant="subtle" size="sm">{{ t('members.moderatorBadge') }}</UBadge>
                <UBadge v-else-if="m.role === 'course_manager'" color="success" variant="subtle" size="sm">{{ t('members.courseManagerBadge') }}</UBadge>
                <UBadge v-if="m.online" color="success" variant="soft" size="sm">{{ t('common.online') }}</UBadge>
              </div>
              <p class="text-xs text-muted">
                {{ t('members.memberSince', { date: fmtDate(m.memberSince) }) }}<span v-if="!m.online && m.lastSeenAt">{{ t('members.activeAgo', { time: timeAgo(m.lastSeenAt) }) }}</span>
              </p>
              <p v-if="m.bio" class="mt-1 line-clamp-2 text-sm text-muted">{{ m.bio }}</p>
              <div class="mt-2 flex gap-2">
                <UButton :to="`/profile/${m.slug}`" size="xs" color="neutral" variant="soft" :label="t('members.viewProfile')" />
                <UButton v-if="user && user.slug !== m.slug" :to="`/messages?with=${m.slug}`" size="xs" variant="soft" icon="i-lucide-message-circle" :label="t('members.message')" />
              </div>
            </div>
          </div>
        </UCard>
      </div>
      <UAlert v-if="!(data?.members?.length)" color="neutral" variant="soft" :title="t('members.noResultsTitle')" :description="t('members.noResultsText')" />
    </template>
  </div>
</template>
