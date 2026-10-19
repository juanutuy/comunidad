<script setup lang="ts">
// Gestión de eventos (solo admin, Fase 5): crear, editar y borrar.
// Los eventos aparecen en el calendario/lista pública y usan el
// RSVP existente; aquí se ve cuántos confirmaron asistencia.
const { user, tenant } = useAuth()
const { fmtDateTime } = useFormat()
const api = useApi()
const toast = useToast()

interface EventRow { id: number, slug: string, title: string, description: string, startsAt: string, endsAt: string, location: string, category: string, agenda: string, attendees: number }
const { data, refresh } = await useAsyncData('admin-events', () =>
  user.value?.role === 'admin' ? api<{ events: EventRow[] }>('/api/admin/events') : Promise.resolve({ events: [] as EventRow[] }))

const form = reactive({ title: '', description: '', startsAt: '', endsAt: '', location: 'En línea', category: 'General', agenda: '' })
const editing = ref<EventRow | null>(null)
const saving = ref(false)

function localInput(iso: string) { return iso ? iso.slice(0, 16) : '' }
function startEdit(e: EventRow) {
  editing.value = e
  form.title = e.title
  form.description = e.description
  form.startsAt = localInput(e.startsAt)
  form.endsAt = localInput(e.endsAt)
  form.location = e.location
  form.category = e.category
  form.agenda = e.agenda || ''
}
function resetForm() {
  editing.value = null
  form.title = ''; form.description = ''; form.startsAt = ''; form.endsAt = ''; form.location = 'En línea'; form.category = 'General'; form.agenda = ''
}
async function save() {
  saving.value = true
  try {
    const body = {
      title: form.title, description: form.description, location: form.location, category: form.category, agenda: form.agenda,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : '',
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : '',
    }
    if (editing.value) {
      await api(`/api/admin/events/${editing.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Evento actualizado', color: 'success' })
    }
    else {
      await api('/api/admin/events', { method: 'POST', body })
      toast.add({ title: 'Evento creado', description: 'Ya aparece en el calendario de la comunidad.', color: 'success' })
    }
    resetForm()
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar el evento', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { saving.value = false }
}

const toDelete = ref<EventRow | null>(null)
async function confirmDelete() {
  if (!toDelete.value) return
  try {
    await api(`/api/admin/events/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Evento eliminado', color: 'success' })
    toDelete.value = null
    await refresh()
  }
  catch { toast.add({ title: 'No se pudo eliminar', color: 'error' }) }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Eventos</h1>
      <p class="text-muted">Creá y editá los encuentros de {{ tenant?.name }}.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <AdminNav />
      <UCard>
        <template #header>
          <h2 class="font-bold">{{ editing ? `Editar: ${editing.title}` : 'Nuevo evento' }}</h2>
        </template>
        <div class="space-y-4">
          <UFormField label="Título">
            <UInput v-model="form.title" class="w-full" placeholder="Nombre del evento" />
          </UFormField>
          <UFormField label="Descripción">
            <UTextarea v-model="form.description" :rows="3" class="w-full" />
          </UFormField>
          <UFormField label="Agenda por sesiones" description="Una sesión por línea, en formato libre. Ej.: «10:00 — Bienvenida y presentación», «10:20 — Charla: primeros pasos». Se muestra como lista en el detalle del evento.">
            <UTextarea v-model="form.agenda" :rows="4" class="w-full" placeholder="10:00 — Bienvenida&#10;10:20 — Sesión principal&#10;11:15 — Preguntas y cierre" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Inicio">
              <UInput v-model="form.startsAt" type="datetime-local" class="w-full" />
            </UFormField>
            <UFormField label="Fin" description="Si queda vacío o anterior al inicio, se asume 1 hora de duración.">
              <UInput v-model="form.endsAt" type="datetime-local" class="w-full" />
            </UFormField>
            <UFormField label="Lugar">
              <UInput v-model="form.location" class="w-full" placeholder="En línea · sala de la comunidad" />
            </UFormField>
            <UFormField label="Categoría">
              <UInput v-model="form.category" class="w-full" placeholder="General, Taller, En vivo…" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2">
            <UButton v-if="editing" color="neutral" variant="ghost" label="Cancelar edición" @click="resetForm" />
            <UButton :label="editing ? 'Guardar cambios' : 'Crear evento'" icon="i-lucide-save" :loading="saving" :disabled="!form.title.trim() || !form.startsAt" @click="save" />
          </div>
        </div>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="e in data?.events || []" :key="e.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/events/${e.slug}`" class="font-medium hover:underline">{{ e.title }}</NuxtLink>
              <p class="text-xs text-muted">{{ fmtDateTime(e.startsAt) }} · {{ e.location }} · {{ e.category }}</p>
            </div>
            <UBadge color="neutral" variant="subtle" icon="i-lucide-users">{{ e.attendees }} confirmados</UBadge>
            <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-pen-line" label="Editar" @click="startEdit(e)" />
            <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="toDelete = e" />
          </li>
        </ul>
      </UCard>
      <UAlert v-if="!(data?.events?.length)" color="neutral" variant="soft" title="Todavía no hay eventos" description="Creá el primero con el formulario de arriba." />
    </template>

    <UModal :open="!!toDelete" title="Eliminar evento" :description="`Se va a eliminar «${toDelete?.title}» junto con las confirmaciones de asistencia. Esta acción no se puede deshacer.`" @update:open="(v: boolean) => { if (!v) toDelete = null }">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
          <UButton color="error" label="Sí, eliminar" icon="i-lucide-trash-2" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
