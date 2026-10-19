// Ajustes de cuenta como modal (Fase 11): en la referencia los
// ajustes del usuario NO son una página — son el modal «Profile
// Settings» con navegación de secciones. Estado compartido: lo abren
// el menú del avatar, el panel móvil y la antigua ruta /settings (que
// redirige acá); lo renderiza UserSettingsModal.vue, montado en los
// layouts default y admin.
export type UserSettingsSection = 'perfil' | 'notificaciones' | 'privacidad' | 'bloqueos' | 'idioma' | 'seguridad'

export function useUserSettings() {
  const open = useState('user-settings-open', () => false)
  const section = useState<UserSettingsSection>('user-settings-section', () => 'perfil')
  function openSettings(target?: UserSettingsSection) {
    if (target) section.value = target
    open.value = true
  }
  function closeSettings() { open.value = false }
  return { open, section, openSettings, closeSettings }
}
