// Formato de fechas y dinero. Fase 18: todo respeta el idioma
// activo (useI18n) — fechas con Intl en 'es'/'en-US', relativos
// («hace 5 min» / «5 min ago») desde el catálogo y dinero con el
// locale del idioma además de la moneda del tenant.
export function useFormat() {
  const { locale, t } = useI18n()
  const dateLocale = () => (locale.value === 'en' ? 'en-US' : 'es')
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
  }
  function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  }
  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days > 0) return t('time.days', { count: days })
    const hours = Math.floor(diff / 3600000)
    if (hours > 0) return t('time.hours', { count: hours })
    const mins = Math.max(1, Math.floor(diff / 60000))
    return t('time.minutes', { count: mins })
  }
  // Fase 17: el dinero se formatea con Intl.NumberFormat en la
  // moneda del TENANT (la que trae /api/tenant vía useAuth); un
  // código explícito gana (la tabla de Ingresos formatea cada orden
  // en la moneda en que se registró el pago). Cambiar la moneda del
  // tenant cambia el formato y la interpretación de los montos
  // guardados: NO convierte entre monedas.
  function fmtMoney(cents: number, currency?: string, zeroAsFree = true) {
    if (cents === 0 && zeroAsFree) return t('common.free')
    let code = currency || 'USD'
    if (!currency) {
      try { code = useAuth().tenant.value?.currency || 'USD' }
      catch { code = 'USD' }
    }
    try {
      // 'es-419' (español latinoamericano) con símbolo angosto: USD
      // se ve «$22.00» y GTQ «Q 22.00», como los escribe la audiencia.
      // En inglés el formato es 'en-US' con la misma moneda.
      return new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'es-419', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).format(cents / 100)
    }
    catch {
      return `$${(cents / 100).toFixed(2)}`
    }
  }
  function initials(name: string) {
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  }
  const fmtAmount = (cents: number, currency?: string) => fmtMoney(cents, currency, false)
  return { fmtDate, fmtDateTime, timeAgo, fmtMoney, fmtAmount, initials }
}
