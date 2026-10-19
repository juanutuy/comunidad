// Estado compartido del panel deslizable móvil (Fase 10): lo abren el
// botón de menú de la barra superior, el avatar en móvil y el botón
// «Menú» de la barra inferior; lo cierra el propio panel al navegar.
export function useMobilePanel() {
  const open = useState<boolean>('mobile-panel-open', () => false)
  return {
    open,
    openPanel: () => { open.value = true },
    closePanel: () => { open.value = false },
  }
}
