<script setup lang="ts">
// Administrar canales (consola) — Fase 16-F: crear y editar abren
// EL MISMO modal único de canal que el lateral y la página del
// canal (ChannelFormModal vía useChannelEditor, contra los mismos
// endpoints POST/PUT /api/admin/channels). El formulario básico que
// vivía en esta página se retiró: dos editores para lo mismo es la
// redundancia que Juan caza con capturas. La tabla muestra grupo,
// tipo de contenido, acceso, visibilidad, estado y seguidores.
definePageMeta({ layout: 'admin' })

interface Channel {
  id: number, slug: string, name: string, icon: string, description: string
  type: string, priceCents: number, contentType: 'post' | 'image', coverUrl: string
  visibility: 'public' | 'private' | 'secret', groupId: number | null
  archived: boolean, postPermission: string, following: boolean, hasAccess: boolean
  followerCount: number
}
interface Group { id: number, name: string, isDefault?: boolean, channels: Channel[] }

const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin')
const api = useApi()
const toast = useToast()
const { openCreate, openEdit } = useChannelEditor()
const { askDeleteChannel } = useChannelAdmin()
const adminChangedTick = useState('channel-admin-changed', () => 0)
const editorSavedTick = useState('channel-editor-saved', () => 0)

const { data, refresh } = await useAsyncData('admin-channels', () =>
  isAdmin.value ? api<{ groups: Group[] }>('/api/channels?includeArchived=1') : Promise.resolve({ groups: [] as Group[] }))
const all = computed(() => (data.value?.groups || []).flatMap(g => g.channels.map(c => ({ ...c, groupName: g.name }))))

// El modal guarda fuera de esta página: al cerrarse con éxito (el
// contador de guardados) o al eliminarse un canal desde el
// anfitrión, la tabla se refresca sin recargar.
watch([editorSavedTick, adminChangedTick], () => { void refresh() })

function editChannel(ch: Channel & { groupName: string }) {
  openEdit({
    id: ch.id, name: ch.name, description: ch.description || '', type: ch.type,
    priceCents: ch.priceCents || 0, contentType: ch.contentType || 'post',
    coverUrl: ch.coverUrl || '', visibility: ch.visibility || 'public',
    postPermission: ch.postPermission === 'staff' ? 'staff' : 'members',
    groupId: ch.groupId, archived: !!ch.archived,
  })
}

async function toggleArchived(ch: Channel & { groupName: string }) {
  try {
    await api(`/api/admin/channels/${ch.id}`, { method: 'PUT', body: { archived: !ch.archived } })
    await refresh()
    toast.add({ title: ch.archived ? 'Canal desarchivado' : 'Canal archivado', color: 'success' })
  }
  catch (e) {
    toast.add({ title: 'No se pudo cambiar el estado del canal', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

const typeLabel = (c: Channel) => c.type === 'paid' ? 'Pago' : c.type === 'private' ? 'Solo miembros' : 'Gratuito'
const visLabel = (c: Channel) => c.visibility === 'secret' ? 'Secreta' : c.visibility === 'private' ? 'Privada' : 'Pública'
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="text-xl font-bold">Canales</h2>
      <span class="flex-1" />
      <UButton v-if="isAdmin" icon="i-lucide-plus" label="Nuevo canal" @click="openCreate()" />
    </div>
    <UAlert
      v-if="!isAdmin" color="neutral" variant="soft" icon="i-lucide-eye"
      title="Vista de solo lectura"
      description="Los canales los crea y edita un administrador."
    />
    <p class="text-sm text-muted">
      Crear y editar un canal abre el mismo editor que usan el lateral y la página del canal:
      tipo de contenido (Publicación o Imagen), visibilidad (Pública, Privada o Secreta), acceso y precio, grupo y portada.
      Los canales archivados salen de la navegación de los miembros pero no se borran.
    </p>

    <UCard>
      <p v-if="!all.length" class="text-sm text-muted">Todavía no hay canales en esta comunidad.</p>
      <ul v-else class="divide-y divide-default">
        <li v-for="ch in all" :key="ch.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
          <UIcon :name="ch.icon" class="shrink-0 text-lg" />
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-medium">
              <span class="truncate"># {{ ch.name }}</span>
              <UBadge v-if="ch.archived" color="warning" variant="soft" size="sm">Archivado</UBadge>
            </p>
            <p class="truncate text-sm text-muted">{{ ch.description || 'Sin descripción' }}</p>
            <p class="mt-0.5 text-xs text-muted">
              Grupo: {{ ch.groupName }} · Contenido: {{ ch.contentType === 'image' ? 'Imagen' : 'Publicación' }}
              · Acceso: {{ typeLabel(ch) }}<template v-if="ch.type === 'paid'"> ({{ ch.priceCents / 100 }})</template>
              · Visibilidad: {{ visLabel(ch) }} · Seguidores: {{ ch.followerCount }}
            </p>
          </div>
          <template v-if="isAdmin">
            <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-archive" :label="ch.archived ? 'Desarchivar' : 'Archivar'" @click="toggleArchived(ch)" />
            <UButton size="xs" icon="i-lucide-pencil" label="Editar" @click="editChannel(ch)" />
            <UButton size="xs" color="error" variant="soft" icon="i-lucide-trash-2" label="Borrar" @click="askDeleteChannel({ id: ch.id, slug: ch.slug, name: ch.name })" />
          </template>
        </li>
      </ul>
    </UCard>
  </div>
</template>
