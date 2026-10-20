<script setup lang="ts">
// Anfitrión de la administración de canales en contexto (Fase
// 16-F): vive una sola vez en el layout de miembro y renderiza los
// modales que abren los menús «⋯» de canales y grupos — gestionar
// miembros (acceso concedido), eliminar canal (con la cascada del
// servidor), crear/editar grupo y eliminar grupo (los canales
// pasan al grupo por defecto; ninguno se borra).
const {
  membersFor, deleteChannelFor, groupModal, deleteGroupFor,
  closeMembers, closeDeleteChannel, closeGroupModal, closeDeleteGroup, notifyChanged,
} = useChannelAdmin()
const { t } = useI18n()
const api = useApi()
const toast = useToast()
const route = useRoute()

// ---------- Gestionar miembros ----------
interface MemberRow { id: number, name: string, slug: string, avatarUrl: string, role: string, hasAccess: boolean, accessSource: string }
const members = ref<MemberRow[]>([])
const membersLoading = ref(false)
const membersError = ref(false)
const memberQuery = ref('')
const memberBusy = ref(0)

watch(membersFor, async (ch) => {
  memberQuery.value = ''
  members.value = []
  membersError.value = false
  if (!ch) return
  membersLoading.value = true
  try {
    const data = await api<{ members: MemberRow[] }>(`/api/admin/channels/${ch.id}/members`)
    members.value = data.members || []
  }
  catch { membersError.value = true }
  finally { membersLoading.value = false }
})

const membersFiltered = computed(() => {
  const q = memberQuery.value.trim().toLowerCase()
  const list = q ? members.value.filter(m => m.name.toLowerCase().includes(q)) : members.value
  return [...list].sort((a, b) => Number(b.hasAccess) - Number(a.hasAccess) || a.name.localeCompare(b.name))
})

