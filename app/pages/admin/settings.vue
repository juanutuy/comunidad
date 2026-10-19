<script setup lang="ts">
// Ajustes de la comunidad (Fase 11): antes vivían al pie del Panel
// (/admin); ahora son su propia sección de la consola, como en la
// referencia, con sub-navegación real: «General» (nombre, lema, color
// de marca y reglas) y «Textos legales» (términos y privacidad). Es un
// solo formulario y un solo guardado contra PUT /api/admin/settings:
// las pestañas solo reparten los campos en dos vistas.
definePageMeta({ layout: 'admin' })
const { user, tenant, fetchMe } = useAuth()
const api = useApi()
const toast = useToast()
const route = useRoute()

const { data } = await useAsyncData('admin-settings', () =>
  user.value?.role === 'admin'
    ? api<{ settings: { name: string, tagline: string, brandColor: string, guidelines: string[], terms: string, privacy: string } }>('/api/admin/settings')
    : Promise.resolve(null))

const form = reactive({ name: '', tagline: '', brandColor: '#2563eb', guidelinesText: '', terms: '', privacy: '' })
watchEffect(() => {
  if (data.value?.settings) {
    form.name = data.value.settings.name
    form.tagline = data.value.settings.tagline
    form.brandColor = data.value.settings.brandColor
    form.guidelinesText = data.value.settings.guidelines.join('\n')
    form.terms = data.value.settings.terms || ''
    form.privacy = data.value.settings.privacy || ''
  }
})

const subItems = [
  { value: 'general', label: 'General', icon: 'i-lucide-settings' },
  { value: 'legales', label: 'Textos legales', icon: 'i-lucide-scale' },
]
const tab = computed(() => (route.query.tab === 'legales' ? 'legales' : 'general'))

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: {
        name: form.name,
        tagline: form.tagline,
        brandColor: form.brandColor,
        guidelines: form.guidelinesText.split('\n').map(g => g.trim()).filter(Boolean),
        terms: form.terms,
        privacy: form.privacy,
      },
    })
    toast.add({ title: 'Ajustes guardados', color: 'success' })
    await fetchMe()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: 'No se pudieron guardar los ajustes', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { saving.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Ajustes de la comunidad</h1>
      <p class="text-muted">La identidad de {{ tenant?.name }} y sus textos públicos.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Tu cuenta no tiene rol de administrador en esta comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <AdminSubNav :items="subItems" />

      <UCard v-if="tab === 'general'">
        <div class="space-y-4">
          <UFormField label="Nombre de la comunidad">
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="Lema / descripción corta">
            <UInput v-model="form.tagline" class="w-full" />
          </UFormField>
          <UFormField label="Color de marca">
            <div class="flex items-center gap-3">
              <input v-model="form.brandColor" type="color" class="h-10 w-16 cursor-pointer rounded-md border border-default bg-transparent">
              <UInput v-model="form.brandColor" class="w-32" />
              <span class="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: form.brandColor }">{{ (form.name || 'C').charAt(0) }}</span>
            </div>
          </UFormField>
          <UFormField label="Reglas de la comunidad" description="Una regla por línea. Se muestran en la página de Reglas.">
            <UTextarea v-model="form.guidelinesText" :rows="8" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard v-else>
        <div class="space-y-4">
          <UFormField label="Términos y condiciones" description="Se muestran en /terms. Si queda vacío se usa un texto por defecto.">
            <UTextarea v-model="form.terms" :rows="10" class="w-full" placeholder="Texto de términos de tu comunidad…" />
          </UFormField>
          <UFormField label="Política de privacidad" description="Se muestra en /privacy. Si queda vacío se usa un texto por defecto.">
            <UTextarea v-model="form.privacy" :rows="10" class="w-full" placeholder="Texto de privacidad de tu comunidad…" />
          </UFormField>
        </div>
      </UCard>

      <div class="flex justify-end">
        <UButton label="Guardar ajustes" icon="i-lucide-save" :loading="saving" :disabled="!form.name.trim()" @click="save" />
      </div>
    </template>
  </div>
</template>
