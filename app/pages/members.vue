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
const { fmtDate, timeAgo, initials } = useFormat()
const api = useApi()

const q = ref('')
const role = ref('all')
const roleTabs = [
  { label: 'Todos', value: 'all' },
  { label: 'Administradores', value: 'admin' },
  { label: 'Miembros', value: 'member' },
]
const { data, refresh } = await useAsyncData('members-directory', () =>
  user.value
    ? api<{ members: DirectoryMember[], total: number }>('/api/members/directory', { query: { q: q.value, role: role.value } })
    : Promise.resolve({ members: [] as DirectoryMember[], total: 0 }))

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
      <h1 class="text-2xl font-bold">Miembros</h1>
      <p class="text-muted">Conocé a las personas de la comunidad y empezá una conversación.</p>
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" title="Iniciá sesión para ver el directorio de miembros" />
    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <UInput v-model="q" placeholder="Buscar por nombre…" icon="i-lucide-search" class="w-64" />
        <UTabs v-model="role" :items="roleTabs" :content="false" size="sm" />
        <span class="text-sm text-muted">{{ data?.total ?? 0 }} miembro{{ (data?.total ?? 0) === 1 ? '' : 's' }}</span>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <UCard v-for="m in data?.members || []" :key="m.id">
          <div class="flex items-start gap-3">
            <span class="relative shrink-0">
              <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" size="lg" />
              <span v-if="m.online" class="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-neutral-900" title="En línea" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <NuxtLink :to="`/profile/${m.slug}`" class="font-bold hover:underline">{{ m.name }}</NuxtLink>
                <UBadge v-if="m.role === 'admin'" color="primary" variant="subtle" size="sm">Admin</UBadge>
                <UBadge v-if="m.online" color="success" variant="soft" size="sm">En línea</UBadge>
              </div>
              <p class="text-xs text-muted">
                Miembro desde {{ fmtDate(m.memberSince) }}<span v-if="!m.online && m.lastSeenAt"> · Activo {{ timeAgo(m.lastSeenAt) }}</span>
              </p>
              <p v-if="m.bio" class="mt-1 line-clamp-2 text-sm text-muted">{{ m.bio }}</p>
              <div class="mt-2 flex gap-2">
                <UButton :to="`/profile/${m.slug}`" size="xs" color="neutral" variant="soft" label="Ver perfil" />
                <UButton v-if="user && user.slug !== m.slug" :to="`/messages?with=${m.slug}`" size="xs" variant="soft" icon="i-lucide-message-circle" label="Mensaje" />
              </div>
            </div>
          </div>
        </UCard>
      </div>
      <UAlert v-if="!(data?.members?.length)" color="neutral" variant="soft" title="Sin resultados" description="Probá con otro nombre o filtro." />
    </template>
  </div>
</template>
