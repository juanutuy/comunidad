<script setup lang="ts">
const { login } = useAuth()
const emit = defineEmits<{ authenticated: [status: string], register: [] }>()
const { t } = useI18n()
const toast = useToast()
const form = reactive({ email: '', password: '' })
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const data = await login(form.email, form.password)
    form.password = ''
    if (data.status !== 'pending' && data.status !== 'declined') toast.add({ title: t('auth.helloToast'), color: 'success' })
    emit('authenticated', data.status || 'active')
  }
  catch (e) {
    error.value = (e as { data?: { message?: string } }).data?.message || t('auth.loginFailed')
  }
  finally { loading.value = false }
}
</script>

<template>
  <div>
    <UAlert v-if="error" class="mb-4" color="error" variant="soft" :title="error" />
    <form class="space-y-4" @submit.prevent="submit">
      <UFormField :label="t('auth.email')">
        <UInput v-model="form.email" type="email" autocomplete="email" required :placeholder="t('auth.emailPlaceholder')" class="w-full" />
      </UFormField>
      <UFormField :label="t('auth.password')">
        <UInput v-model="form.password" type="password" autocomplete="current-password" required :placeholder="t('auth.passwordPlaceholder')" class="w-full" />
      </UFormField>
      <UButton type="submit" block icon="i-lucide-log-in" :label="t('auth.loginButton')" :loading="loading" />
    </form>
    <p class="mt-4 text-center text-sm text-muted">
      {{ t('auth.noAccount') }} <NuxtLink to="/register" @click="emit('register')" class="font-medium text-primary hover:underline">{{ t('auth.createFree') }}</NuxtLink>
    </p>
  </div>
</template>
