<script setup lang="ts">
// Menú «⋯» del encabezado de un GRUPO de canales (Fase 16-F), como
// en la referencia: Ver canales (el directorio de miembro),
// Editar grupo y Eliminar grupo (solo staff-rol admin: son los
// endpoints /api/admin/channel-groups), más crear grupo. El grupo
// por defecto no ofrece «Eliminar»: el servidor también lo
// rechaza (es el destino de los canales de los grupos borrados).
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{
  group: { id: number, name: string, sort?: number, isDefault?: boolean }
  fallbackName?: string
}>()
const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin')
const { t } = useI18n()
const { openGroupCreate, openGroupEdit, askDeleteGroup } = useChannelAdmin()

const items = computed<DropdownMenuItem[][]>(() => {
  const out: DropdownMenuItem[][] = [[
    { label: t('channelAdmin.groupViewChannels'), icon: 'i-lucide-layout-grid', onSelect: () => { void navigateTo('/channels') } },
  ]]
  if (isAdmin.value) {
    const staff: DropdownMenuItem[] = [
      { label: t('channelAdmin.groupCreate'), icon: 'i-lucide-folder-plus', onSelect: () => openGroupCreate() },
      { label: t('channelAdmin.groupEdit'), icon: 'i-lucide-pencil', onSelect: () => openGroupEdit({ id: props.group.id, name: props.group.name, sort: props.group.sort, isDefault: props.group.isDefault }) },
    ]
    if (!props.group.isDefault) {
      staff.push({
        label: t('channelAdmin.groupDelete'), icon: 'i-lucide-trash-2', color: 'error',
        onSelect: () => askDeleteGroup({ id: props.group.id, name: props.group.name, isDefault: props.group.isDefault, fallbackName: props.fallbackName }),
      })
    }
    out.push(staff)
  }
  return out
})
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton
      icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="xs"
      :aria-label="group.name"
      @click.prevent.stop
    />
  </UDropdownMenu>
</template>
