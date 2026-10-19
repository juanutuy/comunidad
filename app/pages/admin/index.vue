<script setup lang="ts">
// Ajustes de la comunidad (solo admin): nombre, lema, color de marca y
// reglas. Todo se refleja en la UI porque sale de la fila del tenant.
const { user, tenant, fetchMe } = useAuth()
const api = useApi()
const toast = useToast()

const { data } = await useAsyncData('admin-settings', () =>
  user.value?.role === 'admin'
    ? api<{ settings: { name: string, tagline: string, brandColor: string, guidelines: string[] } }>('/api/admin/settings')
    : Promise.resolve(null))

const form = reactive({ name: '', tagline: '', brandColor: '#2563eb', guidelinesText: '' })
watchEffect(() => {
  if (data.value?.settings) {
    form.name = data.value.settings.name
    form.tagline = data.value.settings.tagline
    form.brandColor = data.value.settings.brandColor
    form.guidelinesText = data.value.settings.guidelines.join('\n')
  }
})

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
      <p class="text-muted">Nombre, lema, color de marca y reglas de {{ tenant?.name }}.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Tu cuenta no tiene rol de administrador en esta comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <div class="flex flex-wrap gap-2">
        <UButton to="/admin" color="primary" label="Ajustes" icon="i-lucide-settings" size="sm" />
        <UButton to="/admin/members" color="neutral" variant="soft" label="Miembros" icon="i-lucide-users" size="sm" />
        <UButton to="/admin/channels" color="neutral" variant="soft" label="Canales" icon="i-lucide-hash" size="sm" />
      </div>
      <UCard>
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
            <UTextarea v-model="form.guidelinesText" :rows="7" class="w-full" />
          </UFormField>
          <div class="flex justify-end">
            <UButton label="Guardar ajustes" icon="i-lucide-save" :loading="saving" :disabled="!form.name.trim()" @click="save" />
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
