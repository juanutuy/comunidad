<script setup lang="ts">
// Ajustes de cuenta como MODAL (Fase 11), como el «Profile Settings»
// de la referencia: navegación vertical de secciones a la izquierda y
// el contenido a la derecha, sin salir de la página. Reutiliza los
// mismos endpoints de siempre (/api/settings, /api/settings/profile,
// /api/settings/prefs, /api/settings/password, /api/settings/social,
// /api/uploads): la lógica es la que vivía en la página /settings,
// que desde esta fase redirige a este modal.
//
// Este es el ÚNICO editor de perfil: su sección «Perfil» edita
// nombre, bio, ubicación, sitio web y las fotos de avatar y portada.
// El botón «Editar perfil» y el botón de portada de la página de
// perfil solo abren este modal en esa sección (los modales propios
// que el perfil tenía desde la Fase 9 se retiraron para no duplicar
// la edición de los mismos datos).
const { open, section, closeSettings } = useUserSettings()
const { user, fetchMe } = useAuth()
const { t, userLocale, tenantDefaultLocale, setUserLocale } = useI18n()
const api = useApi()
const toast = useToast()
const isPhone = useIsPhone()

const sections = computed(() => [
  { value: 'perfil' as const, label: t('settings.sectionProfile'), icon: 'i-lucide-user' },
  { value: 'notificaciones' as const, label: t('settings.sectionNotifications'), icon: 'i-lucide-bell' },
  { value: 'privacidad' as const, label: t('settings.sectionPrivacy'), icon: 'i-lucide-eye' },
  { value: 'bloqueos' as const, label: t('settings.sectionBlocked'), icon: 'i-lucide-ban' },
  { value: 'idioma' as const, label: t('settings.sectionLanguage'), icon: 'i-lucide-languages' },
  { value: 'seguridad' as const, label: t('settings.sectionSecurity'), icon: 'i-lucide-shield' },
])

interface SettingsData {
  profile: { name: string, bio: string, location: string, email: string, avatarUrl: string, coverUrl: string, website: string }
  prefs: Record<string, boolean>
}
interface SocialData {
  blocked: { id: number, name: string, slug: string, avatarUrl: string, createdAt: string }[]
  hidden: { id: number, title: string, slug: string, channelSlug: string, channelName: string, authorName: string, createdAt: string }[]
}

const data = ref<SettingsData | null>(null)
const social = ref<SocialData>({ blocked: [], hidden: [] })
const loading = ref(false)

const profile = reactive({ name: '', bio: '', location: '', website: '' })
const prefs = reactive<Record<string, boolean>>({
  notify_reaction: true, notify_comment: true, notify_mention: true, notify_new_post: true, notify_dm: true, notify_follow: true,
  directory_visible: true, show_in_search: true,
})

async function load() {
  if (!user.value) return
  loading.value = true
  try {
    const [settings, socialData] = await Promise.all([
      api<SettingsData>('/api/settings'),
      api<SocialData>('/api/settings/social'),
    ])
    data.value = settings
    social.value = socialData
    profile.name = settings.profile.name
    profile.bio = settings.profile.bio
    profile.location = settings.profile.location
    profile.website = settings.profile.website
    Object.assign(prefs, settings.prefs)
  }
  catch { toast.add({ title: t('settings.loadFailed'), color: 'error' }) }
  finally { loading.value = false }
}
// Los datos se cargan al abrir (no en cada página): el modal vive en
// el layout, pero la sesión ya está resuelta cuando se lo invoca.
watch(open, (isOpen) => { if (isOpen) { load(); langChoice.value = userLocale.value ?? 'default' } })

// Fase 18: sección «Idioma» — la elección personal del usuario
// ('default' = seguir el defecto de la comunidad). Guardar persiste
// en el servidor (PUT /api/settings/locale) y aplica al instante en
// toda la interfaz (las cadenas pasan por t() de forma reactiva).
const langChoice = ref<'default' | 'es' | 'en'>('default')
const langItems = computed(() => [
  {
    value: 'default' as const,
    label: t('settings.langCommunityDefault'),
    description: t('settings.langCommunityDefaultText', { language: tenantDefaultLocale.value === 'en' ? t('settings.langEnglish') : t('settings.langSpanish') }),
  },
  { value: 'es' as const, label: t('settings.langSpanish') },
  { value: 'en' as const, label: t('settings.langEnglish') },
])
const savingLang = ref(false)
async function saveLanguage() {
  savingLang.value = true
  try {
    await setUserLocale(langChoice.value === 'default' ? null : langChoice.value)
    toast.add({ title: t('settings.languageSaved'), color: 'success' })
    await fetchMe()
  }
  catch { toast.add({ title: t('settings.languageFailed'), color: 'error' }) }
  finally { savingLang.value = false }
}

