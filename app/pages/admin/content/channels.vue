<script setup lang="ts">
// Contenido → Canales (Fase 16): la tabla de canales de la consola,
// con vistas Activos / Archivados, «quién puede publicar» por
// canal y archivar/desarchivar. La edición completa (nombre, tipo,
// precio, grupo) sigue viviendo en la gestión de Canales: desde acá
// se llega con «Editar». Acceso: solo admin.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const contentMenuItems = useContentMenuItems()
const { fmtMoney } = useFormat()
const api = useApi()
const toast = useToast()

interface ContentChannel {
  id: number, slug: string, name: string, icon: string, description: string, type: string, priceCents: number
  groupName: string, followers: number, postPermission: string, archived: boolean, archivedAt: string
}
const isAdmin = computed(() => user.value?.role === 'admin')
const { data, refresh } = await useAsyncData('admin-content-channels', () =>
  isAdmin.value ? api<{ channels: ContentChannel[] }>('/api/admin/content/channels') : Promise.resolve({ channels: [] as ContentChannel[] }))

const tab = ref<'active' | 'archived'>('active')
const visible = computed(() => (data.value?.channels || []).filter(c => tab.value === 'archived' ? c.archived : !c.archived))
const activeCount = computed(() => (data.value?.channels || []).filter(c => !c.archived).length)
const archivedCount = computed(() => (data.value?.channels || []).filter(c => c.archived).length)

const typeLabels: Record<string, string> = { free: 'Gratuito', private: 'Privado', paid: 'Pago' }
const permissionOptions = [
  { label: 'Los miembros', value: 'members' },
  { label: 'Solo el equipo', value: 'staff' },
]

