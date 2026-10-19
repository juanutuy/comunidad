<script setup lang="ts">
// Gestión de cursos (solo admin, Fase 5): CRUD completo de cursos,
// capítulos y lecciones. El orden se controla con el campo «orden»
// (número menor = antes); las flechas lo ajustan sin teclear.
const { user, tenant } = useAuth()
const { fmtMoney } = useFormat()
const api = useApi()
const toast = useToast()

interface Lesson { id: number, title: string, content: string, videoUrl: string, durationMin: number, isFree: boolean, sort: number }
interface Chapter { id: number, title: string, sort: number, lessons: Lesson[] }
interface Course { id: number, slug: string, title: string, description: string, level: string, priceCents: number, status: string, imageUrl: string, enrolled: number, chapters: Chapter[] }

const { data, refresh } = await useAsyncData('admin-courses', () =>
  user.value?.role === 'admin' ? api<{ courses: Course[] }>('/api/admin/courses') : Promise.resolve({ courses: [] as Course[] }))
const courses = computed(() => data.value?.courses || [])

function errMsg(e: unknown) { return (e as { data?: { message?: string } }).data?.message || 'Intentá de nuevo.' }

// --- Curso ---
const courseForm = reactive({ title: '', description: '', level: 'Principiante', price: 0, status: 'published', imageUrl: '' })
const editingCourse = ref<Course | null>(null)
const savingCourse = ref(false)
function startEditCourse(c: Course) {
  editingCourse.value = c
  courseForm.title = c.title
  courseForm.description = c.description
  courseForm.level = c.level
  courseForm.price = c.priceCents / 100
  courseForm.status = c.status
  courseForm.imageUrl = c.imageUrl
}
function cancelCourse() { editingCourse.value = null }
async function saveCourse() {
  savingCourse.value = true
  try {
    const body = {
      title: courseForm.title, description: courseForm.description, level: courseForm.level,
      priceCents: Math.round(courseForm.price * 100), status: courseForm.status, imageUrl: courseForm.imageUrl,
    }
    if (editingCourse.value) {
      await api(`/api/admin/courses/${editingCourse.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Curso actualizado', color: 'success' })
    }
    else {
      await api('/api/admin/courses', { method: 'POST', body })
      toast.add({ title: 'Curso creado', color: 'success' })
      courseForm.title = ''; courseForm.description = ''; courseForm.price = 0; courseForm.status = 'published'; courseForm.imageUrl = ''
    }
    editingCourse.value = null
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo guardar el curso', description: errMsg(e), color: 'error' }) }
  finally { savingCourse.value = false }
}
const uploadingImage = ref(false)
async function onCourseImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingImage.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'image')
    const up = await api<{ url: string }>('/api/uploads', { method: 'POST', body: fd })
    courseForm.imageUrl = up.url
    toast.add({ title: 'Imagen subida', color: 'success' })
  }
  catch (err) { toast.add({ title: 'No se pudo subir la imagen', description: errMsg(err), color: 'error' }) }
  finally { uploadingImage.value = false }
}

const toDelete = ref<{ kind: string, id: number, label: string } | null>(null)
async function confirmDelete() {
  if (!toDelete.value) return
  const { kind, id } = toDelete.value
  try {
    if (kind === 'course') await api(`/api/admin/courses/${id}`, { method: 'DELETE' })
    else if (kind === 'chapter') await api(`/api/admin/chapters/${id}`, { method: 'DELETE' })
    else await api(`/api/admin/lessons/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Eliminado', color: 'success' })
    toDelete.value = null
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo eliminar', description: errMsg(e), color: 'error' }) }
}

// --- Capítulos y lecciones ---
const expanded = ref<Record<number, boolean>>({})
const newChapter = reactive<Record<number, string>>({})
async function addChapter(course: Course) {
  const title = (newChapter[course.id] || '').trim()
  if (!title) return
  try {
    await api(`/api/admin/courses/${course.id}/chapters`, { method: 'POST', body: { title } })
    newChapter[course.id] = ''
    expanded.value[course.id] = true
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo crear el capítulo', description: errMsg(e), color: 'error' }) }
}
async function moveChapter(course: Course, chapter: Chapter, dir: -1 | 1) {
  const idx = course.chapters.findIndex(c => c.id === chapter.id)
  const other = course.chapters[idx + dir]
  if (!other) return
  try {
    await api(`/api/admin/chapters/${chapter.id}`, { method: 'PUT', body: { title: chapter.title, sort: other.sort } })
    await api(`/api/admin/chapters/${other.id}`, { method: 'PUT', body: { title: other.title, sort: chapter.sort } })
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo reordenar', description: errMsg(e), color: 'error' }) }
}

const lessonForm = reactive({ title: '', content: '', videoUrl: '', durationMin: 10, isFree: false, sort: 1 })
const lessonTarget = ref<{ courseId: number, chapterId: number } | null>(null)
const editingLesson = ref<Lesson | null>(null)
const savingLesson = ref(false)
function startNewLesson(courseId: number, chapter: Chapter) {
  editingLesson.value = null
  lessonTarget.value = { courseId, chapterId: chapter.id }
  lessonForm.title = ''; lessonForm.content = ''; lessonForm.videoUrl = ''; lessonForm.durationMin = 10
  lessonForm.isFree = false; lessonForm.sort = (chapter.lessons.at(-1)?.sort || 0) + 1
}
function startEditLesson(courseId: number, chapter: Chapter, lesson: Lesson) {
  editingLesson.value = lesson
  lessonTarget.value = { courseId, chapterId: chapter.id }
  lessonForm.title = lesson.title; lessonForm.content = lesson.content; lessonForm.videoUrl = lesson.videoUrl
  lessonForm.durationMin = lesson.durationMin; lessonForm.isFree = lesson.isFree; lessonForm.sort = lesson.sort
}
async function saveLesson() {
  if (!lessonTarget.value) return
  savingLesson.value = true
  try {
    const body = { ...lessonForm }
    if (editingLesson.value) {
      await api(`/api/admin/lessons/${editingLesson.value.id}`, { method: 'PUT', body })
      toast.add({ title: 'Lección actualizada', color: 'success' })
    }
    else {
      await api(`/api/admin/chapters/${lessonTarget.value.chapterId}/lessons`, { method: 'POST', body })
      toast.add({ title: 'Lección agregada', color: 'success' })
    }
    lessonTarget.value = null
    editingLesson.value = null
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo guardar la lección', description: errMsg(e), color: 'error' }) }
  finally { savingLesson.value = false }
}
async function moveLesson(course: Course, chapter: Chapter, lesson: Lesson, dir: -1 | 1) {
  const idx = chapter.lessons.findIndex(l => l.id === lesson.id)
  const other = chapter.lessons[idx + dir]
  if (!other) return
  try {
    await api(`/api/admin/lessons/${lesson.id}`, { method: 'PUT', body: { title: lesson.title, content: lesson.content, videoUrl: lesson.videoUrl, durationMin: lesson.durationMin, isFree: lesson.isFree, sort: other.sort } })
    await api(`/api/admin/lessons/${other.id}`, { method: 'PUT', body: { title: other.title, content: other.content, videoUrl: other.videoUrl, durationMin: other.durationMin, isFree: other.isFree, sort: lesson.sort } })
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo reordenar', description: errMsg(e), color: 'error' }) }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Cursos</h1>
      <p class="text-muted">Creá y editá los cursos de {{ tenant?.name }}: datos, capítulos y lecciones.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <AdminNav />

      <UCard>
        <template #header>
          <h2 class="font-bold">{{ editingCourse ? `Editar: ${editingCourse.title}` : 'Nuevo curso' }}</h2>
        </template>
        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Título">
              <UInput v-model="courseForm.title" class="w-full" placeholder="Nombre del curso" />
            </UFormField>
            <UFormField label="Nivel">
              <USelect v-model="courseForm.level" :items="['Principiante', 'Intermedio', 'Avanzado', 'Todos los niveles']" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Descripción">
            <UTextarea v-model="courseForm.description" :rows="3" class="w-full" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Precio (0 = gratuito)" description="En la moneda de la comunidad; un curso pago se compra con el flujo de pagos.">
              <UInput v-model="courseForm.price" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
            <UFormField label="Estado">
              <USelect v-model="courseForm.status" :items="[{ label: 'Publicado', value: 'published' }, { label: 'Borrador (oculto)', value: 'draft' }]" class="w-full" />
            </UFormField>
            <UFormField label="Imagen (URL o subir)">
              <div class="flex items-center gap-2">
                <UInput v-model="courseForm.imageUrl" placeholder="https://…" class="flex-1" />
                <label class="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary hover:underline">
                  <UIcon name="i-lucide-upload" /> {{ uploadingImage ? 'Subiendo…' : 'Subir' }}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" :disabled="uploadingImage" @change="onCourseImage">
                </label>
              </div>
            </UFormField>
          </div>
          <div class="flex justify-end gap-2">
            <UButton v-if="editingCourse" color="neutral" variant="ghost" label="Cancelar edición" @click="cancelCourse" />
            <UButton :label="editingCourse ? 'Guardar cambios' : 'Crear curso'" icon="i-lucide-save" :loading="savingCourse" :disabled="!courseForm.title.trim()" @click="saveCourse" />
          </div>
        </div>
      </UCard>

      <UCard v-for="c in courses" :key="c.id">
        <div class="flex flex-wrap items-start gap-3">
          <img v-if="c.imageUrl" :src="c.imageUrl" alt="" class="h-14 w-20 shrink-0 rounded-md object-cover">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-bold">{{ c.title }}</h2>
              <UBadge :color="c.status === 'published' ? 'success' : 'neutral'" variant="soft" size="sm">{{ c.status === 'published' ? 'Publicado' : 'Borrador' }}</UBadge>
              <UBadge :color="c.priceCents ? 'warning' : 'success'" variant="subtle" size="sm">{{ fmtMoney(c.priceCents) }}</UBadge>
              <UBadge color="neutral" variant="subtle" size="sm">{{ c.enrolled }} inscritos</UBadge>
            </div>
            <p class="mt-0.5 line-clamp-2 text-sm text-muted">{{ c.description }}</p>
            <p class="text-xs text-muted">{{ c.chapters.length }} capítulos · {{ c.chapters.reduce((a, ch) => a + ch.lessons.length, 0) }} lecciones</p>
          </div>
          <div class="flex gap-1">
            <UButton size="sm" color="neutral" variant="soft" :icon="expanded[c.id] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" :label="expanded[c.id] ? 'Ocultar contenido' : 'Contenido'" @click="expanded[c.id] = !expanded[c.id]" />
            <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-pen-line" label="Editar" @click="startEditCourse(c)" />
            <UButton v-if="c.status === 'published'" size="sm" color="neutral" variant="ghost" icon="i-lucide-eye" :to="`/courses/${c.slug}`" />
            <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="toDelete = { kind: 'course', id: c.id, label: c.title }" />
          </div>
        </div>

        <div v-if="expanded[c.id]" class="mt-4 space-y-4 border-t border-default pt-4">
          <div v-for="ch in c.chapters" :key="ch.id" class="rounded-lg border border-default p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold">{{ ch.title }}</span>
              <span class="text-xs text-muted">orden {{ ch.sort }}</span>
              <span class="flex-1" />
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-up" @click="moveChapter(c, ch, -1)" />
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-down" @click="moveChapter(c, ch, 1)" />
              <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="toDelete = { kind: 'chapter', id: ch.id, label: ch.title }" />
            </div>
            <ul class="mt-2 divide-y divide-default">
              <li v-for="l in ch.lessons" :key="l.id" class="flex flex-wrap items-center gap-2 py-2 text-sm">
                <UIcon :name="l.videoUrl ? 'i-lucide-play-circle' : 'i-lucide-file-text'" class="text-muted" />
                <span class="min-w-0 flex-1 truncate">{{ l.title }}</span>
                <UBadge v-if="l.isFree" color="success" variant="subtle" size="sm">Gratis</UBadge>
                <span class="text-xs text-muted">{{ l.durationMin }} min · orden {{ l.sort }}</span>
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-up" @click="moveLesson(c, ch, l, -1)" />
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-down" @click="moveLesson(c, ch, l, 1)" />
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pen-line" @click="startEditLesson(c.id, ch, l)" />
                <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="toDelete = { kind: 'lesson', id: l.id, label: l.title }" />
              </li>
            </ul>
            <p v-if="!ch.lessons.length" class="py-2 text-sm text-muted">Sin lecciones todavía.</p>
            <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-plus" label="Nueva lección" class="mt-2" @click="startNewLesson(c.id, ch)" />
          </div>
          <div class="flex gap-2">
            <UInput v-model="newChapter[c.id]" placeholder="Título del nuevo capítulo" class="flex-1" @keyup.enter="addChapter(c)" />
            <UButton label="Agregar capítulo" icon="i-lucide-plus" :disabled="!(newChapter[c.id] || '').trim()" @click="addChapter(c)" />
          </div>
        </div>
      </UCard>
      <UAlert v-if="!courses.length" color="neutral" variant="soft" title="Todavía no hay cursos" description="Creá el primero con el formulario de arriba." />
    </template>

    <UModal :open="!!lessonTarget" :title="editingLesson ? 'Editar lección' : 'Nueva lección'" @update:open="(v: boolean) => { if (!v) { lessonTarget = null; editingLesson = null } }">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Título">
            <UInput v-model="lessonForm.title" class="w-full" />
          </UFormField>
          <UFormField label="Contenido" description="Texto de la lección. Los párrafos se separan con una línea en blanco.">
            <UTextarea v-model="lessonForm.content" :rows="8" class="w-full" />
          </UFormField>
          <UFormField label="URL de video (opcional)" description="Enlace de YouTube u otro video: se muestra embebido si es de YouTube.">
            <UInput v-model="lessonForm.videoUrl" placeholder="https://www.youtube.com/watch?v=…" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Duración (min)">
              <UInput v-model="lessonForm.durationMin" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Orden">
              <UInput v-model="lessonForm.sort" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Gratuita">
              <USwitch v-model="lessonForm.isFree" />
              <p class="mt-1 text-xs text-muted">Visible sin inscribirse</p>
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="lessonTarget = null; editingLesson = null" />
          <UButton label="Guardar lección" icon="i-lucide-save" :loading="savingLesson" :disabled="!lessonForm.title.trim()" @click="saveLesson" />
        </div>
      </template>
    </UModal>

    <UModal :open="!!toDelete" title="Confirmar eliminación" :description="`Se va a eliminar «${toDelete?.label}». Si es un curso o capítulo, también cae todo su contenido e inscripciones/progresos asociados. Esta acción no se puede deshacer.`" @update:open="(v: boolean) => { if (!v) toDelete = null }">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancelar" @click="toDelete = null" />
          <UButton color="error" label="Sí, eliminar" icon="i-lucide-trash-2" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
