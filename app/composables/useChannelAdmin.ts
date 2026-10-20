// Administración de canales EN CONTEXTO (Fase 16-F): los menús
// «⋯» del lateral y de la página del canal abren estas piezas —
// gestionar miembros, eliminar canal, crear/editar/eliminar
// grupos — que renderiza UNA sola vez ChannelAdminHost en el
// layout de miembro. Estado compartido con useState, como el resto
// de puentes del proyecto (useChannelEditor, usePostEditor).
export interface ChannelLite {
  id: number
  slug: string
  name: string
}

export interface ChannelGroupLite {
  id: number
  name: string
  isDefault?: boolean
  // Nombre del grupo por defecto (para el texto de confirmación de
  // eliminar grupo: los canales pasan a ese grupo).
  fallbackName?: string
}

interface GroupModalState {
  mode: 'create' | 'edit'
  group: (ChannelGroupLite & { sort?: number }) | null
  nonce: number
}

export function useChannelAdmin() {
  const membersFor = useState<ChannelLite | null>('channel-admin-members', () => null)
  const deleteChannelFor = useState<ChannelLite | null>('channel-admin-delete-channel', () => null)
  const groupModal = useState<GroupModalState | null>('channel-admin-group-modal', () => null)
  const deleteGroupFor = useState<ChannelGroupLite | null>('channel-admin-delete-group', () => null)
  // Contador de cambios: las superficies con datos propios (la
  // página del canal) lo observan para refrescarse sin recargar.
  const changedTick = useState('channel-admin-changed', () => 0)

  function openMembers(ch: ChannelLite) { membersFor.value = ch }
  function closeMembers() { membersFor.value = null }
  function askDeleteChannel(ch: ChannelLite) { deleteChannelFor.value = ch }
  function closeDeleteChannel() { deleteChannelFor.value = null }
  function openGroupCreate() { groupModal.value = { mode: 'create', group: null, nonce: Date.now() } }
  function openGroupEdit(group: ChannelGroupLite & { sort?: number }) { groupModal.value = { mode: 'edit', group, nonce: Date.now() } }
  function closeGroupModal() { groupModal.value = null }
  function askDeleteGroup(g: ChannelGroupLite) { deleteGroupFor.value = g }
  function closeDeleteGroup() { deleteGroupFor.value = null }
  function notifyChanged() { changedTick.value++ }

  return {
    membersFor, deleteChannelFor, groupModal, deleteGroupFor, changedTick,
    openMembers, closeMembers, askDeleteChannel, closeDeleteChannel,
    openGroupCreate, openGroupEdit, closeGroupModal, askDeleteGroup, closeDeleteGroup,
    notifyChanged,
  }
}
