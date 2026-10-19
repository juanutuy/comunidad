<script setup lang="ts">
// Página-estudio de curso (Fase 8): reemplaza al formulario básico.
// Cabecera con estado y AUTOGUARDADO (indicador «Guardado / Cambios
// sin guardar»), pestañas Curriculum / Drip / Enrollments / Settings
// y un panel de currículum fijo con capítulos y lecciones que se
// reordenan ARRASTRANDO. Los tipos de lección son los 7 de la
// referencia (video, texto, audio, PDF, slides, descarga, incrustado)
// — no hay quiz porque la referencia tampoco lo tiene. El tipo de una
// lección con contenido es inmutable (el servidor lo enforce también).
definePageMeta({ layout: 'admin' })
const route = useRoute()
const courseId = computed(() => String(route.params.id))
const { user, tenant } = useAuth()
const { fmtMoney, fmtDateTime } = useFormat()
const api = useApi()
const toast = useToast()

interface LessonFull {
  id: number, title: string, kind: string, status: string, content: string, contentHtml: string,
  videoUrl: string, fileUrl: string, fileName: string, embedUrl: string, durationMin: number,
  isFree: boolean, allowDownload: boolean, prerequisite: boolean, resourceUrl: string, resourceName: string,
  unlockOffsetDays: number | null, unlockAt: string, sort: number,
}
interface ChapterFull { id: number, title: string, sort: number, lessons: LessonFull[] }
interface CourseFull {
  id: number, slug: string, title: string, description: string, shortDescription: string, descriptionHtml: string,
  level: string, priceCents: number, status: string, imageUrl: string, bannerUrl: string,
  visibility: string, enrollLimit: number, dripMode: string, certificateEnabled: boolean, enrolled: number,
}
interface StudioData { course: CourseFull, chapters: ChapterFull[] }

const { data, refresh } = await useAsyncData(() => `studio-${courseId.value}`, () =>
  ['admin', 'course_manager'].includes(user.value?.role || '') ? api<StudioData>(`/api/admin/courses/${courseId.value}`) : Promise.resolve(null), { watch: [courseId] })

const courseForm = reactive({
  title: '', level: 'Principiante', price: 0, status: 'published', imageUrl: '',
  shortDescription: '', descriptionHtml: '', bannerUrl: '', visibility: 'public',
  enrollLimit: 0, dripMode: 'none', certificateEnabled: false, slug: '',
})
const chapters = ref<ChapterFull[]>([])
const saveState = ref<'saved' | 'dirty' | 'saving' | 'error'>('saved')
let syncing = false

function syncFromData() {
  if (!data.value) return
  syncing = true
  const c = data.value.course
  Object.assign(courseForm, {
    title: c.title, level: c.level, price: c.priceCents / 100, status: c.status, imageUrl: c.imageUrl,
    shortDescription: c.shortDescription, descriptionHtml: c.descriptionHtml, bannerUrl: c.bannerUrl,
    visibility: c.visibility, enrollLimit: c.enrollLimit, dripMode: c.dripMode,
    certificateEnabled: c.certificateEnabled, slug: c.slug,
  })
  chapters.value = JSON.parse(JSON.stringify(data.value.chapters)) as ChapterFull[]
  syncing = false
}
watch(data, syncFromData, { immediate: true })

function errMsg(e: unknown) { return (e as { data?: { message?: string } }).data?.message || 'Intentá de nuevo.' }

// --- Autoguardado del curso (datos + settings): se manda el estado
// completo del formulario; el servidor fusiona y valida. ---
let courseTimer: ReturnType<typeof setTimeout> | null = null
async function saveCourse() {
  saveState.value = 'saving'
  try {
    await api(`/api/admin/courses/${courseId.value}`, {
      method: 'PUT',
      body: {
        title: courseForm.title, level: courseForm.level, priceCents: Math.round(courseForm.price * 100),
        status: courseForm.status, imageUrl: courseForm.imageUrl,
        shortDescription: courseForm.shortDescription, descriptionHtml: courseForm.descriptionHtml,
        bannerUrl: courseForm.bannerUrl, visibility: courseForm.visibility,
        enrollLimit: courseForm.enrollLimit, dripMode: courseForm.dripMode,
        certificateEnabled: courseForm.certificateEnabled,
      },
    })
    saveState.value = 'saved'
  }
  catch (e) {
    saveState.value = 'error'
    toast.add({ title: 'No se pudo guardar el curso', description: errMsg(e), color: 'error' })
  }
}
watch(courseForm, () => {
  if (syncing || !data.value) return
  saveState.value = 'dirty'
  if (courseTimer) clearTimeout(courseTimer)
  courseTimer = setTimeout(saveCourse, 900)
})

