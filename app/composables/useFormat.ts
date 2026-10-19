// Formato de fechas y dinero (español).
export function useFormat() {
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  }
  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days > 0) return `hace ${days} d`
    const hours = Math.floor(diff / 3600000)
    if (hours > 0) return `hace ${hours} h`
    const mins = Math.max(1, Math.floor(diff / 60000))
    return `hace ${mins} min`
  }
  // Fase 17: el dinero se formatea con Intl.NumberFormat en la
  // moneda del TENANT (la que trae /api/tenant vía useAuth); un
  // código explícito gana (la tabla de Ingresos formatea cada orden
  // en la moneda en que se registró el pago). Cambiar la moneda del
  // tenant cambia el formato y la interpretación de los montos
  // guardados: NO convierte entre monedas.
  function fmtMoney(cents: number, currency?: string) {
    if (cents === 0) return 'Gratis'
    let code = currency || 'USD'
    if (!currency) {
      try { code = useAuth().tenant.value?.currency || 'USD' }
      catch { code = 'USD' }
    }
    try {
      // 'es-419' (español latinoamericano) con símbolo angosto: USD
      // se ve «$22.00» y GTQ «Q 22.00», como los escribe la audiencia.
      return new Intl.NumberFormat('es-419', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).format(cents / 100)
    }
    catch {
      return `$${(cents / 100).toFixed(2)}`
    }
  }
  function initials(name: string) {
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  }
  return { fmtDate, fmtDateTime, timeAgo, fmtMoney, initials }
}
