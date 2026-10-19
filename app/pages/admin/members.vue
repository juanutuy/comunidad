<script setup lang="ts">
// Gestión de miembros (solo admin): rol y membresía de cada persona.
const { user, tenant } = useAuth()
const api = useApi()
const toast = useToast()
const { fmtDate, initials } = useFormat()

interface MemberRow { id: number, name: string, slug: string, email: string, avatarUrl: string, role: string, memberSince: string, points: number, level: string }
const { data, refresh } = await useAsyncData('admin-members', () =>
  user.value?.role === 'admin' ? api<{ members: MemberRow[] }>('/api/admin/members') : Promise.resolve({ members: [] as MemberRow[] }))

const roleOptions = [
  { label: 'Miembro', value: 'member' },
  { label: 'Administrador', value: 'admin' },
]

async function changeRole(m: MemberRow, role: string) {
  try {
    const res = await api<{ self: boolean }>(`/api/admin/members/${m.id}/role`, { method: 'POST', body: { role } })
    toast.add({ title: `Rol de ${m.name} actualizado`, color: 'success' })
    if (res.self) window.location.reload()
    else await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo cambiar el rol', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
    await refresh()
  }
}

const toRemove = ref<MemberRow | null>(null)
const removing = ref(false)
async function removeMember() {
  if (!toRemove.value) return
  removing.value = true
  try {
    const res = await api<{ self: boolean }>(`/api/admin/members/${toRemove.value.id}/remove`, { method: 'POST' })
    toast.add({ title: 'Membresía quitada', color: 'success' })
    toRemove.value = null
    if (res.self) window.location.href = '/feeds'
    else await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo quitar la membresía', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { removing.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Miembros</h1>
      <p class="text-muted">Personas con membresía en {{ tenant?.name }}: roles y acceso.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Tu cuenta no tiene rol de administrador en esta comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <div class="flex flex-wrap gap-2">
        <AdminNav />
      </div>
      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="m in data?.members || []" :key="m.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" />
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/profile/${m.slug}`" class="font-semibold hover:underline">{{ m.name }}</NuxtLink>
              <p class="truncate text-xs text-muted">{{ m.email }} · miembro desde {{ fmtDate(m.memberSince) }} · {{ m.points }} pts · Nivel {{ m.level }}</p>
            </div>
            <USelect :model-value="m.role" :items="roleOptions" size="sm" class="w-36" @update:model-value="(v: string) => changeRole(m, v)" />
            <UButton color="error" variant="ghost" size="sm" icon="i-lucide-user-x" label="Quitar" @click="toRemove = m" />
          </li>
        </ul>
      </UCard>

      <UModal :open="!!toRemove" title="Quitar membresía" :description="toRemove ? `${toRemove.name} dejará de ser miembro de esta comunidad. Su cuenta y su contenido no se borran.` : ''" @update:open="(v: boolean) => { if (!v) toRemove = null }">
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="toRemove = null" />
            <UButton color="error" label="Sí, quitar membresía" icon="i-lucide-user-x" :loading="removing" @click="removeMember" />
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
