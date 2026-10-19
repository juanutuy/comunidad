<script setup lang="ts">
// Catálogo de cursos del admin (Fase 8). Vive en courses/index.vue
// A PROPÓSITO: como courses.vue sería el padre de [id]/edit y, sin
// <NuxtPage />, taparía la página-estudio (mismo bug que el visor).
// La edición vive en la
// página-estudio (/admin/courses/[id]/edit): currículum por
// arrastre, drip, inscritos y settings con autoguardado. Acá solo se
// crea (nace en borrador y se abre el estudio), se entra y se borra.
definePageMeta({ layout: 'admin' })
const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin')
const api = useApi()
const toast = useToast()
const { fmtMoney } = useFormat()

interface AdminLesson { id: number, title: string, kind: string, status: string, content: string, videoUrl: string, durationMin: number, isFree: boolean, sort: number }
interface AdminChapter { id: number, title: string, sort: number, lessons: AdminLesson[] }
interface AdminCourse {
  id: number, slug: string, title: string, description: string, level: string, priceCents: number,
  status: string, imageUrl: string, enrolled: number, visibility: string, dripMode: string,
  certificateEnabled: boolean, chapters: AdminChapter[],
}

const { data, refresh } = await useAsyncData('admin-courses', () =>
  isAdmin.value ? api<{ courses: AdminCourse[] }>('/api/admin/courses') : Promise.resolve({ courses: [] as AdminCourse[] }))

const showCreate = ref(false)
const creating = ref(false)
const newTitle = ref('')
async function createCourse() {
  const title = newTitle.value.trim()
  if (!title) return
  creating.value = true
  try {
    // Nace en borrador; el resto se completa en el estudio.
    const res = await api<{ id: number, slug: string }>('/api/admin/courses', {
      method: 'POST',
      body: { title, description: '', level: 'Principiante', priceCents: 0, status: 'draft', imageUrl: '' },
    })
    showCreate.value = false
    newTitle.value = ''
    await navigateTo(`/admin/courses/${res.id}/edit`)
  }
  catch (e) {
    toast.add({ title: 'No se pudo crear el curso', description: (e as { data?: { message?: string } }).data?.message || 'Intentá de nuevo.', color: 'error' })
  }
  finally { creating.value = false }
}

const toDelete = ref<AdminCourse | null>(null)
async function confirmDelete() {
  if (!toDelete.value) return
  try {
    await api(`/api/admin/courses/${toDelete.value.id}`, { method: 'DELETE' })
    toDelete.value = null
    toast.add({ title: 'Curso eliminado', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo eliminar', description: (e as { data?: { message?: string } }).data?.message || 'Intentá de nuevo.', color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-5">
    <h1 class="text-2xl font-bold">Administración</h1>
    <UAlert v-if="!user" color="warning" variant="soft" icon="i-lucide-lock" title="Iniciá sesión" description="Necesitás una cuenta de administrador para gestionar los cursos.">
      <template #actions><UButton to="/" label="Ir al inicio" size="sm" /></template>
    </UAlert>
    <UAlert v-else-if="!isAdmin" color="error" variant="soft" icon="i-lucide-shield-alert" title="Sin acceso" description="Esta sección es solo para administradores de la comunidad." />

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Cursos</h2>
          <p class="text-sm text-muted">Cada curso se edita en su estudio: currículum, drip, inscritos y ajustes, con autoguardado.</p>
        </div>
        <UButton label="Nuevo curso" icon="i-lucide-plus" @click="showCreate = true" />
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <UCard v-for="c in data?.courses || []" :key="c.id">
          <img v-if="c.imageUrl" :src="c.imageUrl" alt="" class="mb-3 h-32 w-full rounded-lg object-cover">
          <div class="flex flex-wrap items-center gap-1.5">
            <UBadge :color="c.status === 'published' ? 'success' : 'warning'" variant="subtle">{{ c.status === 'published' ? 'Publicado' : 'Borrador' }}</UBadge>
            <UBadge v-if="c.visibility === 'private'" color="neutral" variant="subtle" icon="i-lucide-lock">Privado</UBadge>
            <UBadge v-if="c.visibility === 'secret'" color="neutral" variant="subtle" icon="i-lucide-eye-off">Secreto</UBadge>
            <UBadge color="primary" variant="subtle">{{ c.level }}</UBadge>
            <UBadge :color="c.priceCents ? 'warning' : 'success'" variant="subtle">{{ fmtMoney(c.priceCents) }}</UBadge>
            <UBadge v-if="!c.certificateEnabled" color="neutral" variant="subtle" icon="i-lucide-award">Sin certificado</UBadge>
          </div>
          <p class="mt-2 text-lg font-bold leading-snug">{{ c.title }}</p>
          <p v-if="c.description" class="mt-1 line-clamp-2 text-sm text-muted">{{ c.description }}</p>
          <p class="mt-2 text-xs text-muted">
            {{ c.chapters.length }} capítulos · {{ c.chapters.reduce((n, ch) => n + ch.lessons.length, 0) }} lecciones · {{ c.enrolled }} inscritos
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <UButton :to="`/admin/courses/${c.id}/edit`" label="Abrir estudio" size="sm" icon="i-lucide-pen-line" />
            <UButton :to="`/courses/${c.slug}`" label="Ver" size="sm" color="neutral" variant="soft" icon="i-lucide-eye" />
            <UButton label="Eliminar" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="toDelete = c" />
          </div>
        </UCard>
      </div>
      <UAlert v-if="!(data?.courses?.length)" color="neutral" variant="soft" title="Todavía no hay cursos" description="Creá el primero con «Nuevo curso»: nace en borrador y se completa en el estudio." />

      <UModal v-model:open="showCreate" title="Nuevo curso">
        <template #body>
          <UFormField label="Nombre del curso" required hint="Nace en borrador. El resto (descripción, currículum, precio) se completa en el estudio.">
            <UInput v-model="newTitle" placeholder="Ej.: Fotografía con el celular" class="w-full" @keyup.enter="createCourse" />
          </UFormField>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" color="neutral" variant="soft" @click="showCreate = false" />
            <UButton label="Crear y abrir el estudio" icon="i-lucide-plus" :loading="creating" :disabled="!newTitle.trim()" @click="createCourse" />
          </div>
        </template>
      </UModal>

      <UModal :open="!!toDelete" title="Eliminar curso" @update:open="v => { if (!v) toDelete = null }">
        <template #body>
          <p class="text-sm">¿Eliminar <strong>{{ toDelete?.title }}</strong>? Se borran sus capítulos, lecciones, inscripciones y el avance de los estudiantes. Esta acción no se puede deshacer.</p>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton label="Cancelar" color="neutral" variant="soft" @click="toDelete = null" />
            <UButton label="Eliminar" color="error" icon="i-lucide-trash-2" @click="confirmDelete" />
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
