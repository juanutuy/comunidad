// Contador de notificaciones sin leer COMPARTIDO (Fase 10): la campana
// de la barra superior y la barra inferior móvil leen el mismo estado,
// así ningún badge inventa su propio número. La campana lo actualiza
// con su carga completa; refresh() sirve para refrescos livianos (p.
// ej. al cambiar de ruta) sin tocar la lista.
export function useNotifBadge() {
  const unread = useState<number>('notif-unread', () => 0)
  const api = useApi()
  const { user } = useAuth()

  async function refresh() {
    if (!user.value) { unread.value = 0; return }
    try {
      const data = await api<{ unread: number }>('/api/notifications')
      unread.value = data.unread
    }
    catch { /* sin red o sin sesión: se conserva el último valor */ }
  }

  return { unread, refresh }
}
