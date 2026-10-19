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
  function fmtMoney(cents: number) {
    return cents === 0 ? 'Gratis' : `$${(cents / 100).toFixed(2)}`
  }
  function initials(name: string) {
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  }
  return { fmtDate, fmtDateTime, timeAgo, fmtMoney, initials }
}
