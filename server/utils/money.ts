// Moneda y formato de dinero (Fase 17). La moneda es UN ajuste del
// tenant: cambiarla cambia el FORMATO y la interpretación de los
// montos ya guardados (price_cents y amount_cents pasan a leerse en
// la moneda nueva); NO convierte valores entre monedas. La UI de
// ajustes lo dice con una línea honesta.
//
// formatMoney es el espejo en servidor del fmtMoney de
// app/composables/useFormat.ts: mismo Intl.NumberFormat, misma
// regla (0 = «Gratis»). La lógica vive en un solo criterio aunque
// haya dos copias chicas, una por runtime (app y servidor no
// comparten imports en este proyecto).

export const CURRENCIES: { code: string, name: string }[] = [
  { code: 'USD', name: 'Dólar estadounidense' },
  { code: 'GTQ', name: 'Quetzal guatemalteco' },
  { code: 'MXN', name: 'Peso mexicano' },
  { code: 'EUR', name: 'Euro' },
  { code: 'COP', name: 'Peso colombiano' },
  { code: 'PEN', name: 'Sol peruano' },
  { code: 'ARS', name: 'Peso argentino' },
  { code: 'CLP', name: 'Peso chileno' },
  { code: 'BRL', name: 'Real brasileño' },
  { code: 'DOP', name: 'Peso dominicano' },
]

export function isValidCurrency(code: unknown): boolean {
  return typeof code === 'string' && CURRENCIES.some(c => c.code === code)
}

export function normalizeCurrency(code: unknown): string {
  return isValidCurrency(code) ? String(code) : 'USD'
}

export function formatMoney(cents: number, currency = 'USD', locale: 'es' | 'en' = 'es'): string {
  // Fase 18: el formato respeta el idioma activo además de la moneda
  // ('es-419' latinoamericano / 'en-US'); sin idioma pedido vale el
  // comportamiento de siempre.
  if (!cents) return locale === 'en' ? 'Free' : 'Gratis'
  try {
    // 'es-419' (español latinoamericano) con símbolo angosto: USD se
    // ve «$22.00» y GTQ «Q 22.00», como los escribe la audiencia.
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-419', { style: 'currency', currency: normalizeCurrency(currency), currencyDisplay: 'narrowSymbol' }).format(cents / 100)
  }
  catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}
