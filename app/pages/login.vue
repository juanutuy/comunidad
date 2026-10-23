<script setup lang="ts">
definePageMeta({ layout: 'auth' })
const { login, tenant } = useAuth()
const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const form = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await login(form.email, form.password)
    // Fase 14: con la solicitud en revisión o rechazada, la sesión
    // abre pero la comunidad queda detrás de la pantalla de estado.
    if (data.status === 'pending' || data.status === 'declined') {
      router.push('/pending')
      return
    }
    toast.add({ title: t('auth.helloToast'), color: 'success' })
    router.push('/feeds')
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message || t('auth.loginFailed')
  }
  finally { loading.value = false }
}
</script>

<template>
  <UCard>
    <h1 class="text-2xl font-bold">{{ t('auth.welcomeBack') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('auth.loginSubtitle', { name: tenant?.name || t('pricing.theCommunity') }) }}</p>
    <UAlert v-if="error" class="mt-4" color="error" variant="soft" :title="error" />
    <form class="mt-5 space-y-4" @submit.prevent="submit">
      <UFormField :label="t('auth.email')">
        <UInput v-model="form.email" type="email" required :placeholder="t('auth.emailPlaceholder')" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.password')">
        <UInput v-model="form.password" type="password" required :placeholder="t('auth.passwordPlaceholder')" class="w-full" />
      </UFormField>
      <UButton type="submit" block icon="i-lucide-log-in" :label="t('auth.loginButton')" :loading="loading" />
    </form>
    <p class="mt-4 text-center text-sm text-muted">
      {{ t('auth.noAccount') }} <NuxtLink to="/register" class="font-medium text-primary hover:underline">{{ t('auth.createFree') }}</NuxtLink>
    </p>
  </UCard>
</template>
