<script setup lang="ts">
// Miembros de la consola (Fase 14): lista con rol, estado y
// etiquetas privadas; acciones de fila completas para el
// administrador (rol, etiquetas, enlace de acceso, suspender,
// restringir, quitar membresía) y alta manual. El moderador ve la
// misma lista en SOLO LECTURA: su trabajo es la moderación, no la
// gestión de cuentas — por eso no se le pintan controles que el
// servidor le negaría.
definePageMeta({ layout: 'admin' })
const { user, tenant } = useAuth()
const membersMenuItems = useMembersMenuItems()
const api = useApi()
const toast = useToast()
const { fmtDate, initials } = useFormat()

const isAdmin = computed(() => user.value?.role === 'admin')
const canView = computed(() => ['admin', 'moderator'].includes(user.value?.role || ''))

interface TagMini { id: number, name: string }
interface MemberRow { id: number, name: string, slug: string, email: string, avatarUrl: string, role: string, status: string, memberSince: string, points: number, level: string, tags: TagMini[] }
const tagFilter = ref(0)
const { data, refresh } = await useAsyncData('admin-members', () =>
  canView.value ? api<{ members: MemberRow[], tags: TagMini[] }>(`/api/admin/members${tagFilter.value ? `?tag=${tagFilter.value}` : ''}`) : Promise.resolve({ members: [] as MemberRow[], tags: [] as TagMini[] }), { watch: [tagFilter] })

const roleOptions = [
  { label: 'Miembro', value: 'member' },
  { label: 'Moderador', value: 'moderator' },
  { label: 'Encargado de cursos', value: 'course_manager' },
  { label: 'Administrador', value: 'admin' },
]
const roleLabels: Record<string, string> = { admin: 'Administrador', moderator: 'Moderador', course_manager: 'Encargado de cursos', member: 'Miembro' }
const statusMeta: Record<string, { label: string, color: 'success' | 'warning' | 'error' | 'neutral' }> = {
  active: { label: 'Activo', color: 'success' },
  pending: { label: 'En revisión', color: 'warning' },
  restricted: { label: 'Restringido', color: 'warning' },
  suspended: { label: 'Suspendido', color: 'error' },
  banned: { label: 'Baneado', color: 'error' },
  declined: { label: 'Rechazado', color: 'neutral' },
}

async function changeRole(m: MemberRow, role: string) {
  try {
    const res = await api<{ self: boolean }>(`/api/admin/members/${m.id}/role`, { method: 'POST', body: { role } })
    toast.add({ title: `Rol de ${m.name} actualizado a ${roleLabels[role] || role}`, color: 'success' })
    if (res.self) window.location.reload()
    else await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo cambiar el rol', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
    await refresh()
  }
}