// --- Lección seleccionada y su autoguardado ---
const selectedLessonId = ref<number | null>(null)
const selected = computed(() => {
  for (const ch of chapters.value) {
    const l = ch.lessons.find(x => x.id === selectedLessonId.value)
    if (l) return { chapter: ch, lesson: l }
  }
  return null
})
const lessonForm = reactive<LessonFull>({
  id: 0, title: '', kind: 'text', status: 'draft', content: '', contentHtml: '', videoUrl: '',
  fileUrl: '', fileName: '', embedUrl: '', durationMin: 0, isFree: false, allowDownload: false,
  prerequisite: false, resourceUrl: '', resourceName: '', unlockOffsetDays: null, unlockAt: '', sort: 0,
})
let lessonSyncing = false
watch(selected, (sel) => {
  lessonSyncing = true
  if (sel) Object.assign(lessonForm, JSON.parse(JSON.stringify(sel.lesson)))
  lessonSyncing = false
})
let lessonTimer: ReturnType<typeof setTimeout> | null = null
async function saveLesson() {
  if (!lessonForm.id) return
  saveState.value = 'saving'
  try {
    await api(`/api/admin/lessons/${lessonForm.id}`, { method: 'PUT', body: { ...lessonForm } })
    // Reflejar lo guardado en el panel sin recargar todo.
    const sel = selected.value
    if (sel) Object.assign(sel.lesson, JSON.parse(JSON.stringify(lessonForm)))
    saveState.value = 'saved'
  }
  catch (e) {
    saveState.value = 'error'
    toast.add({ title: 'No se pudo guardar la lección', description: errMsg(e), color: 'error' })
  }
}
watch(lessonForm, () => {
  if (lessonSyncing || !lessonForm.id) return
  saveState.value = 'dirty'
  if (lessonTimer) clearTimeout(lessonTimer)
  lessonTimer = setTimeout(saveLesson, 900)
})

const lessonKindMeta: Record<string, { label: string, icon: string }> = {
  video: { label: 'Video', icon: 'i-lucide-play-circle' },
  text: { label: 'Texto', icon: 'i-lucide-file-text' },
  audio: { label: 'Audio', icon: 'i-lucide-music' },
  pdf: { label: 'PDF', icon: 'i-lucide-file' },
  slides: { label: 'Slides', icon: 'i-lucide-presentation' },
  download: { label: 'Descarga', icon: 'i-lucide-download' },
  embedded: { label: 'Incrustado', icon: 'i-lucide-monitor-play' },
}
const kindCards = Object.entries(lessonKindMeta).map(([value, m]) => ({ value, ...m }))
const lessonHasContent = computed(() => !!(
  lessonForm.content.trim() || lessonForm.contentHtml.trim() || lessonForm.videoUrl.trim()
  || lessonForm.fileUrl.trim() || lessonForm.embedUrl.trim()))

async function uploadFor(kind: 'image' | 'audio' | 'file', file: File): Promise<{ url: string, name: string }> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('kind', kind)
  return await api<{ url: string, name: string }>('/api/uploads', { method: 'POST', body: fd })
}
async function editorUploadImage(file: File): Promise<string> { return (await uploadFor('image', file)).url }
async function onLessonFile(e: Event, kind: 'audio' | 'file') {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  try {
    const up = await uploadFor(kind, file)
    lessonForm.fileUrl = up.url
    lessonForm.fileName = up.name
    toast.add({ title: 'Archivo subido', color: 'success' })
  }
  catch (err) { toast.add({ title: 'No se pudo subir el archivo', description: errMsg(err), color: 'error' }) }
}
async function onLessonResource(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  try {
    const up = await uploadFor('file', file)
    lessonForm.resourceUrl = up.url
    lessonForm.resourceName = up.name
    toast.add({ title: 'Recurso adjuntado', color: 'success' })
  }
  catch (err) { toast.add({ title: 'No se pudo subir el recurso', description: errMsg(err), color: 'error' }) }
}
async function onCourseImage(e: Event, field: 'imageUrl' | 'bannerUrl') {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  try {
    const up = await uploadFor('image', file)
    courseForm[field] = up.url
  }
  catch (err) { toast.add({ title: 'No se pudo subir la imagen', description: errMsg(err), color: 'error' }) }
}

