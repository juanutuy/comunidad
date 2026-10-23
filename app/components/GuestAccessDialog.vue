<script setup lang="ts">
const { open } = useGuestAccess()
const { t } = useI18n()
</script>

<template>
  <UModal v-model:open="open" :title="t('feed.visitorTitle')" :description="t('feed.visitorText')">
    <template #body>
      <div class="flex flex-wrap gap-3">
        <UButton to="/register" icon="i-lucide-user-round-plus" :label="t('nav.join')" @click="open = false" />
        <UButton to="/login" color="neutral" variant="soft" icon="i-lucide-log-in" :label="t('nav.login')" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
