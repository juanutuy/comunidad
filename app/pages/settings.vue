<script setup lang="ts">
// Ajustes de cuenta (Fase 5): perfil, seguridad (cambio de
// contraseña), preferencias de notificación y privacidad.
const { user, fetchMe } = useAuth()
const api = useApi()
const toast = useToast()

interface SettingsData {
  profile: { name: string, bio: string, location: string, email: string, avatarUrl: string, coverUrl: string, website: string }
  prefs: Record<string, boolean>
}
const { data, refresh } = await useAsyncData('account-settings', () =>
  user.value ? api<SettingsData>('/api/settings') : Promise.resolve(null))

const profile = reactive({ name: '', bio: '', location: '', website: '' })
const prefs = reactive<Record<string, boolean>>({
  notify_reaction: true, notify_comment: true, notify_mention: true, notify_new_post: true, notify_dm: true, notify_follow: true,
  directory_visible: true, show_in_search: true,
})
watchEffect(() => {
  if (data.value) {
    profile.name = data.value.profile.name
    profile.bio = data.value.profile.bio
    profile.location = data.value.profile.location
    profile.website = data.value.profile.website
    Object.assign(prefs, data.value.prefs)
  }
})

const savingProfile = ref(false)
async function saveProfile() {
  savingProfile.value = true
  try {
    await api('/api/settings/profile', { method: 'PUT', body: { ...profile } })
    toast.add({ title: 'Perfil guardado', color: 'success' })
    await fetchMe()
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
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
    toast.add({ title: 'Foto de perfil actualizada', color: 'success' })
    await fetchMe()
    await refresh()
  }
  catch (err) {
    toast.add({ title: 'No se pudo subir la foto', description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploadingAvatar.value = false }
}

// Fase 6: foto de portada del perfil (kind 'cover' en /api/uploads).
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
    toast.add({ title: 'Foto de portada actualizada', color: 'success' })
    await fetchMe()
    await refresh()
  }
  catch (err) {
    toast.add({ title: 'No se pudo subir la portada', description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploadingCover.value = false }
}
async function removeCover() {
  try {
    await api('/api/settings/profile', { method: 'PUT', body: { ...profile, coverUrl: '' } })
    toast.add({ title: 'Portada eliminada', description: 'Tu perfil vuelve al fondo de color por defecto.', color: 'success' })
    await fetchMe()
    await refresh()
  }
  catch { toast.add({ title: 'No se pudo quitar la portada', color: 'error' }) }
}

const savingPrefs = ref(false)
async function savePrefs() {
  savingPrefs.value = true
  try {
    await api('/api/settings/prefs', { method: 'PUT', body: { ...prefs } })
    toast.add({ title: 'Preferencias guardadas', color: 'success' })
  }
  catch { toast.add({ title: 'No se pudieron guardar las preferencias', color: 'error' }) }
  finally { savingPrefs.value = false }
}

const pw = reactive({ current: '', next: '', confirm: '' })
const savingPw = ref(false)
async function changePassword() {
  savingPw.value = true
  try {
    await api('/api/settings/password', { method: 'POST', body: { ...pw } })
    pw.current = ''; pw.next = ''; pw.confirm = ''
    toast.add({ title: 'Contraseña actualizada', description: 'Tus otras sesiones se cerraron por seguridad.', color: 'success' })
  }
  catch (e) {
    toast.add({ title: 'No se pudo cambiar la contraseña', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { savingPw.value = false }
}

// Fase 5: bloqueados y publicaciones ocultas (autogestión).
interface SocialData {
  blocked: { id: number, name: string, slug: string, avatarUrl: string, createdAt: string }[]
  hidden: { id: number, title: string, slug: string, channelSlug: string, channelName: string, authorName: string, createdAt: string }[]
}
const { data: social, refresh: refreshSocial } = await useAsyncData('account-social', () =>
  user.value ? api<SocialData>('/api/settings/social') : Promise.resolve({ blocked: [], hidden: [] } as SocialData))
async function unblock(slugToUnblock: string) {
  try {
    await api(`/api/users/${slugToUnblock}/block`, { method: 'DELETE' })
    toast.add({ title: 'Miembro desbloqueado', color: 'success' })
    await refreshSocial()
  }
  catch { toast.add({ title: 'No se pudo desbloquear', color: 'error' }) }
}
async function unhide(postId: number) {
  try {
    await api(`/api/posts/${postId}/hide`, { method: 'DELETE' })
    toast.add({ title: 'Publicación visible de nuevo', color: 'success' })
    await refreshSocial()
  }
  catch { toast.add({ title: 'No se pudo volver a mostrar', color: 'error' }) }
}

const notifyItems = [
  { key: 'notify_reaction', label: 'Reacciones a mis publicaciones', icon: 'i-lucide-heart' },
  { key: 'notify_comment', label: 'Comentarios en mis publicaciones', icon: 'i-lucide-message-circle' },
  { key: 'notify_mention', label: 'Menciones (@mi-usuario)', icon: 'i-lucide-at-sign' },
  { key: 'notify_new_post', label: 'Publicaciones nuevas en canales que sigo', icon: 'i-lucide-pen-square' },
  { key: 'notify_dm', label: 'Mensajes directos', icon: 'i-lucide-mail' },
  { key: 'notify_follow', label: 'Nuevos seguidores', icon: 'i-lucide-user-plus' },
]
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Ajustes de cuenta</h1>
      <p class="text-muted">Tu perfil, tu contraseña y cómo querés enterarte de la actividad.</p>
    </div>
    <UAlert v-if="!user" color="neutral" variant="soft" title="Iniciá sesión para ver tus ajustes" />
    <template v-else>
      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-user" /> Perfil</h2>
        </template>
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <UAvatar :src="data?.profile.avatarUrl || undefined" :text="(profile.name || 'U').charAt(0)" size="lg" />
            <label class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary hover:underline">
              <UIcon name="i-lucide-camera" />
              {{ uploadingAvatar ? 'Subiendo…' : 'Cambiar foto de perfil' }}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" :disabled="uploadingAvatar" @change="onAvatarChange">
            </label>
          </div>
          <div>
            <p class="mb-2 text-sm font-medium">Foto de portada</p>
            <div class="relative h-28 overflow-hidden rounded-lg bg-gradient-to-r from-primary/60 to-primary/20">
              <img v-if="data?.profile.coverUrl" :src="data.profile.coverUrl" alt="Tu foto de portada" class="h-full w-full object-cover">
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <label class="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary hover:underline">
                <UIcon name="i-lucide-image" />
                {{ uploadingCover ? 'Subiendo…' : 'Cambiar portada' }}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" :disabled="uploadingCover" @change="onCoverChange">
              </label>
              <UButton v-if="data?.profile.coverUrl" size="sm" color="neutral" variant="ghost" icon="i-lucide-trash-2" label="Quitar portada" @click="removeCover" />
            </div>
          </div>
          <UFormField label="Nombre">
            <UInput v-model="profile.name" class="w-full" />
          </UFormField>
          <UFormField label="Correo (no se puede cambiar desde acá)">
            <UInput :model-value="data?.profile.email || ''" disabled class="w-full" />
          </UFormField>
          <UFormField label="Bio">
            <UTextarea v-model="profile.bio" :rows="3" maxlength="500" class="w-full" />
          </UFormField>
          <UFormField label="Ubicación">
            <UInput v-model="profile.location" class="w-full" />
          </UFormField>
          <UFormField label="Sitio web" hint="Se muestra como enlace en tu perfil. Podés escribirlo sin https://">
            <UInput v-model="profile.website" class="w-full" placeholder="tusitioweb.com" icon="i-lucide-globe" />
          </UFormField>
          <div class="flex justify-end">
            <UButton label="Guardar perfil" icon="i-lucide-save" :loading="savingProfile" :disabled="!profile.name.trim()" @click="saveProfile" />
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-bell" /> Notificaciones</h2>
        </template>
        <div class="space-y-3">
          <div v-for="item in notifyItems" :key="item.key" class="flex items-center gap-3">
            <UIcon :name="item.icon" class="text-muted" />
            <span class="flex-1 text-sm">{{ item.label }}</span>
            <USwitch v-model="prefs[item.key]" />
          </div>
          <div class="flex justify-end pt-1">
            <UButton label="Guardar preferencias" icon="i-lucide-save" :loading="savingPrefs" @click="savePrefs" />
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-eye" /> Privacidad</h2>
        </template>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-users" class="text-muted" />
          <span class="flex-1 text-sm">Aparecer en el directorio de miembros <span class="block text-xs text-muted">Si lo apagás, tu perfil sigue existiendo pero no salís en la lista de Miembros.</span></span>
          <USwitch v-model="prefs.directory_visible" />
        </div>
        <div class="mt-4 flex items-center gap-3">
          <UIcon name="i-lucide-search" class="text-muted" />
          <span class="flex-1 text-sm">Aparecer en los resultados de búsqueda <span class="block text-xs text-muted">Si lo apagás, tu perfil no sale cuando alguien busca tu nombre. Tus publicaciones y comentarios siguen apareciendo.</span></span>
          <USwitch v-model="prefs.show_in_search" />
        </div>
        <div class="mt-3 flex justify-end">
          <UButton label="Guardar privacidad" icon="i-lucide-save" :loading="savingPrefs" @click="savePrefs" />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-ban" /> Bloqueados y ocultos</h2>
        </template>
        <div class="space-y-5">
          <div>
            <h3 class="mb-2 text-sm font-bold">Miembros bloqueados</h3>
            <ul v-if="social?.blocked?.length" class="divide-y divide-default">
              <li v-for="b in social.blocked" :key="b.id" class="flex items-center gap-3 py-2">
                <UAvatar :src="b.avatarUrl || undefined" :text="b.name.charAt(0)" size="sm" />
                <NuxtLink :to="`/profile/${b.slug}`" class="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{{ b.name }}</NuxtLink>
                <UButton size="sm" color="neutral" variant="soft" label="Desbloquear" icon="i-lucide-undo-2" @click="unblock(b.slug)" />
              </li>
            </ul>
            <p v-else class="text-sm text-muted">No bloqueaste a nadie. Podés bloquear desde el perfil de un miembro.</p>
          </div>
          <div>
            <h3 class="mb-2 text-sm font-bold">Publicaciones ocultas</h3>
            <ul v-if="social?.hidden?.length" class="divide-y divide-default">
              <li v-for="h in social.hidden" :key="h.id" class="flex items-center gap-3 py-2">
                <span class="min-w-0 flex-1">
                  <NuxtLink :to="`/p/${h.channelSlug}/${h.slug}`" class="block truncate text-sm font-medium hover:underline">{{ h.title }}</NuxtLink>
                  <span class="block text-xs text-muted">{{ h.authorName }} · en {{ h.channelName }}</span>
                </span>
                <UButton size="sm" color="neutral" variant="soft" label="Volver a mostrar" icon="i-lucide-eye" @click="unhide(h.id)" />
              </li>
            </ul>
            <p v-else class="text-sm text-muted">No ocultaste publicaciones. La opción está en el menú de cada publicación.</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-shield" /> Seguridad</h2>
        </template>
        <div class="space-y-4">
          <UFormField label="Contraseña actual">
            <UInput v-model="pw.current" type="password" class="w-full" autocomplete="current-password" />
          </UFormField>
          <UFormField label="Contraseña nueva (mínimo 8 caracteres)">
            <UInput v-model="pw.next" type="password" class="w-full" autocomplete="new-password" />
          </UFormField>
          <UFormField label="Confirmar contraseña nueva">
            <UInput v-model="pw.confirm" type="password" class="w-full" autocomplete="new-password" />
          </UFormField>
          <UAlert color="neutral" variant="soft" icon="i-lucide-info" title="Al cambiarla se cierran tus otras sesiones" description="Esta sesión se mantiene abierta; en cualquier otro dispositivo vas a tener que iniciar sesión de nuevo." />
          <div class="flex justify-end">
            <UButton label="Cambiar contraseña" icon="i-lucide-key-round" :loading="savingPw" :disabled="!pw.current || pw.next.length < 8 || pw.next !== pw.confirm" @click="changePassword" />
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