// --- Estructura del currículum: crear/borrar y reordenar arrastrando ---
const newChapterTitle = ref('')
async function addChapter() {
  const title = newChapterTitle.value.trim()
  if (!title) return
  try {
    await api(`/api/admin/courses/${courseId.value}/chapters`, { method: 'POST', body: { title } })
    newChapterTitle.value = ''
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo crear el capítulo', description: errMsg(e), color: 'error' }) }
}
async function renameChapter(ch: ChapterFull) {
  try { await api(`/api/admin/chapters/${ch.id}`, { method: 'PUT', body: { title: ch.title, sort: ch.sort } }) }
  catch (e) { toast.add({ title: 'No se pudo renombrar', description: errMsg(e), color: 'error' }); await refresh() }
}
async function addLesson(ch: ChapterFull) {
  try {
    const res = await api<{ id: number }>(`/api/admin/chapters/${ch.id}/lessons`, {
      method: 'POST', body: { title: 'Sin título', kind: 'text', status: 'draft' },
    })
    await refresh()
    selectedLessonId.value = res.id
  }
  catch (e) { toast.add({ title: 'No se pudo crear la lección', description: errMsg(e), color: 'error' }) }
}
const toDelete = ref<{ type: 'chapter' | 'lesson', id: number, label: string } | null>(null)
async function confirmDelete() {
  if (!toDelete.value) return
  const { type, id } = toDelete.value
  try {
    if (type === 'chapter') await api(`/api/admin/chapters/${id}`, { method: 'DELETE' })
    else await api(`/api/admin/lessons/${id}`, { method: 'DELETE' })
    if (type === 'lesson' && selectedLessonId.value === id) selectedLessonId.value = null
    toDelete.value = null
    toast.add({ title: 'Eliminado', color: 'success' })
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo eliminar', description: errMsg(e), color: 'error' }) }
}

const drag = ref<{ type: 'chapter' | 'lesson', id: number, fromChapterId: number } | null>(null)
function onDragStart(type: 'chapter' | 'lesson', id: number, fromChapterId = 0) {
  drag.value = { type, id, fromChapterId }
}
async function persistCurriculum() {
  try {
    await api(`/api/admin/courses/${courseId.value}/curriculum`, {
      method: 'PUT',
      body: {
        chapters: chapters.value.map((ch, i) => ({ id: ch.id, sort: i + 1 })),
        lessons: chapters.value.flatMap(ch => ch.lessons.map((l, i) => ({ id: l.id, chapterId: ch.id, sort: i + 1 }))),
      },
    })
    saveState.value = 'saved'
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar el orden', description: errMsg(e), color: 'error' })
    await refresh()
  }
}
function dropOnChapter(target: ChapterFull) {
  if (!drag.value) return
  if (drag.value.type === 'chapter') {
    const from = chapters.value.findIndex(c => c.id === drag.value!.id)
    const to = chapters.value.findIndex(c => c.id === target.id)
    if (from === -1 || to === -1 || from === to) return
    const [moved] = chapters.value.splice(from, 1)
    chapters.value.splice(to, 0, moved!)
  }
  else {
    moveLesson(drag.value.id, target, null)
  }
  drag.value = null
  void persistCurriculum()
}
function dropOnLesson(targetChapter: ChapterFull, targetLesson: LessonFull) {
  if (!drag.value || drag.value.type !== 'lesson') return
  moveLesson(drag.value.id, targetChapter, targetLesson)
  drag.value = null
  void persistCurriculum()
}
function moveLesson(lessonId: number, targetChapter: ChapterFull, beforeLesson: LessonFull | null) {
  let moved: LessonFull | null = null
  for (const ch of chapters.value) {
    const idx = ch.lessons.findIndex(l => l.id === lessonId)
    if (idx >= 0) { moved = ch.lessons.splice(idx, 1)[0]!; break }
  }
  if (!moved) return
  const insertAt = beforeLesson ? targetChapter.lessons.findIndex(l => l.id === beforeLesson.id) : targetChapter.lessons.length
  targetChapter.lessons.splice(insertAt < 0 ? targetChapter.lessons.length : insertAt, 0, moved)
}

// --- Drip por lección (los valores viven en cada lección) ---
async function saveLessonDrip(l: LessonFull) {
  try {
    await api(`/api/admin/lessons/${l.id}`, {
      method: 'PUT',
      body: { unlockOffsetDays: l.unlockOffsetDays, unlockAt: l.unlockAt ? new Date(l.unlockAt).toISOString() : '' },
    })
    toast.add({ title: 'Drip guardado', color: 'success' })
  }
  catch (e) { toast.add({ title: 'No se pudo guardar el drip', description: errMsg(e), color: 'error' }) }
}
const allLessons = computed(() => chapters.value.flatMap(ch => ch.lessons.map(l => ({ chapter: ch, lesson: l }))))

// --- Enrollments ---
interface EnrollmentRow { id: number, userId: number, name: string, slug: string, email: string, avatarUrl: string, enrolledAt: string, progress: { completed: number, total: number, pct: number } }
const { data: enrollData, refresh: refreshEnroll } = await useAsyncData(() => `studio-enroll-${courseId.value}`, () =>
  ['admin', 'course_manager'].includes(user.value?.role || '') ? api<{ enrollments: EnrollmentRow[] }>(`/api/admin/courses/${courseId.value}/enrollments`) : Promise.resolve({ enrollments: [] as EnrollmentRow[] }), { watch: [courseId] })
const { data: membersData } = await useAsyncData('studio-members', () =>
  ['admin', 'course_manager'].includes(user.value?.role || '') ? api<{ members: { id: number, name: string, email: string }[] }>('/api/admin/courses/member-options') : Promise.resolve({ members: [] }))
const memberToAdd = ref<number | undefined>(undefined)
const addableMembers = computed(() => {
  const enrolledIds = new Set((enrollData.value?.enrollments || []).map(e => e.userId))
  return (membersData.value?.members || []).filter(m => !enrolledIds.has(m.id))
    .map(m => ({ label: `${m.name} · ${m.email}`, value: m.id }))
})
async function enrollMember() {
  if (!memberToAdd.value) return
  try {
    await api(`/api/admin/courses/${courseId.value}/enrollments`, { method: 'POST', body: { userId: memberToAdd.value } })
    memberToAdd.value = undefined
    toast.add({ title: 'Miembro inscrito', color: 'success' })
    await refreshEnroll()
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo inscribir', description: errMsg(e), color: 'error' }) }
}
async function unenroll(row: EnrollmentRow) {
  try {
    await api(`/api/admin/courses/${courseId.value}/enrollments/${row.userId}`, { method: 'DELETE' })
    toast.add({ title: 'Inscripción quitada', color: 'success' })
    await refreshEnroll()
    await refresh()
  }
  catch (e) { toast.add({ title: 'No se pudo quitar la inscripción', description: errMsg(e), color: 'error' }) }
}

const { data: billing } = await useAsyncData('studio-billing', () => api<{ enabled: boolean }>('/api/billing/status'))
const tab = ref(0)
const tabs = [
  { label: 'Curriculum', icon: 'i-lucide-layout-list' },
  { label: 'Drip', icon: 'i-lucide-timer' },
  { label: 'Enrollments', icon: 'i-lucide-users' },
  { label: 'Settings', icon: 'i-lucide-settings-2' },
]
const visibilityOptions = [
  { value: 'public', label: 'Público', hint: 'Aparece en el catálogo y en la búsqueda para todos.' },
  { value: 'private', label: 'Privado', hint: 'Solo con sesión iniciada: miembros de la comunidad.' },
  { value: 'secret', label: 'Secreto', hint: 'No aparece en listados ni búsqueda. Solo por enlace directo con acceso (inscritos).' },
]
</script>

<template>
  <div>
    <UAlert v-if="!user" color="warning" variant="soft" icon="i-lucide-lock" title="Iniciá sesión" description="Necesitás una cuenta de administrador para usar el estudio de cursos.">
      <template #actions><UButton to="/" label="Ir al inicio" size="sm" /></template>
    </UAlert>
    <UAlert v-else-if="user.role !== 'admin'" color="error" variant="soft" icon="i-lucide-shield-alert" title="Sin acceso" description="Esta sección es solo para administradores y encargados de cursos de la comunidad." />
    <UAlert v-else-if="!data" color="neutral" variant="soft" icon="i-lucide-search-x" title="Curso no encontrado" description="Puede que haya sido eliminado.">
      <template #actions><UButton to="/admin/courses" label="Volver a cursos" size="sm" /></template>
    </UAlert>

    <div v-else class="space-y-4">
      <!-- Cabecera del estudio -->
      <div class="flex flex-wrap items-center gap-3">
        <UButton to="/admin/courses" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" label="Cursos" />
        <img v-if="courseForm.imageUrl" :src="courseForm.imageUrl" alt="" class="size-10 rounded-lg object-cover">
        <div class="min-w-0 flex-1">
          <p class="truncate text-lg font-bold leading-tight">{{ courseForm.title || 'Curso sin título' }}</p>
          <p class="flex items-center gap-2 text-xs text-muted">
            <span v-if="saveState === 'saved'" class="inline-flex items-center gap-1 text-green-600"><UIcon name="i-lucide-check" class="size-3.5" /> Guardado</span>
            <span v-else-if="saveState === 'saving'" class="inline-flex items-center gap-1"><UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" /> Guardando…</span>
            <span v-else-if="saveState === 'error'" class="inline-flex items-center gap-1 text-red-500"><UIcon name="i-lucide-triangle-alert" class="size-3.5" /> No se pudo guardar</span>
            <span v-else class="inline-flex items-center gap-1"><UIcon name="i-lucide-pencil" class="size-3.5" /> Cambios sin guardar</span>
            <span>· {{ data.course.enrolled }} inscritos</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-muted">{{ courseForm.status === 'published' ? 'Publicado' : 'Borrador' }}</span>
          <USwitch :model-value="courseForm.status === 'published'" @update:model-value="v => courseForm.status = v ? 'published' : 'draft'" />
          <UButton :to="`/courses/${courseForm.slug}`" label="Ver curso" icon="i-lucide-eye" color="neutral" variant="soft" size="sm" />
        </div>
      </div>
      <p class="-mt-2 text-xs text-muted">Todo se guarda solo mientras editás: no hay botón «Guardar» en el estudio.</p>

      <!-- Pestañas -->
      <div class="flex gap-1 overflow-x-auto border-b border-default">
        <button v-for="(t, i) in tabs" :key="t.label" type="button"
          class="inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
          :class="tab === i ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-default'"
          @click="tab = i">
          <UIcon :name="t.icon" class="size-4" /> {{ t.label }}
        </button>
      </div>

      <!-- ============ CURRICULUM ============ -->
      <div v-show="tab === 0" class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <!-- Panel fijo de currículum -->
        <div class="w-full shrink-0 space-y-3 lg:sticky lg:top-4 lg:w-[300px]">
          <div v-for="ch in chapters" :key="ch.id" class="rounded-xl border border-default bg-default"
            @dragover.prevent @drop="dropOnChapter(ch)">
            <div class="flex items-center gap-1 border-b border-default px-2 py-1.5" draggable="true"
              @dragstart="onDragStart('chapter', ch.id)">
              <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 cursor-grab text-muted" />
              <input v-model="ch.title" class="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                @change="renameChapter(ch)">
              <UDropdownMenu :items="[[{ label: 'Agregar lección', icon: 'i-lucide-plus', onSelect: () => addLesson(ch) }], [{ label: 'Eliminar capítulo', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => toDelete = { type: 'chapter', id: ch.id, label: ch.title } }]]">
                <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="xs" />
              </UDropdownMenu>
            </div>
            <div class="p-1.5">
              <button v-for="l in ch.lessons" :key="l.id" type="button" draggable="true"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
                :class="selectedLessonId === l.id ? 'bg-primary/10 text-primary' : 'hover:bg-elevated'"
                @dragstart.stop="onDragStart('lesson', l.id, ch.id)"
                @dragover.prevent.stop @drop.stop="dropOnLesson(ch, l)"
                @click="selectedLessonId = l.id">
                <UIcon name="i-lucide-grip-vertical" class="size-3.5 shrink-0 cursor-grab text-muted" />
                <UIcon :name="lessonKindMeta[l.kind]?.icon || 'i-lucide-file-text'" class="size-4 shrink-0" />
                <span class="min-w-0 flex-1 truncate">{{ l.title }}</span>
                <UBadge v-if="l.status === 'draft'" color="warning" variant="subtle" size="sm">Borrador</UBadge>
                <UBadge v-if="l.isFree" color="success" variant="subtle" size="sm">Gratis</UBadge>
              </button>
              <p v-if="!ch.lessons.length" class="px-2 py-1 text-xs text-muted">Sin lecciones todavía.</p>
              <UButton label="Add lesson" icon="i-lucide-plus" size="xs" color="neutral" variant="ghost" class="mt-1" @click="addLesson(ch)" />
            </div>
          </div>
          <div class="flex gap-2">
            <UInput v-model="newChapterTitle" placeholder="Nombre del capítulo…" class="flex-1" size="sm" @keyup.enter="addChapter" />
            <UButton label="Capítulo" icon="i-lucide-plus" size="sm" :disabled="!newChapterTitle.trim()" @click="addChapter" />
          </div>
        </div>

        <!-- Editor de la lección seleccionada -->
        <div class="min-w-0 flex-1">
          <UCard v-if="!selected">
            <div class="py-10 text-center text-muted">
              <UIcon name="i-lucide-mouse-pointer-click" class="mx-auto mb-2 size-8" />
              <p class="text-sm">Elegí una lección del panel para editarla, o creá una con «Add lesson».</p>
            </div>
          </UCard>
          <UCard v-else>
            <div class="space-y-5">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :icon="lessonKindMeta[lessonForm.kind]?.icon" color="primary" variant="subtle">{{ lessonKindMeta[lessonForm.kind]?.label }}</UBadge>
                <div class="ms-auto flex items-center gap-2">
                  <span class="text-xs text-muted">{{ lessonForm.status === 'published' ? 'Publicada' : 'Borrador' }}</span>
                  <USwitch :model-value="lessonForm.status === 'published'" @update:model-value="v => lessonForm.status = v ? 'published' : 'draft'" />
                  <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm"
                    @click="toDelete = { type: 'lesson', id: lessonForm.id, label: lessonForm.title }" />
                </div>
              </div>
              <input v-model="lessonForm.title" placeholder="Título de la lección"
                class="w-full bg-transparent text-xl font-bold outline-none placeholder:text-muted/60">

              <!-- Tipo: solo se elige mientras la lección está vacía -->
              <div v-if="!lessonHasContent">
                <p class="mb-2 text-sm font-medium">Tipo de lección</p>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  <button v-for="k in kindCards" :key="k.value" type="button"
                    class="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors"
                    :class="lessonForm.kind === k.value ? 'border-primary bg-primary/5 text-primary' : 'border-default hover:bg-elevated'"
                    @click="lessonForm.kind = k.value">
                    <UIcon :name="k.icon" class="size-4" /> {{ k.label }}
                  </button>
                </div>
              </div>
              <UAlert v-else color="neutral" variant="soft" icon="i-lucide-lock" title="El tipo de esta lección ya no se puede cambiar"
                description="La lección tiene contenido cargado. Para otro tipo, creá una lección nueva (así funciona también en la referencia)." />

              <div class="grid gap-5 xl:grid-cols-[1fr_250px]">
                <div class="min-w-0 space-y-4">
                  <!-- VIDEO -->
                  <template v-if="lessonForm.kind === 'video'">
                    <UFormField label="URL del video" hint="YouTube, Vimeo o un archivo MP4 directo.">
                      <UInput v-model="lessonForm.videoUrl" icon="i-lucide-link" placeholder="https://www.youtube.com/watch?v=…" class="w-full" />
                    </UFormField>
                    <UFormField label="Descripción">
                      <ClientOnly><RichEditor v-model="lessonForm.contentHtml" mode="classic" :upload-image="editorUploadImage" placeholder="Descripción de la lección…" /></ClientOnly>
                    </UFormField>
                  </template>
                  <!-- TEXTO -->
                  <template v-else-if="lessonForm.kind === 'text'">
                    <UFormField label="Contenido">
                      <ClientOnly><RichEditor v-model="lessonForm.contentHtml" mode="classic" :upload-image="editorUploadImage" placeholder="Escribí el contenido de la lección…" /></ClientOnly>
                    </UFormField>
                  </template>
                  <!-- AUDIO -->
                  <template v-else-if="lessonForm.kind === 'audio'">
                    <UFormField label="Archivo de audio" hint="MP3, M4A, OGG o WAV, hasta 15 MB.">
                      <div class="flex flex-wrap items-center gap-2">
                        <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
                          <UIcon name="i-lucide-upload" class="size-4" /> Subir audio
                          <input type="file" accept="audio/*" class="hidden" @change="e => onLessonFile(e, 'audio')">
                        </label>
                        <span v-if="lessonForm.fileName" class="text-sm text-muted">{{ lessonForm.fileName }}</span>
                      </div>
                    </UFormField>
                    <UFormField label="…o pegá la URL del audio">
                      <UInput v-model="lessonForm.fileUrl" icon="i-lucide-link" placeholder="https://…" class="w-full" />
                    </UFormField>
                    <audio v-if="lessonForm.fileUrl" :src="lessonForm.fileUrl" controls class="w-full" />
                    <UFormField label="Descripción">
                      <ClientOnly><RichEditor v-model="lessonForm.contentHtml" mode="classic" :upload-image="editorUploadImage" placeholder="Notas de la lección…" /></ClientOnly>
                    </UFormField>
                  </template>
                  <!-- PDF -->
                  <template v-else-if="lessonForm.kind === 'pdf'">
                    <UFormField label="Archivo PDF" hint="Hasta 15 MB. Se muestra en un visor dentro de la lección.">
                      <div class="flex flex-wrap items-center gap-2">
                        <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
                          <UIcon name="i-lucide-upload" class="size-4" /> Subir PDF
                          <input type="file" accept="application/pdf" class="hidden" @change="e => onLessonFile(e, 'file')">
                        </label>
                        <span v-if="lessonForm.fileName" class="text-sm text-muted">{{ lessonForm.fileName }}</span>
                      </div>
                    </UFormField>
                    <UFormField label="…o pegá la URL del PDF">
                      <UInput v-model="lessonForm.fileUrl" icon="i-lucide-link" placeholder="https://…" class="w-full" />
                    </UFormField>
                    <UFormField label="Descripción">
                      <ClientOnly><RichEditor v-model="lessonForm.contentHtml" mode="classic" :upload-image="editorUploadImage" placeholder="Notas de la lección…" /></ClientOnly>
                    </UFormField>
                  </template>
                  <!-- SLIDES -->
                  <template v-else-if="lessonForm.kind === 'slides'">
                    <UFormField label="URL de la presentación" hint="El enlace para incrustar de Google Slides, Canva u otro servicio.">
                      <UInput v-model="lessonForm.embedUrl" icon="i-lucide-link" placeholder="https://…" class="w-full" />
                    </UFormField>
                    <UFormField label="…o subí el archivo (PDF o presentación)">
                      <div class="flex flex-wrap items-center gap-2">
                        <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
                          <UIcon name="i-lucide-upload" class="size-4" /> Subir archivo
                          <input type="file" accept="application/pdf,.ppt,.pptx" class="hidden" @change="e => onLessonFile(e, 'file')">
                        </label>
                        <span v-if="lessonForm.fileName" class="text-sm text-muted">{{ lessonForm.fileName }}</span>
                        <span v-else-if="lessonForm.fileUrl" class="text-sm text-muted">{{ lessonForm.fileUrl }}</span>
                      </div>
                      <p class="mt-1 text-xs text-muted">Un archivo subido se ofrece para ver/descargar; la presentación incrustada por URL se ve dentro de la lección.</p>
                    </UFormField>
                    <UFormField label="Descripción">
                      <ClientOnly><RichEditor v-model="lessonForm.contentHtml" mode="classic" :upload-image="editorUploadImage" placeholder="Notas de la lección…" /></ClientOnly>
                    </UFormField>
                  </template>
                  <!-- DESCARGA -->
                  <template v-else-if="lessonForm.kind === 'download'">
                    <UFormField label="Archivo descargable" hint="Cualquier archivo de hasta 15 MB.">
                      <div class="flex flex-wrap items-center gap-2">
                        <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
                          <UIcon name="i-lucide-upload" class="size-4" /> Subir archivo
                          <input type="file" class="hidden" @change="e => onLessonFile(e, 'file')">
                        </label>
                        <span v-if="lessonForm.fileName" class="text-sm text-muted">{{ lessonForm.fileName }}</span>
                      </div>
                    </UFormField>
                    <UFormField label="…o pegá la URL del archivo">
                      <UInput v-model="lessonForm.fileUrl" icon="i-lucide-link" placeholder="https://…" class="w-full" />
                    </UFormField>
                    <UFormField label="Descripción">
                      <ClientOnly><RichEditor v-model="lessonForm.contentHtml" mode="classic" :upload-image="editorUploadImage" placeholder="Qué incluye la descarga…" /></ClientOnly>
                    </UFormField>
                  </template>
                  <!-- INCRUSTADO -->
                  <template v-else-if="lessonForm.kind === 'embedded'">
                    <UFormField label="URL para incrustar" hint="La URL del reproductor o widget (YouTube, Vimeo, formularios, etc.). Algunos sitios bloquean la incrustación: probá la vista previa.">
                      <UInput v-model="lessonForm.embedUrl" icon="i-lucide-link" placeholder="https://…" class="w-full" />
                    </UFormField>
                    <div v-if="lessonForm.embedUrl" class="aspect-video w-full overflow-hidden rounded-lg border border-default">
                      <iframe :src="lessonForm.embedUrl" class="size-full" loading="lazy"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" title="Vista previa incrustada" />
                    </div>
                    <UFormField label="Descripción">
                      <ClientOnly><RichEditor v-model="lessonForm.contentHtml" mode="classic" :upload-image="editorUploadImage" placeholder="Descripción de la lección…" /></ClientOnly>
                    </UFormField>
                  </template>
                </div>

                <!-- Ajustes de la lección -->
                <div class="space-y-4 rounded-xl border border-default p-3">
                  <p class="text-sm font-semibold">Ajustes de la lección</p>
                  <UFormField label="Duración (minutos)">
                    <UInput v-model.number="lessonForm.durationMin" type="number" min="0" class="w-full" />
                  </UFormField>
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-medium">Vista previa gratuita</p>
                      <p class="text-xs text-muted">Se puede ver sin inscribirse, como muestra del curso.</p>
                    </div>
                    <USwitch v-model="lessonForm.isFree" />
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-medium">Requiere la anterior</p>
                      <p class="text-xs text-muted">Hasta completar la lección previa, esta queda bloqueada.</p>
                    </div>
                    <USwitch v-model="lessonForm.prerequisite" />
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-medium">Permitir descarga</p>
                      <p class="text-xs text-muted">Muestra el botón de descarga del archivo (PDF, audio, slides).</p>
                    </div>
                    <USwitch v-model="lessonForm.allowDownload" />
                  </div>
                  <div class="border-t border-default pt-3">
                    <p class="text-sm font-medium">Recurso descargable</p>
                    <p class="text-xs text-muted">Un adjunto extra que acompaña a la lección (plantilla, ejercicios…).</p>
                    <div v-if="lessonForm.resourceUrl" class="mt-2 flex items-center gap-2">
                      <UIcon name="i-lucide-paperclip" class="size-4 text-muted" />
                      <span class="min-w-0 flex-1 truncate text-sm">{{ lessonForm.resourceName || lessonForm.resourceUrl }}</span>
                      <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click="lessonForm.resourceUrl = ''; lessonForm.resourceName = ''" />
                    </div>
                    <label v-else class="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-default px-3 py-1.5 text-sm hover:bg-elevated">
                      <UIcon name="i-lucide-upload" class="size-4" /> Adjuntar recurso
                      <input type="file" class="hidden" @change="onLessonResource">
                    </label>
                  </div>
                  <p class="border-t border-default pt-3 text-xs text-muted">La liberación por fecha o por días está en la pestaña <button type="button" class="underline" @click="tab = 1">Drip</button>.</p>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- ============ DRIP ============ -->
      <div v-show="tab === 1" class="space-y-4">
        <UCard>
          <p class="font-semibold">Liberación de contenido (drip)</p>
          <p class="mt-1 text-sm text-muted">Controlá cuándo se abre cada lección. Una lección bloqueada muestra «Disponible el {fecha}» y no se puede completar antes.</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            <button v-for="opt in [
              { value: 'none', label: 'Sin drip', hint: 'Todo el contenido disponible desde la inscripción.' },
              { value: 'enrollment', label: 'Por inscripción', hint: 'Cada lección se libera cierta cantidad de días después de inscribirse.' },
              { value: 'dates', label: 'Fechas específicas', hint: 'Cada lección se libera en la fecha que elijas.' },
            ]" :key="opt.value" type="button"
              class="rounded-lg border p-3 text-left transition-colors"
              :class="courseForm.dripMode === opt.value ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated'"
              @click="courseForm.dripMode = opt.value">
              <p class="text-sm font-medium">{{ opt.label }}</p>
              <p class="mt-0.5 text-xs text-muted">{{ opt.hint }}</p>
            </button>
          </div>
        </UCard>
        <UCard v-if="courseForm.dripMode !== 'none'">
          <p class="mb-3 font-semibold">{{ courseForm.dripMode === 'enrollment' ? 'Días desde la inscripción por lección' : 'Fecha de liberación por lección' }}</p>
          <div class="divide-y divide-default">
            <div v-for="row in allLessons" :key="row.lesson.id" class="flex flex-wrap items-center gap-3 py-2.5">
              <UIcon :name="lessonKindMeta[row.lesson.kind]?.icon || 'i-lucide-file-text'" class="size-4 text-muted" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ row.lesson.title }}</p>
                <p class="truncate text-xs text-muted">{{ row.chapter.title }}</p>
              </div>
              <UInput v-if="courseForm.dripMode === 'enrollment'" v-model.number="row.lesson.unlockOffsetDays" type="number" min="0"
                placeholder="Inmediato" class="w-36" @change="saveLessonDrip(row.lesson)">
                <template #trailing><span class="text-xs text-muted">días</span></template>
              </UInput>
              <UInput v-else :model-value="row.lesson.unlockAt ? row.lesson.unlockAt.slice(0, 16) : ''" type="datetime-local" class="w-56"
                @update:model-value="v => row.lesson.unlockAt = String(v || '')" @change="saveLessonDrip(row.lesson)" />
              <span v-if="courseForm.dripMode === 'enrollment' && (row.lesson.unlockOffsetDays === null || row.lesson.unlockOffsetDays === undefined)" class="text-xs text-muted">Inmediato al inscribirse</span>
            </div>
          </div>
          <p class="mt-3 text-xs text-muted">Los cambios de esta lista se guardan al salir de cada campo. Vacío = sin restricción para esa lección.</p>
        </UCard>
      </div>

      <!-- ============ ENROLLMENTS ============ -->
      <div v-show="tab === 2" class="space-y-4">
        <UCard>
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="Inscribir a un miembro" class="min-w-56 flex-1">
              <USelectMenu v-model="memberToAdd" :items="addableMembers" value-key="value" placeholder="Elegí un miembro de la comunidad" class="w-full" />
            </UFormField>
            <UButton label="Inscribir" icon="i-lucide-user-plus" :disabled="!memberToAdd" @click="enrollMember" />
          </div>
          <p class="mt-2 text-xs text-muted">La inscripción manual respeta el límite de inscritos del curso (Settings). Quitar una inscripción también borra el avance de ese miembro en este curso.</p>
        </UCard>
        <UCard>
          <p class="mb-3 font-semibold">Inscritos ({{ enrollData?.enrollments.length || 0 }})</p>
          <div v-if="enrollData?.enrollments.length" class="divide-y divide-default">
            <div v-for="row in enrollData.enrollments" :key="row.id" class="flex flex-wrap items-center gap-3 py-2.5">
              <UAvatar :src="row.avatarUrl || undefined" :alt="row.name" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ row.name }}</p>
                <p class="truncate text-xs text-muted">{{ row.email }} · desde el {{ fmtDateTime(row.enrolledAt) }}</p>
              </div>
              <div class="w-44">
                <div class="mb-1 flex justify-between text-xs text-muted"><span>Avance</span><span>{{ row.progress.pct }}%</span></div>
                <UProgress :model-value="row.progress.pct" size="sm" />
              </div>
              <UButton label="Quitar" size="xs" color="error" variant="soft" icon="i-lucide-user-x" @click="unenroll(row)" />
            </div>
          </div>
          <p v-else class="text-sm text-muted">Todavía no hay inscritos en este curso.</p>
        </UCard>
      </div>

      <!-- ============ SETTINGS ============ -->
      <div v-show="tab === 3" class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <p class="mb-3 font-semibold">General</p>
          <div class="space-y-4">
            <UFormField label="Nombre del curso" required>
              <UInput v-model="courseForm.title" class="w-full" />
            </UFormField>
            <UFormField label="Nivel">
              <USelect v-model="courseForm.level" :items="['Principiante', 'Intermedio', 'Avanzado', 'Todos los niveles']" class="w-full" />
            </UFormField>
            <UFormField label="Descripción corta" :hint="`${courseForm.shortDescription.length}/280 — es la que se ve en las tarjetas del catálogo.`">
              <UTextarea v-model="courseForm.shortDescription" :rows="2" :maxlength="280" class="w-full" />
            </UFormField>
            <UFormField label="Descripción">
              <ClientOnly><RichEditor v-model="courseForm.descriptionHtml" mode="classic" :upload-image="editorUploadImage" placeholder="Contá de qué trata el curso…" /></ClientOnly>
            </UFormField>
            <UFormField label="Enlace del curso" hint="El enlace no cambia aunque renombres el curso.">
              <p class="text-sm text-muted">/courses/{{ courseForm.slug }}</p>
            </UFormField>
          </div>
        </UCard>
        <div class="space-y-4">
          <UCard>
            <p class="mb-3 font-semibold">Visibilidad y acceso</p>
            <div class="space-y-4">
              <div class="space-y-2">
                <button v-for="opt in visibilityOptions" :key="opt.value" type="button"
                  class="block w-full rounded-lg border p-3 text-left transition-colors"
                  :class="courseForm.visibility === opt.value ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated'"
                  @click="courseForm.visibility = opt.value">
                  <p class="text-sm font-medium">{{ opt.label }}</p>
                  <p class="mt-0.5 text-xs text-muted">{{ opt.hint }}</p>
                </button>
              </div>
              <UFormField label="Límite de inscritos" hint="0 = sin límite. Se respeta en la inscripción pública y en la manual.">
                <UInput v-model.number="courseForm.enrollLimit" type="number" min="0" class="w-full" />
              </UFormField>
            </div>
          </UCard>
          <UCard>
            <p class="mb-3 font-semibold">Precio</p>
            <UFormField label="Precio único (USD)" hint="0 = curso gratuito.">
              <UInput v-model.number="courseForm.price" type="number" min="0" step="0.01" class="w-full" />
            </UFormField>
            <p class="mt-2 text-sm text-muted">
              Cobros con tarjeta: <UBadge :color="billing?.enabled ? 'success' : 'neutral'" variant="subtle">{{ billing?.enabled ? 'Stripe activo' : 'Stripe en oscuro (sin claves)' }}</UBadge>
            </p>
            <p class="mt-2 text-xs text-muted">Este curso usa un precio único. Los planes y precios múltiples se gestionan desde <NuxtLink to="/admin/plans" class="underline">Planes</NuxtLink> y no se combinan con el precio por curso.</p>
          </UCard>
          <UCard>
            <p class="mb-3 font-semibold">Imagen del curso</p>
            <div class="space-y-4">
              <UFormField label="Miniatura" hint="La de las tarjetas del catálogo.">
                <div class="flex flex-wrap items-center gap-2">
                  <img v-if="courseForm.imageUrl" :src="courseForm.imageUrl" alt="" class="h-14 w-24 rounded-lg object-cover">
                  <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-default px-3 py-1.5 text-sm hover:bg-elevated">
                    <UIcon name="i-lucide-upload" class="size-4" /> Subir
                    <input type="file" accept="image/*" class="hidden" @change="e => onCourseImage(e, 'imageUrl')">
                  </label>
                  <UInput v-model="courseForm.imageUrl" placeholder="https://…" class="min-w-40 flex-1" />
                </div>
              </UFormField>
              <UFormField label="Banner" hint="La imagen ancha que encabeza la página del curso.">
                <div class="flex flex-wrap items-center gap-2">
                  <img v-if="courseForm.bannerUrl" :src="courseForm.bannerUrl" alt="" class="h-14 w-32 rounded-lg object-cover">
                  <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-default px-3 py-1.5 text-sm hover:bg-elevated">
                    <UIcon name="i-lucide-upload" class="size-4" /> Subir
                    <input type="file" accept="image/*" class="hidden" @change="e => onCourseImage(e, 'bannerUrl')">
                  </label>
                  <UInput v-model="courseForm.bannerUrl" placeholder="https://…" class="min-w-40 flex-1" />
                </div>
              </UFormField>
            </div>
          </UCard>
          <UCard>
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold">Certificado de finalización</p>
                <p class="mt-1 text-sm text-muted">Si está encendido, al completar el 100% de las lecciones el estudiante puede ver y descargar su certificado. Si está apagado, no se ofrece certificado en este curso.</p>
                <p class="mt-1 text-xs text-muted">Los cursos nuevos nacen con el certificado apagado: es una opción por curso, como en la referencia.</p>
              </div>
              <USwitch v-model="courseForm.certificateEnabled" />
            </div>
          </UCard>
        </div>
      </div>
    </div>

    <!-- Confirmación de borrado -->
    <UModal :open="!!toDelete" title="Confirmar eliminación" @update:open="v => { if (!v) toDelete = null }">
      <template #body>
        <p class="text-sm">¿Eliminar <strong>{{ toDelete?.label }}</strong>? <span v-if="toDelete?.type === 'chapter'">Se borran también todas sus lecciones y el avance de los estudiantes en ellas.</span><span v-else>Se borra también el avance de los estudiantes en esta lección.</span> Esta acción no se puede deshacer.</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" color="neutral" variant="soft" @click="toDelete = null" />
          <UButton label="Eliminar" color="error" icon="i-lucide-trash-2" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
