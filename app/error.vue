<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number, message?: string } }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <UCard class="max-w-md text-center">
      <h1 class="text-4xl font-bold">{{ props.error.statusCode || 500 }}</h1>
      <p class="mt-2 text-muted">{{ props.error.statusCode === 404 ? t('errorPage.notFound') : t('errorPage.generic') }}</p>
      <UButton to="/feeds" class="mt-4" :label="t('errorPage.goFeed')" />
    </UCard>
  </div>
</template>
