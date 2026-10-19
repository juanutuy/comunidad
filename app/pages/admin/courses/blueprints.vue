<script setup lang="ts">
// Cursos → Certificados (Fase 16): los diseños reutilizables de
// certificado (blueprints), como Course tools → Certificate
// Blueprints de la referencia. Un diseño se crea una vez y se
// adjunta a cualquier curso desde el estudio (Settings → Diseño del
// certificado). Editar un diseño NO cambia los certificados ya
// emitidos: cada emisión guarda su propia foto del diseño.
// Acceso: admin y encargado de cursos.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const coursesMenuItems = useCoursesMenuItems()
const api = useApi()
const toast = useToast()

interface Blueprint {
  id: number, name: string, accentColor: string, headingText: string, bodyText: string
  signerName: string, signerTitle: string, showLogo: boolean, active: boolean
  coursesUsing: number, certificatesIssued: number, createdAt: string, updatedAt: string
}
const canUse = computed(() => ['admin', 'course_manager'].includes(user.value?.role || ''))
const { data, refresh } = await useAsyncData('admin-blueprints', () =>
  canUse.value ? api<{ blueprints: Blueprint[] }>('/api/admin/certificate-blueprints') : Promise.resolve({ blueprints: [] as Blueprint[] }))

const form = reactive({ name: '', accentColor: '#2563eb', headingText: 'Certificado de finalización', bodyText: 'por haber completado satisfactoriamente el curso {curso}.', signerName: '', signerTitle: '', showLogo: false })
const editing = ref<Blueprint | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