async function changeStatus(m: MemberRow, status: string) {
  const reason = status === 'active' ? '' : window.prompt(`Motivo para ${status === 'banned' ? 'banear' : status === 'suspended' ? 'suspender' : 'restringir'} a ${m.name}`)?.trim()
  if (status !== 'active' && !reason) return
  try {
    await api(`/api/admin/members/${m.id}/status`, { method: 'POST', body: { status, reason } })
    toast.add({ title: status === 'active' ? `${m.name} volvió a estar activo` : status === 'banned' ? `${m.name} fue baneado` : status === 'suspended' ? `${m.name} fue suspendido` : `${m.name} fue restringido`, color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo cambiar el estado', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

// --- Etiquetas privadas ---
const tagEditorFor = ref<MemberRow | null>(null)
const tagSelection = ref<number[]>([])
function openTags(m: MemberRow) {
  tagEditorFor.value = m
  tagSelection.value = m.tags.map(t => t.id)
}
async function saveTags() {
  if (!tagEditorFor.value) return
  try {
    await api(`/api/admin/members/${tagEditorFor.value.id}/tags`, { method: 'POST', body: { tagIds: tagSelection.value } })
    toast.add({ title: 'Etiquetas guardadas', description: 'Solo las ve el equipo de administración.', color: 'success' })
    tagEditorFor.value = null
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudieron guardar las etiquetas', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}
const newTagName = ref('')
const creatingTag = ref(false)
async function createTag() {
  const name = newTagName.value.trim()
  if (!name) return
  creatingTag.value = true
  try {
    await api('/api/admin/tags', { method: 'POST', body: { name } })
    newTagName.value = ''
    toast.add({ title: `Etiqueta «${name}» creada`, color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo crear la etiqueta', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { creatingTag.value = false }
}
async function renameTag(tag: TagMini) {
  const name = window.prompt('Nuevo nombre para la etiqueta', tag.name)?.trim()
  if (!name || name === tag.name) return
  try {
    await api(`/api/admin/tags/${tag.id}`, { method: 'PUT', body: { name } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo renombrar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}
async function deleteTag(tag: TagMini) {
  if (!window.confirm(`¿Borrar la etiqueta «${tag.name}»? Se quita de todos los miembros que la tengan.`)) return
  try {
    await api(`/api/admin/tags/${tag.id}`, { method: 'DELETE' })
    if (tagFilter.value === tag.id) tagFilter.value = 0
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo borrar la etiqueta', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}

// --- Enlace de acceso ---
const accessResult = ref<{ name: string, url: string, emailStatus: string } | null>(null)
async function sendAccessLink(m: MemberRow) {
  try {
    const res = await api<{ url: string, emailStatus: string }>(`/api/admin/members/${m.id}/access-link`, { method: 'POST' })
    accessResult.value = { name: m.name, url: res.url, emailStatus: res.emailStatus }
  }
  catch (e) {
    toast.add({ title: 'No se pudo generar el enlace', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
}
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copiado', color: 'success' })
  }
  catch { toast.add({ title: 'No se pudo copiar', description: 'Copialo manualmente del texto.', color: 'error' }) }
}

// --- Alta manual ---
const createOpen = ref(false)
const createForm = reactive({ name: '', email: '' })
const creating = ref(false)
const createdResult = ref<{ name: string, email: string, tempPassword: string | null, created: boolean } | null>(null)
async function createMember() {
  creating.value = true
  try {
    const res = await api<{ created: boolean, tempPassword: string | null }>('/api/admin/members/create', { method: 'POST', body: { name: createForm.name, email: createForm.email } })
    createdResult.value = { name: createForm.name, email: createForm.email, tempPassword: res.tempPassword, created: res.created }
    createForm.name = ''
    createForm.email = ''
    createOpen.value = false
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo agregar el miembro', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { creating.value = false }
}

// --- Quitar membresía (existente) ---
const toRemove = ref<MemberRow | null>(null)
const removeReason = ref('')
const deleteTarget = ref<MemberRow | null>(null)
const deleteContent = ref<'anonymize' | 'delete'>('anonymize')
const deleteConfirmation = ref('')
const deletingAccount = ref(false)
const removing = ref(false)
async function removeMember() {
  if (!toRemove.value) return
  if (removeReason.value.trim().length > 500) return
  removing.value = true
  try {
    const res = await api<{ self: boolean }>(`/api/admin/members/${toRemove.value.id}/remove`, { method: 'POST', body: { reason: removeReason.value.trim() } })
    toast.add({ title: 'Membresía quitada', color: 'success' })
    toRemove.value = null
    removeReason.value = ''
    if (res.self) window.location.href = '/feeds'
    else await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo quitar la membresía', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { removing.value = false }
}

function rowMenuItems(m: MemberRow) {
  const items: Record<string, unknown>[][] = [[
    { label: 'Ver perfil', icon: 'i-lucide-user', to: `/profile/${m.slug}` },
    { label: 'Etiquetas…', icon: 'i-lucide-tags', onSelect: () => openTags(m) },
    { label: 'Enviar enlace de acceso', icon: 'i-lucide-key-round', onSelect: () => sendAccessLink(m), disabled: m.status !== 'active' },
  ]]
  const stateItems: Record<string, unknown>[] = []
  if (m.status === 'suspended' || m.status === 'restricted' || m.status === 'banned')
    stateItems.push({ label: 'Reactivar', icon: 'i-lucide-user-check', onSelect: () => changeStatus(m, 'active') })
  if (m.status !== 'restricted' && m.status !== 'pending' && m.status !== 'banned')
    stateItems.push({ label: 'Restringir (solo lectura)', icon: 'i-lucide-eye-off', onSelect: () => changeStatus(m, 'restricted') })
  if (m.status !== 'suspended' && m.status !== 'banned')
    stateItems.push({ label: 'Suspender', icon: 'i-lucide-ban', onSelect: () => changeStatus(m, 'suspended') })
  if (m.status !== 'banned' && m.status !== 'pending')
    stateItems.push({ label: 'Banear permanentemente', icon: 'i-lucide-shield-ban', color: 'error', onSelect: () => changeStatus(m, 'banned') })
  if (stateItems.length) items.push(stateItems)
  items.push([{ label: 'Quitar membresía', icon: 'i-lucide-user-x', color: 'error', onSelect: () => { toRemove.value = m } }])
  if (isAdmin.value) items.push([{ label: 'Eliminar cuenta…', icon: 'i-lucide-user-round-x', color: 'error', onSelect: () => { deleteTarget.value = m; deleteContent.value = 'anonymize' } }])
  return items
}

async function deleteAccount() {
  if (!deleteTarget.value) return
  deletingAccount.value = true
  try {
    const res = await api<{ self: boolean }>(`/api/admin/members/${deleteTarget.value.id}/delete-account`, { method: 'POST', body: { content: deleteContent.value, confirmation: deleteConfirmation.value } })
    toast.add({ title: 'Cuenta anonimizada y eliminada', description: deleteContent.value === 'delete' ? 'También se eliminó el contenido de la persona.' : 'Se conservaron sus publicaciones y comentarios sin identificarla.', color: 'success' })
    deleteTarget.value = null
    deleteConfirmation.value = ''
    if (res.self) window.location.href = '/login'
    else await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo eliminar la cuenta', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { deletingAccount.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Miembros</h1>
        <p class="text-muted">Personas con membresía en {{ tenant?.name }}: roles, estado y etiquetas privadas.</p>
      </div>
      <div v-if="isAdmin" class="flex flex-wrap gap-2">
        <UButton to="/admin/members/invitations" color="neutral" variant="soft" icon="i-lucide-mail-plus" label="Invitar" />
        <UButton icon="i-lucide-user-plus" label="Agregar miembro" @click="createOpen = true" />
      </div>
    </div>
    <UAlert v-if="user && !canView" color="warning" variant="soft" title="Sin acceso" description="Esta sección es para administradores y moderadores de la comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta del equipo" />
    <template v-else>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
      <AdminSubMenu :items="membersMenuItems" />
      <div class="min-w-0 flex-1 space-y-5">
      <UAlert v-if="!isAdmin" color="neutral" variant="soft" icon="i-lucide-eye" title="Vista de solo lectura" description="Como moderador ves la lista de miembros; los roles, estados y etiquetas los gestiona un administrador." />

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-muted">Filtrar por etiqueta:</span>
        <USelect
          :model-value="tagFilter" size="sm" class="w-52"
          :items="[{ label: 'Todas las personas', value: 0 }, ...(data?.tags || []).map(t => ({ label: t.name, value: t.id }))]"
          @update:model-value="(v: number) => { tagFilter = v }"
        />
        <span class="text-sm text-muted">{{ data?.members.length || 0 }} personas</span>
      </div>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="m in data?.members || []" :key="m.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
            <UAvatar :src="m.avatarUrl || undefined" :text="initials(m.name)" />
            <div class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <NuxtLink :to="`/profile/${m.slug}`" class="font-semibold hover:underline">{{ m.name }}</NuxtLink>
                <UBadge :color="statusMeta[m.status]?.color || 'neutral'" variant="subtle" size="sm">{{ statusMeta[m.status]?.label || m.status }}</UBadge>
                <UBadge v-for="t in m.tags" :key="t.id" color="neutral" variant="outline" size="sm">
                  <UIcon name="i-lucide-tag" /> {{ t.name }}
                </UBadge>
              </span>
              <p class="truncate text-xs text-muted">{{ m.email }} · miembro desde {{ fmtDate(m.memberSince) }} · {{ m.points }} pts · Nivel {{ m.level }}</p>
            </div>
            <template v-if="isAdmin">
              <USelect :model-value="m.role" :items="roleOptions" size="sm" class="w-44" @update:model-value="(v: string) => changeRole(m, v)" />
              <UDropdownMenu :items="rowMenuItems(m)">
                <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" aria-label="Acciones del miembro" />
              </UDropdownMenu>
            </template>
            <UBadge v-else color="neutral" variant="subtle" size="sm">{{ roleLabels[m.role] || m.role }}</UBadge>
          </li>
          <li v-if="!(data?.members || []).length" class="px-4 py-8 text-center text-sm text-muted">
            No hay personas para mostrar{{ tagFilter ? ' con esa etiqueta' : '' }}.
          </li>
        </ul>
      </UCard>

      <UCard v-if="isAdmin">
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-tags" /> Etiquetas privadas</h2>
        </template>
        <p class="mb-3 text-sm text-muted">
          Etiquetas internas del equipo (por ejemplo «VIP» o «En riesgo»). Los miembros NUNCA las ven:
          no aparecen en su perfil ni en ninguna pantalla de la comunidad; sirven para organizar y filtrar esta lista.
        </p>
        <div class="flex flex-wrap gap-2">
          <UBadge v-for="t in data?.tags || []" :key="t.id" color="neutral" variant="subtle" size="lg" class="gap-1.5">
            {{ t.name }}
            <button type="button" class="hover:text-primary" title="Renombrar" @click="renameTag(t)"><UIcon name="i-lucide-pencil" /></button>
            <button type="button" class="hover:text-error" title="Borrar etiqueta" @click="deleteTag(t)"><UIcon name="i-lucide-x" /></button>
          </UBadge>
          <span v-if="!(data?.tags || []).length" class="text-sm text-muted">Todavía no hay etiquetas.</span>
        </div>
        <form class="mt-4 flex max-w-md gap-2" @submit.prevent="createTag">
          <UInput v-model="newTagName" placeholder="Nombre de la etiqueta nueva" maxlength="40" class="flex-1" />
          <UButton type="submit" label="Crear etiqueta" icon="i-lucide-plus" :loading="creatingTag" :disabled="!newTagName.trim()" />
        </form>
      </UCard>

      <!-- Asignar etiquetas a un miembro -->
      <UModal :open="!!tagEditorFor" title="Etiquetas del miembro" :description="tagEditorFor ? `Etiquetas privadas de ${tagEditorFor.name}. Solo las ve el equipo.` : ''" @update:open="(v: boolean) => { if (!v) tagEditorFor = null }">
        <template #body>
          <div v-if="(data?.tags || []).length" class="space-y-2">
            <label v-for="t in data?.tags || []" :key="t.id" class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-default px-3 py-2 hover:bg-elevated">
              <UCheckbox :model-value="tagSelection.includes(t.id)" @update:model-value="(v: boolean | 'indeterminate') => { tagSelection = v === true ? [...tagSelection, t.id] : tagSelection.filter(id => id !== t.id) }" />
              <span class="text-sm font-medium">{{ t.name }}</span>
            </label>
          </div>
          <p v-else class="text-sm text-muted">Todavía no hay etiquetas creadas. Creá la primera en la tarjeta «Etiquetas privadas» de esta página.</p>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="tagEditorFor = null" />
            <UButton label="Guardar etiquetas" icon="i-lucide-save" @click="saveTags" />
          </div>
        </template>
      </UModal>

      <!-- Enlace de acceso generado -->
      <UModal :open="!!accessResult" title="Enlace de acceso" @update:open="(v: boolean) => { if (!v) accessResult = null }">
        <template #body>
          <div v-if="accessResult" class="space-y-3">
            <p class="text-sm">Enlace de un solo uso para que <strong>{{ accessResult.name }}</strong> entre sin contraseña. Vence en 1 hora.</p>
            <UAlert
              v-if="accessResult.emailStatus !== 'sent'" color="warning" variant="soft" icon="i-lucide-mail-warning"
              title="El correo no salió"
              description="No hay un proveedor de correo configurado, así que el envío quedó registrado como no enviado. Copiá el enlace y pasáselo a la persona por otro medio."
            />
            <UAlert v-else color="success" variant="soft" icon="i-lucide-mail-check" title="Correo enviado" description="El enlace también va en camino por correo." />
            <div class="flex items-center gap-2">
              <UInput :model-value="accessResult.url" readonly class="flex-1" />
              <UButton icon="i-lucide-copy" label="Copiar" @click="copyText(accessResult.url)" />
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end">
            <UButton color="neutral" variant="ghost" label="Cerrar" @click="accessResult = null" />
          </div>
        </template>
      </UModal>

      <!-- Alta manual -->
      <UModal :open="createOpen" title="Agregar miembro manualmente" description="Se crea la cuenta con una contraseña temporal que se muestra una sola vez: pasásela a la persona para que entre y la cambie." @update:open="(v: boolean) => { createOpen = v }">
        <template #body>
          <form class="space-y-4" @submit.prevent="createMember">
            <UFormField label="Nombre">
              <UInput v-model="createForm.name" required placeholder="Nombre y apellido" class="w-full" />
            </UFormField>
            <UFormField label="Correo electrónico">
              <UInput v-model="createForm.email" type="email" required placeholder="persona@correo.com" class="w-full" />
            </UFormField>
            <UButton type="submit" block label="Crear cuenta" :loading="creating" :disabled="!createForm.name.trim() || !createForm.email.trim()" />
          </form>
        </template>
      </UModal>

      <!-- Resultado del alta: contraseña temporal (una sola vez) -->
      <UModal :open="!!createdResult" title="Cuenta creada" @update:open="(v: boolean) => { if (!v) createdResult = null }">
        <template #body>
          <div v-if="createdResult" class="space-y-3">
            <template v-if="createdResult.created && createdResult.tempPassword">
              <p class="text-sm"><strong>{{ createdResult.name }}</strong> ya es miembro. Su contraseña temporal es:</p>
              <div class="flex items-center gap-2">
                <code class="flex-1 rounded-md bg-elevated px-3 py-2 text-center font-mono text-lg font-bold">{{ createdResult.tempPassword }}</code>
                <UButton icon="i-lucide-copy" label="Copiar" @click="copyText(createdResult.tempPassword || '')" />
              </div>
              <UAlert color="warning" variant="soft" icon="i-lucide-triangle-alert" title="Se muestra una sola vez" description="No queda guardada en claro en ningún lado. Pasásela a la persona por un medio seguro y pedile que la cambie desde sus ajustes de cuenta." />
            </template>
            <p v-else class="text-sm">Ese correo ya tenía cuenta: <strong>{{ createdResult.name }}</strong> se sumó como miembro activo con su contraseña de siempre.</p>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end">
            <UButton label="Entendido" @click="createdResult = null" />
          </div>
        </template>
      </UModal>

      <UModal :open="!!deleteTarget" title="Eliminar cuenta" :description="deleteTarget ? `La cuenta de ${deleteTarget.name} se anonimizará en toda la plataforma y no podrá iniciar sesión. Esta acción no se puede deshacer.` : ''" @update:open="(v: boolean) => { if (!v) { deleteTarget = null; deleteConfirmation = '' } }">
        <template #body>
          <div class="space-y-4">
            <UAlert color="warning" variant="soft" icon="i-lucide-triangle-alert" title="Eliminación global" description="Se quitará la identidad personal del usuario en todas las comunidades; los pagos y certificados conservarán sus datos operativos con el nombre anonimizado." />
            <UFormField label="Qué hacer con su contenido">
              <USelect v-model="deleteContent" class="w-full" :items="[{ label: 'Conservar publicaciones y comentarios, anonimizar autoría', value: 'anonymize' }, { label: 'Borrar publicaciones, comentarios y adjuntos propios', value: 'delete' }]" />
            </UFormField>
            <p class="text-xs text-muted">La opción se aplica a todas sus comunidades. Los mensajes privados se eliminan en ambas opciones. Los adjuntos referenciados desde otros elementos se conservan.</p>
            <UFormField label="Escribe ELIMINAR para confirmar">
              <UInput v-model="deleteConfirmation" class="w-full" autocomplete="off" />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="deleteTarget = null" />
            <UButton color="error" icon="i-lucide-user-round-x" label="Eliminar cuenta" :loading="deletingAccount" :disabled="deleteConfirmation !== 'ELIMINAR'" @click="deleteAccount" />
          </div>
        </template>
      </UModal>

      <UModal :open="!!toRemove" title="Quitar membresía" :description="toRemove ? `${toRemove.name} dejará de ser miembro de esta comunidad. Su cuenta y su contenido no se borran. Esta acción no impide que vuelva a solicitar acceso.` : ''" @update:open="(v: boolean) => { if (!v) { toRemove = null; removeReason = '' } }">
        <template #footer>
          <div class="flex justify-end gap-2">
            <UInput v-model="removeReason" class="mr-auto w-72" maxlength="500" placeholder="Motivo (opcional)" />
            <UButton color="neutral" variant="ghost" label="Cancelar" @click="toRemove = null" />
            <UButton color="error" label="Sí, quitar membresía" icon="i-lucide-user-x" :loading="removing" @click="removeMember" />
          </div>
        </template>
      </UModal>
      </div>
      </div>
    </template>
  </div>
</template>
