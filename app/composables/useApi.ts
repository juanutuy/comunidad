// Llamadas a /api/* reenviando la cookie en SSR (sin esto, recargar
// una página pierde la sesión en el render de servidor).
export function useApi() {
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  return <T>(url: string, opts: Record<string, unknown> = {}) =>
    $fetch<T>(url, { ...opts, headers: { ...(headers || {}), ...((opts.headers as Record<string, string>) || {}) } })
}
