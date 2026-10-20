<script setup lang="ts">
// Modal ÚNICO de canal (Fase 16-F): crear y editar viven acá, con el
// mismo lenguaje visual en todas las superficies que lo abren (la
// consola, el lateral, el encabezado de grupo y la página del
// canal) a través de useChannelEditor. Guarda contra LOS MISMOS
// endpoints de siempre (POST/PUT /api/admin/channels): no hay una
// segunda lógica de canales. Los ejes son independientes:
// contenido (Publicación/Imagen), visibilidad (Pública/Privada/
// Secreta) y acceso (Gratuito/Solo miembros/Pago + precio).
const { open, state, close } = useChannelEditor()
const { tenant } = useAuth()
const { t } = useI18n()
const api = useApi()
const toast = useToast()

const savedTick = useState('channel-editor-saved', () => 0)

interface GroupOpt { id: number, name: string }
const groups = ref<GroupOpt[]>([])
const form = reactive({
  name: '', description: '', contentType: 'post' as 'post' | 'image',
  visibility: 'public' as 'public' | 'private' | 'secret',
  access: 'free', price: 0, postPermission: 'members', groupId: 0,
  coverUrl: '', archived: false,
})
const saving = ref(false)
const uploadingCover = ref(false)
const priceInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

const isEdit = computed(() => state.value.mode === 'edit')
const currency = computed(() => tenant.value?.currency || 'USD')

async function loadGroups() {
  try {
    const data = await api<{ groups: { id: number, name: string }[] }>('/api/channels?includeArchived=1')
    groups.value = (data.groups || []).map(g => ({ id: g.id, name: g.name }))
  }
  catch { groups.value = [] }
}

watch(() => state.value.nonce, async () => {
  if (!open.value) return
  await loadGroups()
  const ch = state.value.channel
  if (state.value.mode === 'edit' && ch) {
    form.name = ch.name
    form.description = ch.description || ''
    form.contentType = ch.contentType
    form.visibility = ch.visibility
    form.access = ch.type
    form.price = (ch.priceCents || 0) / 100
    form.postPermission = ch.postPermission
    form.groupId = ch.groupId || groups.value[0]?.id || 0
    form.coverUrl = ch.coverUrl || ''
    form.archived = !!ch.archived
  }
  else {
    form.name = ''
    form.description = ''
    form.contentType = 'post'
    form.visibility = 'public'
    form.access = 'free'
    form.price = 0
    form.postPermission = 'members'
    form.groupId = state.value.presetGroupId || groups.value[0]?.id || 0
    form.coverUrl = ''
    form.archived = false
  }
  if (state.value.focusPrice) {
    form.access = 'paid'
    setTimeout(() => priceInput.value?.inputRef?.focus(), 350)
  }
}, { immediate: false })

watch(open, (v) => { if (v && !groups.value.length) loadGroups() })

const typeCards = computed(() => [
  { value: 'post' as const, icon: 'i-lucide-message-square-text', title: t('channelAdmin.typePost'), text: t('channelAdmin.typePostText') },
  { value: 'image' as const, icon: 'i-lucide-image', title: t('channelAdmin.typeImage'), text: t('channelAdmin.typeImageText') },
])
const visOptions = computed(() => [
  { value: 'public', label: t('channelAdmin.visPublic'), description: t('channelAdmin.visPublicText') },
  { value: 'private', label: t('channelAdmin.visPrivate'), description: t('channelAdmin.visPrivateText') },
  { value: 'secret', label: t('channelAdmin.visSecret'), description: t('channelAdmin.visSecretText') },
])
const accessOptions = computed(() => [
  { label: t('channelAdmin.accessFree'), value: 'free' },
  { label: t('channelAdmin.accessMembers'), value: 'private' },
  { label: t('channelAdmin.accessPaid'), value: 'paid' },
])
const postPermOptions = computed(() => [
  { label: t('channelAdmin.postPermMembers'), value: 'members' },
  { label: t('channelAdmin.postPermStaff'), value: 'staff' },
])
const groupOptions = computed(() => groups.value.map(g => ({ label: g.name, value: g.id })))

