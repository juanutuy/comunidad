<script setup lang="ts">
const { tenant } = useAuth()
const { t } = useI18n()
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }" class="overflow-hidden">
    <div
      class="community-hero px-6 py-8 sm:px-8 sm:py-10"
      :style="{
        '--community-brand': tenant?.brandColor || '#2563eb',
        ...(tenant?.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgb(8 15 30 / 78%), rgb(8 15 30 / 12%)), url('${tenant.bannerUrl}')` } : {}),
      }"
    >
      <span class="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide">
        <UIcon name="i-lucide-orbit" class="size-4" /> {{ t('common.community') }}
      </span>
      <h1 class="max-w-lg text-3xl font-bold tracking-tight sm:text-4xl">{{ tenant?.name }}</h1>
      <p v-if="tenant?.tagline" class="mt-3 max-w-lg text-base leading-relaxed text-blue-100">{{ tenant.tagline }}</p>
    </div>
  </UCard>
</template>
