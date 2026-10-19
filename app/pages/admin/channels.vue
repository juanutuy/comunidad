<script setup lang="ts">
// Gestión de canales (solo admin): crear, editar y borrar canales.
// Borrar un canal elimina también sus publicaciones y accesos (server).
const { user, tenant } = useAuth()
const api = useApi()
const toast = useToast()

interface ChannelRow { id: number, slug: string, name: string, icon?: string, description?: string, type: string, priceCents: number }
const { data, refresh } = await useAsyncData('admin-channels', () =>
  api<{ groups: { id: number, name: string, channels: ChannelRow[] }[] }>('/api/channels'))
const allChannels = computed(() => (data.value?.groups || []).flatMap(g => g.channels))
const groupOptions = computed(() => (data.value?.groups || []).map(g => ({ label: g.name, value: g.id })))

const typeOptions = [
  { label: 'Gratuito', value: 'free' },
  { label: 'Privado (solo miembros)', value: 'private' },
  { label: 'Pago', value: 'paid' },
]

async function sync() {
  await refresh()
  await refreshNuxtData('layout-channels')
  await refreshNuxtData('feed-channels')
}

// --- Crear ---
const form = reactive({ name: '', description: '', type: 'free', price: 0, groupId: 0 })
watchEffect(() => { if (!form.groupId && groupOptions.value.length) form.groupId = groupOptions.value[0]!.value })
const creating = ref(false)
async function create() {
  creating.value = true
  try {
    await api('/api/admin/channels', { method: 'POST', body: { name: form.name, description: form.description, type: form.type, priceCents: Math.round(form.price * 100), groupId: form.groupId } })
    form.name = ''; form.description = ''; form.price = 0; form.type = 'free'
    toast.add({ title: 'Canal creado', color: 'success' })
    await sync()
  }
  catch (e) {
    toast.add({ title: 'No se pudo crear el canal', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { creating.value = false }
}

// --- Editar ---
const editing = ref<ChannelRow | null>(null)
const editForm = reactive({ name: '', description: '', type: 'free', price: 0, groupId: 0 })
function openEdit(ch: ChannelRow, groupId: number) {
  editing.value = ch
  editForm.name = ch.name
  editForm.description = ch.description || ''
  editForm.type = ch.type
  editForm.price = (ch.priceCents || 0) / 100
  editForm.groupId = groupId
}
const savingEdit = ref(false)
async function saveEdit() {
  if (!editing.value) return
  savingEdit.value = true
  try {
    await api(`/api/admin/channels/${editing.value.id}`, { method: 'PUT', body: { name: editForm.name, description: editForm.description, type: editForm.type, priceCents: Math.round(editForm.price * 100), groupId: editForm.groupId } })
    toast.add({ title: 'Canal actualizado', color: 'success' })
    editing.value = null
    await sync()
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar el canal', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { savingEdit.value = false }
}

// --- Borrar ---
const toDelete = ref<ChannelRow | null>(null)
const deleting = ref(false)
async function deleteChannel() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await api(`/api/admin/channels/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Canal eliminado', color: 'success' })
    toDelete.value = null
    await sync()
  }
  catch (e) {
    toast.add({ title: 'No se pudo eliminar el canal', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { deleting.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Administrar canales</h1>
      <p class="text-muted">Creá, editá y borrá los canales de {{ tenant?.name }}.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Tu cuenta no tiene rol de administrador en esta comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <div class="flex flex-wrap gap-2">
        <UButton to="/admin" color="neutral" variant="soft" label="Ajustes" icon="i-lucide-settings" size="sm" />
        <UButton to="/admin/members" color="neutral" variant="soft" label="Miembros" icon="i-lucide-users" size="sm" />
        <UButton to="/admin/channels" color="primary" label="Canales" icon="i-lucide-hash" size="sm" />
      </div>

      <UCard>
        <h2 class="mb-3 font-semibold">Nuevo canal</h2>
        <div class="space-y-3">
          <UFormField label="Nombre">
            <UInput v-model="form.name" placeholder="Ej.: Proyectos de miembros" class="w-full" />
          </UFormField>
          <UFormField label="Descripción">
            <UTextarea v-model="form.description" :rows="2" class="w-full" />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="Grupo">
              <USelect v-model="form.groupId" :items="groupOptions" class="w-full" />
            </UFormField>
            <UFormField label="Tipo">
              <USelect v-model="form.type" :items="typeOptions" class="w-full" />
            </UFormField>
            <UFormField v-if="form.type === 'paid'" label="Precio (USD)">
              <UInput v-model.number="form.price" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
          </div>
          <div class="flex justify-end">
            <UButton label="Crear canal" icon="i-lucide-plus" :loading="creating" :disabled="!form.name.trim()" @click="create" />
          </div>
        </div>
      </UCard>

      <UCard>
        <h2 class="mb-3 font-semibold">Canales existentes ({{ allChannels.length }})</h2>
        <div v-for="g in data?.groups || []" :key="g.id" class="mb-4">
          <h3 class="mb-1 text-xs font-bold tracking-wider text-muted uppercase">{{ g.name }}</h3>
          <ul class="divide-y divide-default">
            <li v-for="ch in g.channels" :key="ch.id" class="flex flex-wrap items-center gap-2 py-2 text-sm">
              <NuxtLink :to="`/channels/${ch.slug}`" class="flex-1 font-medium hover:underline">{{ ch.name }}</NuxtLink>
              <UBadge color="neutral" variant="subtle">{{ ch.type === 'paid' ? `Pago $${(ch.priceCents / 100).toFixed(2)}` : ch.type === 'private' ? 'Privado' : 'Gratuito' }}</UBadge>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" label="Editar" @click="openEdit(ch, g.id)" />
              <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" label="Borrar" @click="toDelete = ch" />
            </li>
          </ul>
        </div>
      </UCard>

      <UModal :open="!!editing" title="Editar canal" @update:open="(v: boolean) => { if (!v) editing = null }">
        <template #body>
          <div class="space-y-3">
            <UFormField label="Nombre">
              <UInput v-model="editForm.name" class="w-full" />
            </UFormField>
            <UFormField label="Descripción">
              <UTextarea v-model="editForm.description" :rows="2" class="w-full" />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-3">
              <UFormField label="Grupo">
                <USelect v-model="editForm.groupId" :items="groupOptions" class="w-full" />
              </UFormField>
              <UFormField label="Tipo">
                <USelect v-model="editForm.type" :items="typeOptions" class="w-full" />
              </UFormField>
              <UFormField v-if="editForm.type === 'paid'" label="Precio (USD)">
                <UInput v-model.number="editForm.price" type="number" min="0" step="0.01" class="w-full" />
              </UFormField>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="editing = null" />
            <UButton label="Guardar cambios" icon="i-lucide-save" :loading="savingEdit" :disabled="!editForm.name.trim()" @click="saveEdit" />
          </div>
        </template>
      </UModal>

      <UModal :open="!!toDelete" title="Borrar canal" :description="toDelete ? `Se borra «${toDelete.name}» con TODAS sus publicaciones, comentarios, reacciones y accesos. No se puede deshacer.` : ''" @update:open="(v: boolean) => { if (!v) toDelete = null }">
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
            <UButton color="error" label="Sí, borrar canal" icon="i-lucide-trash-2" :loading="deleting" @click="deleteChannel" />
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