const savingProfile = ref(false)
async function saveProfile() {
  savingProfile.value = true
  try {
    await api('/api/settings/profile', { method: 'PUT', body: { ...profile } })
    toast.add({ title: t('settings.profileSaved'), color: 'success' })
    await fetchMe()
    await load()
  }
  catch (e) {
    toast.add({ title: t('settings.saveFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { savingProfile.value = false }
}

const uploadingAvatar = ref(false)
async function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingAvatar.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'avatar')
    await api('/api/uploads', { method: 'POST', body: fd })
    toast.add({ title: t('settings.avatarUpdated'), color: 'success' })
    await fetchMe()
    await load()
  }
  catch (err) {
    toast.add({ title: t('settings.avatarFailed'), description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploadingAvatar.value = false }
}

const uploadingCover = ref(false)
async function onCoverChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingCover.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'cover')
    await api('/api/uploads', { method: 'POST', body: fd })
    toast.add({ title: t('settings.coverUpdated'), color: 'success' })
    await fetchMe()
    await load()
  }
  catch (err) {
    toast.add({ title: t('settings.coverFailed'), description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploadingCover.value = false }
}
async function removeCover() {
  try {
    await api('/api/settings/profile', { method: 'PUT', body: { ...profile, coverUrl: '' } })
    toast.add({ title: t('settings.coverRemoved'), description: t('settings.coverRemovedText'), color: 'success' })
    await fetchMe()
    await load()
  }
  catch { toast.add({ title: t('settings.coverRemoveFailed'), color: 'error' }) }
}

const savingPrefs = ref(false)
async function savePrefs() {
  savingPrefs.value = true
  try {
    await api('/api/settings/prefs', { method: 'PUT', body: { ...prefs } })
    toast.add({ title: t('settings.prefsSaved'), color: 'success' })
  }
  catch { toast.add({ title: t('settings.prefsFailed'), color: 'error' }) }
  finally { savingPrefs.value = false }
}

const pw = reactive({ current: '', next: '', confirm: '' })
const savingPw = ref(false)
async function changePassword() {
  savingPw.value = true
  try {
    await api('/api/settings/password', { method: 'POST', body: { ...pw } })
    pw.current = ''; pw.next = ''; pw.confirm = ''
    toast.add({ title: t('settings.pwUpdated'), description: t('settings.pwUpdatedText'), color: 'success' })
  }
  catch (e) {
    toast.add({ title: t('settings.pwFailed'), description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { savingPw.value = false }
}

async function unblock(slugToUnblock: string) {
  try {
    await api(`/api/users/${slugToUnblock}/block`, { method: 'DELETE' })
    toast.add({ title: t('settings.unblockedToast'), color: 'success' })
    social.value = await api<SocialData>('/api/settings/social')
  }
  catch { toast.add({ title: t('settings.unblockFailed'), color: 'error' }) }
}
async function unhide(postId: number) {
  try {
    await api(`/api/posts/${postId}/hide`, { method: 'DELETE' })
    toast.add({ title: t('settings.unhiddenToast'), color: 'success' })
    social.value = await api<SocialData>('/api/settings/social')
  }
  catch { toast.add({ title: t('settings.unhideFailed'), color: 'error' }) }
}

const notifyItems = computed(() => [
  { key: 'notify_reaction', label: t('settings.notifyReaction'), icon: 'i-lucide-heart' },
  { key: 'notify_comment', label: t('settings.notifyComment'), icon: 'i-lucide-message-circle' },
  { key: 'notify_mention', label: t('settings.notifyMention'), icon: 'i-lucide-at-sign' },
  { key: 'notify_new_post', label: t('settings.notifyNewPost'), icon: 'i-lucide-pen-square' },
  { key: 'notify_dm', label: t('settings.notifyDm'), icon: 'i-lucide-mail' },
  { key: 'notify_follow', label: t('settings.notifyFollow'), icon: 'i-lucide-user-plus' },
])
</script>

<template>
  <UModal v-model:open="open" :fullscreen="isPhone" :ui="{ content: 'sm:max-w-3xl' }">
    <template #content>
      <div class="flex max-h-[inherit] flex-col">
        <div class="flex items-center gap-2 border-b border-default px-4 py-3">
          <h2 class="flex-1 text-base font-bold">{{ t('settings.title') }}</h2>
          <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('settings.closeSettings')" @click="closeSettings" />
        </div>

        <div class="flex min-h-0 flex-1 flex-col sm:flex-row">
          <!-- Secciones: fila deslizable en teléfono, columna desde sm. -->
          <nav class="shrink-0 overflow-x-auto border-b border-default sm:w-52 sm:overflow-visible sm:border-r sm:border-b-0" :aria-label="t('settings.navLabel')">
            <ul class="flex gap-1 p-2 sm:flex-col">
              <li v-for="s in sections" :key="s.value" class="shrink-0 sm:shrink">
                <button
                  type="button"
                  class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm whitespace-nowrap transition"
                  :class="section === s.value ? 'bg-elevated font-semibold text-highlighted' : 'text-muted hover:bg-elevated'"
                  @click="section = s.value"
                >
                  <UIcon :name="s.icon" class="shrink-0" /> {{ s.label }}
                </button>
              </li>
            </ul>
          </nav>

          <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <p v-if="loading" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-loader-circle" class="animate-spin" /> {{ t('settings.loading') }}
            </p>

            <!-- Perfil -->
            <div v-else-if="section === 'perfil'" class="space-y-4">
              <div class="flex items-center gap-3">
                <UAvatar :src="data?.profile.avatarUrl || undefined" :text="(profile.name || 'U').charAt(0)" size="lg" />
                <label class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary hover:underline">
                  <UIcon name="i-lucide-camera" />
                  {{ uploadingAvatar ? t('settings.uploading') : t('settings.changePhoto') }}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" :disabled="uploadingAvatar" @change="onAvatarChange">
                </label>
              </div>
              <div>
                <p class="mb-2 text-sm font-medium">{{ t('settings.coverPhoto') }}</p>
                <div class="relative h-28 overflow-hidden rounded-lg bg-gradient-to-r from-primary/60 to-primary/20">
                  <img v-if="data?.profile.coverUrl" :src="data.profile.coverUrl" :alt="t('settings.yourCoverAlt')" class="h-full w-full object-cover">
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-3">
                  <label class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary hover:underline">
                    <UIcon name="i-lucide-image" />
                    {{ uploadingCover ? t('settings.uploading') : t('settings.changeCover') }}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" :disabled="uploadingCover" @change="onCoverChange">
                  </label>
                  <UButton v-if="data?.profile.coverUrl" size="sm" color="neutral" variant="ghost" icon="i-lucide-trash-2" :label="t('settings.removeCover')" @click="removeCover" />
                </div>
              </div>
              <UFormField :label="t('settings.nameLabel')">
                <UInput v-model="profile.name" class="w-full" />
              </UFormField>
              <UFormField :label="t('settings.emailLabel')">
                <UInput :model-value="data?.profile.email || ''" disabled class="w-full" />
              </UFormField>
              <UFormField :label="t('settings.bioLabel')">
                <UTextarea v-model="profile.bio" :rows="3" maxlength="500" class="w-full" />
              </UFormField>
              <UFormField :label="t('settings.locationLabel')">
                <UInput v-model="profile.location" class="w-full" />
              </UFormField>
              <UFormField :label="t('settings.websiteLabel')" :hint="t('settings.websiteHint')">
                <UInput v-model="profile.website" class="w-full" placeholder="tusitioweb.com" icon="i-lucide-globe" />
              </UFormField>
              <div class="flex justify-end">
                <UButton :label="t('settings.saveProfile')" icon="i-lucide-save" :loading="savingProfile" :disabled="!profile.name.trim()" @click="saveProfile" />
              </div>
            </div>

            <!-- Notificaciones -->
            <div v-else-if="section === 'notificaciones'" class="space-y-3">
              <div v-for="item in notifyItems" :key="item.key" class="flex items-center gap-3">
                <UIcon :name="item.icon" class="text-muted" />
                <span class="flex-1 text-sm">{{ item.label }}</span>
                <USwitch v-model="prefs[item.key]" />
              </div>
              <div class="flex justify-end pt-1">
                <UButton :label="t('settings.savePreferences')" icon="i-lucide-save" :loading="savingPrefs" @click="savePrefs" />
              </div>
            </div>

            <!-- Privacidad -->
            <div v-else-if="section === 'privacidad'" class="space-y-4">
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-users" class="text-muted" />
                <span class="flex-1 text-sm">{{ t('settings.directoryVisible') }} <span class="block text-xs text-muted">{{ t('settings.directoryVisibleText') }}</span></span>
                <USwitch v-model="prefs.directory_visible" />
              </div>
              <div class="flex items-center gap-3">
                <UIcon name="i-lucide-search" class="text-muted" />
                <span class="flex-1 text-sm">{{ t('settings.showInSearch') }} <span class="block text-xs text-muted">{{ t('settings.showInSearchText') }}</span></span>
                <USwitch v-model="prefs.show_in_search" />
              </div>
              <div class="flex justify-end">
                <UButton :label="t('settings.savePrivacy')" icon="i-lucide-save" :loading="savingPrefs" @click="savePrefs" />
              </div>
            </div>

            <!-- Bloqueados y ocultos -->
            <div v-else-if="section === 'bloqueos'" class="space-y-5">
              <div>
                <h3 class="mb-2 text-sm font-bold">{{ t('settings.blockedMembers') }}</h3>
                <ul v-if="social.blocked.length" class="divide-y divide-default">
                  <li v-for="b in social.blocked" :key="b.id" class="flex items-center gap-3 py-2">
                    <UAvatar :src="b.avatarUrl || undefined" :text="b.name.charAt(0)" size="sm" />
                    <NuxtLink :to="`/profile/${b.slug}`" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline" @click="closeSettings">{{ b.name }}</NuxtLink>
                    <UButton size="sm" color="neutral" variant="soft" :label="t('settings.unblock')" icon="i-lucide-undo-2" @click="unblock(b.slug)" />
                  </li>
                </ul>
                <p v-else class="text-sm text-muted">{{ t('settings.noBlocked') }}</p>
              </div>
              <div>
                <h3 class="mb-2 text-sm font-bold">{{ t('settings.hiddenPosts') }}</h3>
                <ul v-if="social.hidden.length" class="divide-y divide-default">
                  <li v-for="h in social.hidden" :key="h.id" class="flex items-center gap-3 py-2">
                    <span class="min-w-0 flex-1">
                      <NuxtLink :to="`/p/${h.channelSlug}/${h.slug}`" class="block truncate text-sm font-medium hover:underline" @click="closeSettings">{{ h.title }}</NuxtLink>
                      <span class="block text-xs text-muted">{{ t('settings.byAuthorInChannel', { author: h.authorName, channel: h.channelName }) }}</span>
                    </span>
                    <UButton size="sm" color="neutral" variant="soft" :label="t('settings.showAgain')" icon="i-lucide-eye" @click="unhide(h.id)" />
                  </li>
                </ul>
                <p v-else class="text-sm text-muted">{{ t('settings.noHidden') }}</p>
              </div>
            </div>

            <!-- Idioma (Fase 18) -->
            <div v-else-if="section === 'idioma'" class="space-y-4">
              <div>
                <h3 class="text-sm font-bold">{{ t('settings.languageTitle') }}</h3>
                <p class="mt-1 text-sm text-muted">{{ t('settings.languageText') }}</p>
              </div>
              <URadioGroup v-model="langChoice" :items="langItems" />
              <div class="flex justify-end">
                <UButton :label="t('common.save')" icon="i-lucide-save" :loading="savingLang" :disabled="langChoice === (userLocale ?? 'default')" @click="saveLanguage" />
              </div>
            </div>

            <!-- Seguridad -->
            <div v-else-if="section === 'seguridad'" class="space-y-4">
              <UFormField :label="t('settings.currentPassword')">
                <UInput v-model="pw.current" type="password" class="w-full" autocomplete="current-password" />
              </UFormField>
              <UFormField :label="t('settings.newPassword')">
                <UInput v-model="pw.next" type="password" class="w-full" autocomplete="new-password" />
              </UFormField>
              <UFormField :label="t('settings.confirmPassword')">
                <UInput v-model="pw.confirm" type="password" class="w-full" autocomplete="new-password" />
              </UFormField>
              <UAlert color="neutral" variant="soft" icon="i-lucide-info" :title="t('settings.pwInfoTitle')" :description="t('settings.pwInfoText')" />
              <div class="flex justify-end">
                <UButton :label="t('settings.changePassword')" icon="i-lucide-key-round" :loading="savingPw" :disabled="!pw.current || pw.next.length < 8 || pw.next !== pw.confirm" @click="changePassword" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
