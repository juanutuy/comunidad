// Editor de canales compartido (Fase 16-F): crear y editar un canal
// abre EL MISMO modal (ChannelFormModal) desde cualquier superficie
// — la consola de canales, el menú «⋯» del lateral, el encabezado
// del grupo y la página del canal. Estado compartido con useState,
// como useUserSettings/usePostEditor: lo abre quien lo necesita y
// lo renderiza el modal montado en los layouts default y admin.
// Así no existen dos formularios de canal que puedan desincronizarse.
export interface ChannelEditorData {
  id: number
  name: string
  description: string
  // Eje de acceso (el de siempre): 'free' | 'private' | 'paid'.
  type: string
  priceCents: number
  // Ejes de la Fase 16-F.
  contentType: 'post' | 'image'
  coverUrl: string
  visibility: 'public' | 'private' | 'secret'
  postPermission: 'members' | 'staff'
  groupId: number | null
  archived: boolean
}

interface ChannelEditorState {
  mode: 'create' | 'edit'
  channel: ChannelEditorData | null
  presetGroupId: number | null
  focusPrice: boolean
  nonce: number
}

export function useChannelEditor() {
  const open = useState('channel-editor-open', () => false)
  const state = useState<ChannelEditorState>('channel-editor-state', () => ({ mode: 'create', channel: null, presetGroupId: null, focusPrice: false, nonce: 0 }))
  function openCreate(groupId?: number | null) {
    state.value = { mode: 'create', channel: null, presetGroupId: groupId ?? null, focusPrice: false, nonce: Date.now() }
    open.value = true
  }
  function openEdit(channel: ChannelEditorData, opts?: { focusPrice?: boolean }) {
    state.value = { mode: 'edit', channel, presetGroupId: null, focusPrice: !!opts?.focusPrice, nonce: Date.now() }
    open.value = true
  }
  function close() { open.value = false }
  return { open, state, openCreate, openEdit, close }
}
