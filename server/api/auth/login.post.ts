// Inicio de sesión con correo y contraseña (scrypt).
// Fase 14: una cuenta SUSPENDIDA en este tenant no puede entrar (el
// aviso sale acá, no un error genérico); una cuenta con la solicitud
// en revisión ('pending') o rechazada ('declined') SÍ abre sesión,
// pero la respuesta lleva su estado y el muro de estado de la API no
// la deja usar la comunidad — la interfaz muestra la pantalla de
// estado correspondiente.
import { setSession, verifyPassword } from '../../utils/auth'
import type { UserRow } from '../../utils/community'
import { ensureMembership, publicUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { isValidLocale, msg, resolveEventLocale, setLocaleCookie } from '../../utils/i18n'

type UserWithHash = UserRow & { password_hash: string }

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string }>(event)
  const email = (body.email || '').trim().toLowerCase()
  const db = await dbFor(event)
  const tenant = await resolveTenant(event)
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserWithHash | undefined
  if (!row || !verifyPassword(body.password || '', row.password_hash))
    throw createError({ statusCode: 401, message: await msg(event, tenant.id, 'auth.invalidCredentials') })
  await ensureMembership(event, tenant.id, row.id)
  const m = await db.prepare('SELECT role, status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, row.id) as { role: string, status?: string }
  const status = m?.status || 'active'
  if (status === 'suspended')
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'auth.suspended') })
  setSession(event, row.id, (row as { token_version?: number }).token_version ?? 0)
  // Fase 18: la cookie de idioma queda en el idioma de la cuenta (su
  // elección personal o el defecto de la comunidad), para que las
  // páginas públicas posteriores nazcan en ese idioma. Se calcula
  // desde la fila porque la sesión recién creada aún no viaja en el
  // pedido.
  const { defaultLocale } = await resolveEventLocale(event, tenant.id)
  setLocaleCookie(event, isValidLocale(row.locale) ? row.locale : defaultLocale)
  return { user: { ...publicUser(row), role: m.role }, status }
})
