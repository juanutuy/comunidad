<script setup lang="ts">
const { user } = useAuth()
const { locale } = useI18n()
const api = useApi()
const { requestAccess } = useGuestAccess()
const en = computed(() => locale.value === 'en')
const { data } = await useAsyncData('community-platform', () => user.value ? api<{ domain: string, enabled: boolean, owned: { slug: string, name: string } | null }>('/api/auth/communities') : Promise.resolve(null), { watch: [() => user.value?.id] })
const form = reactive({ name: '', nameEn: '', slug: '', locale: locale.value })
const pending = ref(false)
const error = ref('')
const result = ref('')
let requestKey = ''
async function create() {
  pending.value = true
  error.value = ''
  requestKey ||= crypto.randomUUID()
  try {
    const response = await api<{ url: string }>('/api/auth/communities', { method: 'POST', body: { ...form, requestKey } })
    result.value = response.url
  }
  catch (e) { error.value = (e as { data?: { message?: string } }).data?.message || (en.value ? 'Unable to create community.' : 'No se pudo crear la comunidad.') }
  finally { pending.value = false }
}
</script>

<template>
  <UCard class="mx-auto max-w-2xl">
    <h1 class="text-2xl font-bold">{{ en ? 'Create your community' : 'Creá tu comunidad' }}</h1>
    <p class="mt-2 text-muted">{{ en ? 'A separate space with your own name, settings and members.' : 'Un espacio independiente con su propio nombre, ajustes y miembros.' }}</p>
    <UButton v-if="!user" class="mt-6" icon="i-lucide-log-in" @click="requestAccess('/communities/new')">{{ en ? 'Sign in' : 'Iniciar sesión' }}</UButton>
    <UAlert v-else-if="result" class="mt-6" color="success" :title="en ? 'Community created' : 'Comunidad creada'">
      <template #description><a :href="result" class="underline">{{ result }}</a></template>
    </UAlert>
    <UAlert v-else-if="data?.owned" class="mt-6" :title="data.owned.name" :description="`${data.owned.slug}.${data.domain}`" />
    <UAlert v-else-if="!data?.enabled" class="mt-6" color="neutral" :title="en ? 'Coming soon' : 'Próximamente'" :description="en ? 'Community creation will be available when domain setup is complete.' : 'La creación de comunidades estará disponible cuando termine la configuración de dominios.'" />
    <form v-else class="mt-6 space-y-5" @submit.prevent="create">
      <UFormField :label="en ? 'Name (Spanish)' : 'Nombre (español)'" required><UInput v-model="form.name" required maxlength="100" class="w-full" /></UFormField>
      <UFormField :label="en ? 'Name (English)' : 'Nombre (inglés)'"><UInput v-model="form.nameEn" maxlength="100" class="w-full" /></UFormField>
      <UFormField :label="en ? 'Subdomain' : 'Subdominio'" :hint="`.${data.domain}`" required><UInput v-model="form.slug" required pattern="[a-z0-9][a-z0-9-]{2,38}[a-z0-9]" minlength="4" maxlength="40" class="w-full" /></UFormField>
      <UFormField :label="en ? 'Default language' : 'Idioma por defecto'"><USelect v-model="form.locale" :items="[{ label: 'Español', value: 'es' }, { label: 'English', value: 'en' }]" /></UFormField>
      <UAlert v-if="error" color="error" :title="error" />
      <UButton type="submit" :loading="pending" icon="i-lucide-plus">{{ en ? 'Create community' : 'Crear comunidad' }}</UButton>
    </form>
  </UCard>
</template>
