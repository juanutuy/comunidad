<script setup lang="ts">
// Mis borradores y programados (Fase 5): solo los ve el autor.
// Acciones: publicar ahora, editar título/cuerpo (y la hora si es
// programado) y borrar.
interface DraftView {
  id: number
  slug: string
  title: string
  body: string
  kind: string
  status: string
  scheduledAt: string
  createdAt: string
  channel: { slug: string, name: string }
  options: string[]
}

const { user } = useAuth()
const { fmtDateTime } = useFormat()
const api = useApi()
const toast = useToast()

const { data, refresh } = await useAsyncData('my-drafts', () =>
  user.value ? api<{ drafts: DraftView[] }>('/api/drafts') : Promise.resolve({ drafts: [] as DraftView[] }))

const editing = ref<DraftView | null>(null)
const editForm = reactive({ title: '', body: '', scheduledAt: '' })
const saving = ref(false)
function startEdit(d: DraftView) {
  editing.value = d
  editForm.title = d.title
  editForm.body = d.body
  editForm.scheduledAt = d.scheduledAt ? d.scheduledAt.slice(0, 16) : ''
}
async function saveEdit() {
  if (!editing.value) return
  saving.value = true
  try {
    const body: Record<string, unknown> = { title: editForm.title, body: editForm.body }
    if (editing.value.status === 'scheduled') body.scheduledAt = new Date(editForm.scheduledAt).toISOString()
    await api(`/api/posts/${editing.value.id}`, { method: 'PUT', body })
    toast.add({ title: 'Borrador actualizado', color: 'success' })
    editing.value = null
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { saving.value = false }
}

async function publishNow(d: DraftView) {
  try {
    await api(`/api/posts/${d.id}/publish`, { method: 'POST' })
    toast.add({ title: 'Publicado', description: 'Tu publicación ya se ve en el canal.', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo publicar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

const toDelete = ref<DraftView | null>(null)
async function deleteDraft() {
  if (!toDelete.value) return
  try {
    await api(`/api/posts/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Borrador eliminado', color: 'success' })
    toDelete.value = null
    await refresh()
  }
  catch { toast.add({ title: 'No se pudo eliminar', color: 'error' }) }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Mis borradores</h1>
      <p class="text-muted">Tus publicaciones guardadas y programadas. Solo vos las ves.</p>
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" title="Iniciá sesión para ver tus borradores" />
    <template v-else>
      <UCard v-for="d in data?.drafts || []" :key="d.id">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <UBadge :color="d.status === 'draft' ? 'neutral' : 'warning'" variant="soft" :icon="d.status === 'draft' ? 'i-lucide-file-edit' : 'i-lucide-calendar-clock'">
            {{ d.status === 'draft' ? 'Borrador' : 'Programado' }}
          </UBadge>
          <UBadge v-if="d.kind === 'poll'" color="primary" variant="subtle" icon="i-lucide-bar-chart-3">Encuesta</UBadge>
          <span class="text-muted">en {{ d.channel.name }}</span>
          <span v-if="d.status === 'scheduled'" class="text-muted">· se publica el {{ fmtDateTime(d.scheduledAt) }}</span>
        </div>
        <h2 class="mt-2 font-bold">{{ d.title }}</h2>
        <p class="mt-1 line-clamp-2 text-sm text-muted">{{ d.body }}</p>
        <ul v-if="d.options.length" class="mt-2 list-inside list-disc text-sm text-muted">
          <li v-for="o in d.options" :key="o">{{ o }}</li>
        </ul>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton size="sm" label="Publicar ahora" icon="i-lucide-send" @click="publishNow(d)" />
          <UButton size="sm" color="neutral" variant="soft" label="Editar" icon="i-lucide-pen-line" @click="startEdit(d)" />
          <UButton size="sm" color="error" variant="ghost" label="Borrar" icon="i-lucide-trash-2" @click="toDelete = d" />
        </div>
      </UCard>
      <UAlert v-if="!(data?.drafts?.length)" color="neutral" variant="soft" title="No tenés borradores ni programados" description="Desde el compositor del feed podés guardar un borrador o programar una publicación para más tarde." />
    </template>

    <UModal :open="!!editing" :title="editing?.status === 'scheduled' ? 'Editar publicación programada' : 'Editar borrador'" @update:open="(v: boolean) => { if (!v) editing = null }">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Título">
            <UInput v-model="editForm.title" class="w-full" />
          </UFormField>
          <UFormField :label="editing?.kind === 'poll' ? 'Pregunta' : 'Contenido'">
            <UTextarea v-model="editForm.body" :rows="5" class="w-full" />
          </UFormField>
          <UFormField v-if="editing?.status === 'scheduled'" label="Fecha y hora de publicación">
            <UInput v-model="editForm.scheduledAt" type="datetime-local" />
          </UFormField>
          <p v-if="editing?.kind === 'poll'" class="text-xs text-muted">Las opciones de la encuesta no se editan desde acá: borrá el borrador y creala de nuevo si necesitás cambiarlas.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="editing = null" />
          <UButton label="Guardar cambios" icon="i-lucide-save" :loading="saving" :disabled="!editForm.body.trim()" @click="saveEdit" />
        </div>
      </template>
    </UModal>

    <UModal :open="!!toDelete" title="Borrar borrador" description="Esta acción no se puede deshacer." @update:open="(v: boolean) => { if (!v) toDelete = null }">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
          <UButton color="error" label="Sí, borrar" icon="i-lucide-trash-2" @click="deleteDraft" />
        </div>
      </template>
    </UModal>
  </div>
</template>