async function putChannel(ch: ContentChannel, patch: Record<string, unknown>, okMessage: string) {
  try {
    await api(`/api/admin/channels/${ch.id}`, { method: 'PUT', body: patch })
    toast.add({ title: okMessage, color: 'success' })
    await refresh()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}
function setPermission(ch: ContentChannel, value: string) {
  void putChannel(ch, { postPermission: value }, value === 'staff' ? 'Ahora solo el equipo publica en este canal' : 'Ahora publican los miembros con acceso')
}
function toggleArchive(ch: ContentChannel) {
  void putChannel(ch, { archived: !ch.archived }, ch.archived ? 'Canal desarchivado' : 'Canal archivado: desaparece para los miembros y su contenido queda guardado')
}
async function copyId(ch: ContentChannel) {
  try {
    await navigator.clipboard.writeText(String(ch.id))
    toast.add({ title: 'ID copiado', description: `#${ch.id}`, color: 'success' })
  }
  catch { toast.add({ title: 'No se pudo copiar', color: 'warning' }) }
}

const toDelete = ref<ContentChannel | null>(null)
const deleting = ref(false)
async function deleteChannel() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await api(`/api/admin/channels/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Canal eliminado', color: 'success' })
    toDelete.value = null
    await refresh()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: 'No se pudo eliminar el canal', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { deleting.value = false }
}

function rowMenuItems(ch: ContentChannel) {
  const items: { label: string, icon: string, to?: string, onSelect?: () => void, color?: 'error' }[] = [
    { label: 'Ver', icon: 'i-lucide-eye', to: `/channels/${ch.slug}` },
    { label: 'Editar', icon: 'i-lucide-pencil', to: '/admin/channels' },
    { label: 'Copiar ID', icon: 'i-lucide-copy', onSelect: () => copyId(ch) },
    ch.archived
      ? { label: 'Desarchivar', icon: 'i-lucide-archive-restore', onSelect: () => toggleArchive(ch) }
      : { label: 'Archivar', icon: 'i-lucide-archive', onSelect: () => toggleArchive(ch) },
    { label: 'Eliminar', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { toDelete.value = ch } },
  ]
  return [items]
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Contenido</h1>
      <p class="text-muted">Los canales de {{ tenant?.name }}: acceso, quién puede publicar y archivo.</p>
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <UAlert v-else-if="!isAdmin" color="warning" variant="soft" title="Solo administradores" description="La gestión de canales de la consola es solo para administradores." />
    <template v-else>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
      <AdminSubMenu :items="contentMenuItems" />
      <div class="min-w-0 flex-1 space-y-5">
      <div class="flex flex-wrap gap-1.5">
        <UButton size="sm" :color="tab === 'active' ? 'primary' : 'neutral'" :variant="tab === 'active' ? 'soft' : 'ghost'" :label="`Activos · ${activeCount}`" @click="tab = 'active'" />
        <UButton size="sm" :color="tab === 'archived' ? 'primary' : 'neutral'" :variant="tab === 'archived' ? 'soft' : 'ghost'" :label="`Archivados · ${archivedCount}`" @click="tab = 'archived'" />
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs tracking-wider text-muted uppercase">
                <th class="px-4 py-3 font-semibold">Nombre</th>
                <th class="px-4 py-3 font-semibold">Tipo</th>
                <th class="px-4 py-3 text-right font-semibold">Seguidores</th>
                <th class="px-4 py-3 font-semibold">Acceso</th>
                <th class="px-4 py-3 font-semibold">Quién puede publicar</th>
                <th class="px-4 py-3 font-semibold">Grupo</th>
                <th class="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="ch in visible" :key="ch.id" class="border-b border-default/60 last:border-0 hover:bg-elevated/50">
                <td class="px-4 py-3">
                  <NuxtLink :to="`/channels/${ch.slug}`" class="flex items-center gap-2 font-medium hover:underline">
                    <UIcon :name="ch.icon" class="text-muted" /> {{ ch.name }}
                  </NuxtLink>
                  <UBadge v-if="ch.archived" color="neutral" variant="subtle" size="sm" class="mt-1">Archivado</UBadge>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">{{ typeLabels[ch.type] || ch.type }}</td>
                <td class="px-4 py-3 text-right">{{ ch.followers }}</td>
                <td class="px-4 py-3 whitespace-nowrap">
                  {{ ch.type === 'paid' ? `Pago · ${fmtMoney(ch.priceCents)}` : ch.type === 'private' ? 'Solo miembros' : 'Abierto' }}
                </td>
                <td class="px-4 py-3">
                  <USelect :model-value="ch.postPermission" :items="permissionOptions" size="sm" class="w-40" @update:model-value="(v: string) => setPermission(ch, v)" />
                </td>
                <td class="px-4 py-3 whitespace-nowrap">{{ ch.groupName || '—' }}</td>
                <td class="px-4 py-3 text-right">
                  <UDropdownMenu :items="rowMenuItems(ch)">
                    <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" aria-label="Acciones del canal" />
                  </UDropdownMenu>
                </td>
              </tr>
              <tr v-if="!visible.length">
                <td colspan="7" class="px-4 py-10 text-center text-muted">{{ tab === 'archived' ? 'No hay canales archivados.' : 'No hay canales activos.' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
      <p class="text-sm text-muted">Archivar un canal lo saca de la navegación, el feed, la búsqueda y el chat de los miembros. Sus publicaciones quedan guardadas y se recupera desarchivándolo.</p>

      <UModal :open="!!toDelete" title="Eliminar canal" :description="toDelete ? `Se elimina «${toDelete.name}» con TODAS sus publicaciones, comentarios, reacciones y accesos. Si solo querés ocultarlo, archivarlo conserva todo. No se puede deshacer.` : ''" @update:open="(v: boolean) => { if (!v) toDelete = null }">
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
            <UButton color="error" label="Sí, eliminar canal" icon="i-lucide-trash-2" :loading="deleting" @click="deleteChannel" />
          </div>
        </template>
      </UModal>
      </div>
      </div>
    </template>
  </div>
</template>
