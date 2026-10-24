<script setup lang="ts">
const props = withDefaults(defineProps<{ mode?: 'login' | 'link' }>(), { mode: 'login' })
const { t } = useI18n()
const { user } = useAuth()
const api = useApi()
const route = useRoute()
const password = ref('')
const busy = ref(false)
const error = ref('')
const { data, refresh } = await useAsyncData(() => `google-auth-${props.mode}-${user.value?.id || 'guest'}`, () => api<{ enabled: boolean, linked: boolean }>('/api/auth/google/config'))
const oauthError = computed(() => typeof route.query.oauth === 'string' && props.mode === 'login' ? t('completion.googleFailed') : '')
async function perform() {
  busy.value = true
  error.value = ''
  try {
    if (props.mode === 'link' && data.value?.linked) {
      await api('/api/auth/google/unlink', { method: 'POST', body: { password: password.value } })
      password.value = ''
      await refresh()
    }
    else {
      const result = await api<{ url: string }>('/api/auth/google/start', { method: 'POST', body: { link: props.mode === 'link', ...(props.mode === 'link' ? { password: password.value } : {}) } })
      password.value = ''
      await navigateTo(result.url, { external: true })
    }
  }
  catch (e) { error.value = (e as { data?: { message?: string } }).data?.message || t('completion.googleFailed') }
  finally { busy.value = false }
}
</script>

<template>
  <div v-if="data?.enabled || oauthError" class="space-y-3">
    <UAlert v-if="error || oauthError" color="warning" :title="error || oauthError" />
    <template v-if="data?.enabled">
      <p v-if="mode === 'link'" class="text-sm text-muted">{{ t('completion.googleLinkHint') }}</p>
      <UInput v-if="mode === 'link'" v-model="password" type="password" autocomplete="current-password" :placeholder="t('settings.currentPassword')" :aria-label="t('settings.currentPassword')" class="w-full" />
      <UButton color="neutral" variant="outline" block icon="i-lucide-key-round" :loading="busy" :disabled="mode === 'link' && !password" :label="mode === 'login' ? t('completion.googleLogin') : data.linked ? t('completion.googleUnlink') : t('completion.googleLink')" @click="perform" />
    </template>
  </div>
</template>
