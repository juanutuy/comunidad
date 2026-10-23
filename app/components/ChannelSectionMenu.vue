<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { openGroupCreate } = useChannelAdmin()
const items = computed<DropdownMenuItem[][]>(() => [[
  { label: t('channelAdmin.groupViewChannels'), icon: 'i-lucide-layout-grid', onSelect: () => { void navigateTo('/channels') } },
  { label: t('channelAdmin.groupCreate'), icon: 'i-lucide-folder-plus', onSelect: openGroupCreate },
  { label: t('adminShell.sectionChannels'), icon: 'i-lucide-settings-2', onSelect: () => { void navigateTo('/admin/channels') } },
]])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="xs" :aria-label="t('nav.channels')" @click.prevent.stop />
  </UDropdownMenu>
</template>