function openCreate() {
  editing.value = null
  Object.assign(form, { name: '', accentColor: tenant.value?.brandColor || '#2563eb', headingText: 'Certificado de finalización', bodyText: 'por haber completado satisfactoriamente el curso {curso}.', signerName: '', signerTitle: '', showLogo: false })
  modalOpen.value = true
}
function openEdit(b: Blueprint) {
  editing.value = b
  Object.assign(form, {
    name: b.name, accentColor: b.accentColor, headingText: b.headingText, bodyText: b.bodyText,
    signerName: b.signerName, signerTitle: b.signerTitle, showLogo: b.showLogo,
  })
  modalOpen.value = true
}
async function save() {
  saving.value = true
  try {
    if (editing.value) await api(`/api/admin/certificate-blueprints/${editing.value.id}`, { method: 'PUT', body: { ...form } })
    else await api('/api/admin/certificate-blueprints', { method: 'POST', body: { ...form } })
    toast.add({ title: editing.value ? 'Diseño actualizado' : 'Diseño creado', description: 'Los certificados ya emitidos no cambian: cada emisión guarda su foto del diseño.', color: 'success' })
    modalOpen.value = false
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar el diseño', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { saving.value = false }
}
async function toggleActive(b: Blueprint) {
  try {
    await api(`/api/admin/certificate-blueprints/${b.id}`, { method: 'PUT', body: { active: !b.active } })
    toast.add({ title: b.active ? 'Diseño desactivado' : 'Diseño activado', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo cambiar el estado', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}
const toDelete = ref<Blueprint | null>(null)
const deleting = ref(false)
async function deleteBlueprint() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await api(`/api/admin/certificate-blueprints/${toDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Diseño eliminado', color: 'success' })
    toDelete.value = null
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo eliminar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { deleting.value = false }
}

// Vista previa del formulario (con datos de ejemplo): así se verá el
// certificado al emitirse con este diseño.
const previewBody = computed(() => form.bodyText
  .replaceAll('{nombre}', 'María Ejemplo')
  .replaceAll('{curso}', 'Nombre del curso')
  .replaceAll('{fecha}', '19 de octubre de 2026'))
const previewHeading = computed(() => form.headingText
  .replaceAll('{nombre}', 'María Ejemplo')
  .replaceAll('{curso}', 'Nombre del curso')
  .replaceAll('{fecha}', '19 de octubre de 2026'))
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Cursos</h1>
      <p class="text-muted">Diseños de certificado reutilizables para los cursos de {{ tenant?.name }}.</p>
    </div>
    <UAlert v-if="!user" color="warning" variant="soft" icon="i-lucide-lock" title="Iniciá sesión" description="Necesitás una cuenta del equipo para gestionar los diseños." />
    <UAlert v-else-if="!canUse" color="error" variant="soft" icon="i-lucide-shield-alert" title="Sin acceso" description="Esta sección es para administradores y encargados de cursos." />
    <template v-else>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
      <AdminSubMenu :items="coursesMenuItems" />
      <div class="min-w-0 flex-1 space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Diseños de certificado</h2>
          <p class="max-w-2xl text-sm text-muted">Diseñá un certificado una vez y adjuntalo a cualquier curso desde su estudio. Sin diseño elegido, el curso usa el diseño por defecto del sistema. Los textos aceptan los marcadores <code>{nombre}</code>, <code>{curso}</code> y <code>{fecha}</code>.</p>
        </div>
        <UButton label="Nuevo diseño" icon="i-lucide-plus" @click="openCreate" />
      </div>

      <UCard>
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-search-check" class="mt-0.5 text-xl text-primary" />
          <div>
            <p class="font-semibold">Verificación pública de certificados</p>
            <p class="mt-1 text-sm text-muted">
              Cualquier persona puede verificar un certificado con su código en
              <NuxtLink to="/verify" class="text-primary hover:underline">/verify</NuxtLink>:
              se muestran el nombre del miembro, el curso y la fecha — sin correos ni otros datos.
            </p>
          </div>
        </div>
      </UCard>

      <div class="grid gap-4 sm:grid-cols-2">
        <UCard v-for="b in data?.blueprints || []" :key="b.id">
          <div class="mb-3 rounded-lg border-4 border-double p-4 text-center" :style="{ borderColor: b.accentColor }">
            <p class="text-[11px] font-bold tracking-[0.25em] uppercase" :style="{ color: b.accentColor }">{{ b.headingText }}</p>
            <p class="mt-2 font-serif text-lg font-bold">Nombre del miembro</p>
            <p class="mt-1 line-clamp-2 text-xs text-muted">{{ b.bodyText.replaceAll('{nombre}', 'Nombre del miembro').replaceAll('{curso}', 'Nombre del curso').replaceAll('{fecha}', 'la fecha de finalización') }}</p>
            <p v-if="b.signerName" class="mt-2 text-xs font-medium">{{ b.signerName }}<span v-if="b.signerTitle"> · {{ b.signerTitle }}</span></p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge :color="b.active ? 'success' : 'neutral'" variant="subtle">{{ b.active ? 'Activo' : 'Desactivado' }}</UBadge>
            <UBadge color="neutral" variant="subtle">{{ b.coursesUsing }} cursos</UBadge>
            <UBadge color="neutral" variant="subtle">{{ b.certificatesIssued }} emitidos</UBadge>
            <UBadge v-if="b.showLogo" color="neutral" variant="subtle" icon="i-lucide-image">Con logo</UBadge>
          </div>
          <p class="mt-2 font-semibold">{{ b.name }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton label="Editar" size="sm" icon="i-lucide-pencil" @click="openEdit(b)" />
            <UButton :label="b.active ? 'Desactivar' : 'Activar'" size="sm" color="neutral" variant="soft" :icon="b.active ? 'i-lucide-eye-off' : 'i-lucide-eye'" @click="toggleActive(b)" />
            <UButton label="Eliminar" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="toDelete = b" />
          </div>
        </UCard>
      </div>
      <UAlert v-if="!(data?.blueprints?.length)" color="neutral" variant="soft" title="Todavía no hay diseños" description="Creá el primero con «Nuevo diseño». Mientras tanto, los cursos emiten con el diseño por defecto del sistema." />

      <UModal v-model:open="modalOpen" :title="editing ? 'Editar diseño' : 'Nuevo diseño de certificado'">
        <template #body>
          <div class="grid gap-5 lg:grid-cols-2">
            <div class="space-y-3">
              <UFormField label="Nombre del diseño" required hint="Interno: es como se elige en el estudio del curso.">
                <UInput v-model="form.name" placeholder="Ej.: Diseño oficial 2026" class="w-full" />
              </UFormField>
              <UFormField label="Color de acento" hint="Borde, encabezado y detalles del certificado.">
                <div class="flex items-center gap-2">
                  <input v-model="form.accentColor" type="color" class="h-9 w-12 cursor-pointer rounded border border-default bg-transparent">
                  <UInput v-model="form.accentColor" class="w-28" />
                </div>
              </UFormField>
              <UFormField label="Texto de encabezado">
                <UInput v-model="form.headingText" class="w-full" />
              </UFormField>
              <UFormField label="Texto del cuerpo" hint="Se muestra bajo el nombre del miembro. Marcadores: {nombre}, {curso}, {fecha}.">
                <UTextarea v-model="form.bodyText" :rows="3" class="w-full" />
              </UFormField>
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="Nombre del firmante">
                  <UInput v-model="form.signerName" placeholder="Ej.: Valeria Ríos" class="w-full" />
                </UFormField>
                <UFormField label="Cargo del firmante">
                  <UInput v-model="form.signerTitle" placeholder="Ej.: Directora académica" class="w-full" />
                </UFormField>
              </div>
              <UFormField label="Mostrar el logo de la comunidad">
                <div class="flex items-center gap-2">
                  <USwitch v-model="form.showLogo" />
                  <span class="text-sm text-muted">Usa el icono o el logo cargado en los ajustes de la comunidad.</span>
                </div>
              </UFormField>
            </div>
            <div>
              <p class="mb-2 text-sm font-semibold">Vista previa</p>
              <div class="rounded-lg border-4 border-double bg-white p-5 text-center text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50" :style="{ borderColor: form.accentColor }">
                <UIcon name="i-lucide-award" class="mx-auto text-4xl" :style="{ color: form.accentColor }" />
                <p class="mt-3 text-[11px] font-bold tracking-[0.25em] uppercase" :style="{ color: form.accentColor }">{{ previewHeading }}</p>
                <p class="mt-4 text-xs text-muted">Se otorga a</p>
                <p class="mt-1 font-serif text-2xl font-bold">María Ejemplo</p>
                <p class="mt-3 text-sm">{{ previewBody }}</p>
                <div v-if="form.signerName" class="mx-auto mt-5 max-w-48">
                  <div class="border-t border-neutral-400 pt-1">
                    <p class="text-sm font-semibold">{{ form.signerName }}</p>
                    <p v-if="form.signerTitle" class="text-xs text-muted">{{ form.signerTitle }}</p>
                  </div>
                </div>
                <p class="mt-4 text-[11px] text-muted">{{ tenant?.name }} · Código de verificación: CERT-XXXXX-XXXXX</p>
              </div>
              <p class="mt-2 text-xs text-muted">Vista previa con datos de ejemplo; el certificado real se emite al completar un curso.</p>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" color="neutral" variant="soft" @click="modalOpen = false" />
            <UButton :label="editing ? 'Guardar cambios' : 'Crear diseño'" icon="i-lucide-save" :loading="saving" :disabled="!form.name.trim()" @click="save" />
          </div>
        </template>
      </UModal>

      <UModal :open="!!toDelete" title="Eliminar diseño" :description="toDelete ? `Se elimina el diseño «${toDelete.name}». Los cursos que lo tenían elegido vuelven al diseño por defecto del sistema. Si ya se emitieron certificados con él, primero hay que desactivarlo: el servidor lo impide.` : ''" @update:open="(v: boolean) => { if (!v) toDelete = null }">
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
            <UButton color="error" label="Sí, eliminar" icon="i-lucide-trash-2" :loading="deleting" @click="deleteBlueprint" />
          </div>
        </template>
      </UModal>
      </div>
      </div>
    </template>
  </div>
</template>