async function onCoverFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  uploadingCover.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'channel')
    const res = await api<{ url: string }>('/api/uploads', { method: 'POST', body: fd })
    form.coverUrl = res.url
  }
  catch (err) {
    toast.add({ title: t('channel.coverFailed'), description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploadingCover.value = false }
}

async function submit() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.access,
      priceCents: form.access === 'paid' ? Math.round(Number(form.price || 0) * 100) : 0,
      groupId: form.groupId || undefined,
      postPermission: form.postPermission,
      contentType: form.contentType,
      coverUrl: form.coverUrl,
      visibility: form.visibility,
      ...(isEdit.value ? { archived: form.archived } : {}),
    }
    if (isEdit.value && state.value.channel) {
      await api(`/api/admin/channels/${state.value.channel.id}`, { method: 'PUT', body: payload })
      toast.add({ title: t('channelAdmin.savedToast'), color: 'success' })
    }
    else {
      await api('/api/admin/channels', { method: 'POST', body: payload })
      toast.add({ title: t('channelAdmin.createdToast'), color: 'success' })
    }
    close()
    savedTick.value++
    await refreshNuxtData(['layout-channels', 'composer-channels', 'admin-channels'])
  }
  catch (e) {
    toast.add({ title: t('channelAdmin.saveFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { saving.value = false }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEdit ? t('channelAdmin.editTitle') : t('channelAdmin.createTitle')"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-5">
        <!-- Tipo de canal: dos tarjetas, como en la referencia -->
        <UFormField :label="t('channelAdmin.typeLabel')" required>
          <div class="grid gap-3 sm:grid-cols-2">
            <button
              v-for="card in typeCards" :key="card.value" type="button"
              class="rounded-lg border p-3 text-left transition"
              :class="form.contentType === card.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-default hover:bg-elevated'"
              @click="form.contentType = card.value"
            >
              <span class="flex items-center gap-2 font-semibold">
                <UIcon :name="card.icon" class="text-lg" /> {{ card.title }}
              </span>
              <span class="mt-1 block text-sm text-muted">{{ card.text }}</span>
            </button>
          </div>
        </UFormField>

        <UFormField :label="t('channelAdmin.nameLabel')" required>
          <UInput v-model="form.name" :placeholder="t('channelAdmin.namePlaceholder')" maxlength="80" class="w-full">
            <template #leading>
              <span class="font-semibold text-muted">#</span>
            </template>
          </UInput>
        </UFormField>

        <UFormField :label="t('channelAdmin.descLabel')">
          <UTextarea v-model="form.description" :rows="3" maxlength="280" :placeholder="t('channelAdmin.descPlaceholder')" class="w-full" />
          <p class="mt-1 text-right text-xs text-muted">{{ form.description.length }} / 280</p>
        </UFormField>

        <!-- Portada -->
        <UFormField :label="t('channelAdmin.coverLabel')" :hint="t('channelAdmin.coverHint')">
          <div v-if="form.coverUrl" class="relative overflow-hidden rounded-lg border border-default">
            <img :src="form.coverUrl" alt="" class="h-28 w-full object-cover">
            <UButton
              size="xs" color="neutral" variant="solid" icon="i-lucide-trash-2"
              :label="t('channelAdmin.coverRemove')" class="absolute right-2 bottom-2"
              @click="form.coverUrl = ''"
            />
          </div>
          <label v-else class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-default px-4 py-5 text-sm font-medium transition hover:bg-elevated">
            <UIcon name="i-lucide-image-plus" class="text-lg" />
            {{ t('channelAdmin.coverUpload') }}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="onCoverFile">
          </label>
          <p v-if="uploadingCover" class="mt-1 text-xs text-muted">…</p>
        </UFormField>

        <!-- Visibilidad: radios con explicación, como en la referencia -->
        <UFormField :label="t('channelAdmin.visibilityLabel')">
          <URadioGroup v-model="form.visibility" :items="visOptions" />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField :label="t('channelAdmin.accessLabel')">
            <USelect v-model="form.access" :items="accessOptions" class="w-full" />
          </UFormField>
          <UFormField v-if="form.access === 'paid'" :label="`${t('channelAdmin.priceLabel')} (${currency})`">
            <UInput ref="priceInput" v-model.number="form.price" type="number" min="0" step="0.01" class="w-full" />
          </UFormField>
          <UFormField :label="t('channelAdmin.postPermLabel')">
            <USelect v-model="form.postPermission" :items="postPermOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('channelAdmin.groupLabel')">
            <USelect v-model="form.groupId" :items="groupOptions" class="w-full" />
          </UFormField>
        </div>

        <UFormField v-if="isEdit" :label="t('channelAdmin.archivedLabel')" :hint="t('channelAdmin.archivedHint')">
          <USwitch v-model="form.archived" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="close" />
        <UButton
          :label="isEdit ? t('channelAdmin.save') : t('channelAdmin.create')"
          icon="i-lucide-check" :loading="saving" :disabled="!form.name.trim()"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
