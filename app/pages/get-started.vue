<script setup lang="ts">
const { user } = useAuth()
const { t } = useI18n()
const { requestAccess } = useGuestAccess()
const api = useApi()
const { data, status, error, refresh } = await useAsyncData('member-onboarding', () => user.value ? api<{ steps: { key: 'profile' | 'channels' | 'post' | 'setup', done: boolean, to: string }[] }>('/api/onboarding') : Promise.resolve(null), { watch: [() => user.value?.id] })
const progress = computed(() => data.value?.steps.length ? Math.round(data.value.steps.filter(s => s.done).length / data.value.steps.length * 100) : 0)
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <div><h1 class="text-2xl font-bold">{{ t('improvements.start') }}</h1><p class="mt-2 text-muted">{{ t('improvements.startHint') }}</p></div>
    <UButton v-if="!user" icon="i-lucide-log-in" :label="t('nav.login')" @click="requestAccess('/get-started')" />
    <UAlert v-else-if="error" color="error" :title="t('improvements.loadFailed')"><template #actions><UButton :label="t('improvements.retry')" @click="refresh()" /></template></UAlert>
    <template v-else-if="data">
      <UCard><p class="mb-3 font-medium">{{ t('improvements.progress') }} · {{ progress }}%</p><UProgress :model-value="progress" :aria-label="t('improvements.progress')" /></UCard>
      <UCard v-for="step in data.steps" :key="step.key"><NuxtLink :to="step.to" class="flex items-center gap-4 font-semibold hover:text-primary"><UIcon :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle'" :class="step.done ? 'text-success' : 'text-muted'" /><span>{{ t(`improvements.${step.key}`) }}</span><UIcon name="i-lucide-arrow-right" class="ml-auto" /></NuxtLink></UCard>
    </template>
    <UProgress v-else-if="status === 'pending'" :aria-label="t('improvements.progress')" />
  </div>
</template>