async function toggleAccess(m: MemberRow) {
  const ch = membersFor.value
  if (!ch) return
  memberBusy.value = m.id
  try {
    if (m.hasAccess) await api(`/api/admin/channels/${ch.id}/members/${m.id}`, { method: 'DELETE' })
    else await api(`/api/admin/channels/${ch.id}/members`, { method: 'POST', body: { userId: m.id } })
    m.hasAccess = !m.hasAccess
    toast.add({ title: t('channelAdmin.membersUpdated'), color: 'success' })
    notifyChanged()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: t('channelAdmin.membersFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { memberBusy.value = 0 }
}

// ---------- Eliminar canal ----------
const deleting = ref(false)
async function confirmDeleteChannel() {
  const ch = deleteChannelFor.value
  if (!ch) return
  deleting.value = true
  try {
    await api(`/api/admin/channels/${ch.id}`, { method: 'DELETE' })
    toast.add({ title: t('channel.deleted'), color: 'success' })
    closeDeleteChannel()
    notifyChanged()
    await refreshNuxtData(['layout-channels', 'composer-channels', 'admin-channels'])
    if (route.path === `/channels/${ch.slug}`) await navigateTo('/feeds')
  }
  catch (e) {
    toast.add({ title: t('channel.deleteFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { deleting.value = false }
}

// ---------- Grupos: crear / editar ----------
const groupForm = reactive({ name: '', sort: 0 })
const groupSaving = ref(false)
watch(groupModal, (gm) => {
  if (!gm) return
  groupForm.name = gm.group?.name || ''
  groupForm.sort = gm.group?.sort ?? 0
})
async function saveGroup() {
  const gm = groupModal.value
  if (!gm || !groupForm.name.trim()) return
  groupSaving.value = true
  try {
    if (gm.mode === 'edit' && gm.group)
      await api(`/api/admin/channel-groups/${gm.group.id}`, { method: 'PUT', body: { name: groupForm.name.trim(), sort: groupForm.sort } })
    else
      await api('/api/admin/channel-groups', { method: 'POST', body: { name: groupForm.name.trim() } })
    toast.add({ title: t('channelAdmin.groupSaved'), color: 'success' })
    closeGroupModal()
    notifyChanged()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: t('channelAdmin.groupSaveFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { groupSaving.value = false }
}

// ---------- Grupos: eliminar ----------
const deletingGroup = ref(false)
async function confirmDeleteGroup() {
  const g = deleteGroupFor.value
  if (!g) return
  deletingGroup.value = true
  try {
    await api(`/api/admin/channel-groups/${g.id}`, { method: 'DELETE' })
    toast.add({ title: t('channelAdmin.groupDeleted'), color: 'success' })
    closeDeleteGroup()
    notifyChanged()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: t('channelAdmin.groupDeleteFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { deletingGroup.value = false }
}

const membersOpen = computed({
  get: () => !!membersFor.value,
  set: (v: boolean) => { if (!v) closeMembers() },
})
const deleteChannelOpen = computed({
  get: () => !!deleteChannelFor.value,
  set: (v: boolean) => { if (!v) closeDeleteChannel() },
})
const groupModalOpen = computed({
  get: () => !!groupModal.value,
  set: (v: boolean) => { if (!v) closeGroupModal() },
})
const deleteGroupOpen = computed({
  get: () => !!deleteGroupFor.value,
  set: (v: boolean) => { if (!v) closeDeleteGroup() },
})
</script>

<template>
  <div>
    <!-- Gestionar miembros: acceso concedido por miembro -->
    <UModal v-model:open="membersOpen" :title="`${t('channelAdmin.membersTitle')} · # ${membersFor?.name || ''}`" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <p class="text-sm text-muted">{{ t('channelAdmin.membersNote') }}</p>
        <UInput v-model="memberQuery" icon="i-lucide-search" :placeholder="t('channelAdmin.membersSearch')" class="mt-4 w-full" />
        <p v-if="membersLoading" class="py-8 text-center text-sm text-muted">…</p>
        <UAlert v-else-if="membersError" color="error" variant="soft" icon="i-lucide-triangle-alert" :title="t('channelAdmin.membersLoadFailed')" class="mt-4" />
        <p v-else-if="!membersFiltered.length" class="py-6 text-center text-sm text-muted">{{ t('channelAdmin.membersEmpty') }}</p>
        <ul v-else class="mt-4 divide-y divide-default">
          <li v-for="m in membersFiltered" :key="m.id" class="flex items-center gap-3 py-2.5">
            <UAvatar :src="m.avatarUrl || undefined" :alt="m.name" size="sm" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ m.name }}</p>
              <p class="text-xs" :class="m.hasAccess ? 'text-success' : 'text-muted'">
                {{ m.hasAccess ? t('channelAdmin.membersWithAccess') : t('channelAdmin.membersWithoutAccess') }}
              </p>
            </div>
            <UButton
              size="xs" :color="m.hasAccess ? 'error' : 'primary'" :variant="m.hasAccess ? 'soft' : 'solid'"
              :label="m.hasAccess ? t('channelAdmin.membersRevoke') : t('channelAdmin.membersGrant')"
              :loading="memberBusy === m.id"
              @click="toggleAccess(m)"
            />
          </li>
        </ul>
      </template>
    </UModal>

    <!-- Eliminar canal -->
    <UModal v-model:open="deleteChannelOpen" :title="t('channel.deleteTitle')">
      <template #body>
        <p class="text-sm">{{ t('channel.deleteText', { name: deleteChannelFor?.name || '' }) }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="closeDeleteChannel" />
          <UButton color="error" icon="i-lucide-trash-2" :label="t('channel.deleteConfirm')" :loading="deleting" @click="confirmDeleteChannel" />
        </div>
      </template>
    </UModal>

    <!-- Crear / editar grupo -->
    <UModal
      v-model:open="groupModalOpen"
      :title="groupModal?.mode === 'edit' ? t('channelAdmin.groupEditTitle') : t('channelAdmin.groupCreateTitle')"
    >
      <template #body>
        <div class="space-y-3">
          <UFormField :label="t('channelAdmin.groupNameLabel')" required>
            <UInput v-model="groupForm.name" maxlength="60" class="w-full" />
          </UFormField>
          <UFormField v-if="groupModal?.mode === 'edit'" :label="t('channelAdmin.groupSortLabel')">
            <UInput v-model.number="groupForm.sort" type="number" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="closeGroupModal" />
          <UButton icon="i-lucide-check" :label="t('channelAdmin.save')" :loading="groupSaving" :disabled="!groupForm.name.trim()" @click="saveGroup" />
        </div>
      </template>
    </UModal>

    <!-- Eliminar grupo -->
    <UModal v-model:open="deleteGroupOpen" :title="t('channelAdmin.groupDeleteTitle')">
      <template #body>
        <p class="text-sm">{{ t('channelAdmin.groupDeleteText', { name: deleteGroupFor?.name || '', fallback: deleteGroupFor?.fallbackName || '' }) }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="closeDeleteGroup" />
          <UButton color="error" icon="i-lucide-trash-2" :label="t('channelAdmin.groupDelete')" :loading="deletingGroup" @click="confirmDeleteGroup" />
        </div>
      </template>
    </UModal>
  </div>
</template>
