// Elección de idioma del usuario (Fase 18): guarda users.locale
// ('es' | 'en' | null = «predeterminado de la comunidad») y deja la
// cookie de idioma en el RESUELTO, para que la interfaz y las
// páginas públicas siguientes nazcan en ese idioma sin recargar.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { isValidLocale, resolveEventLocale, setLocaleCookie } from '../../utils/i18n'
import type { AppLocale } from '../../utils/i18n'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ locale?: string | null }>(event)
  const raw = body?.locale ?? null
  if (raw !== null && !isValidLocale(raw))
    throw createError({ statusCode: 400, message: 'Idioma no soportado.' })
  const db = await dbFor(event)
  await db.prepare('UPDATE users SET locale = ? WHERE id = ?').run(raw, user.id)
  // La caché del pedido quedó vieja tras el UPDATE: se recalcula el
  // resuelto a mano (elección nueva o defecto de la comunidad).
  const { defaultLocale } = await resolveEventLocale(event, tenant.id)
  const resolved: AppLocale = isValidLocale(raw) ? raw : defaultLocale
  setLocaleCookie(event, resolved)
  return { ok: true, userLocale: raw, locale: resolved }
})
