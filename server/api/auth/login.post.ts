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

type UserWithHash = UserRow & { password_hash: string }

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string, password?: string }>(event)
  const email = (body.email || '').trim().toLowerCase()
  const db = await dbFor(event)
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserWithHash | undefined
  if (!row || !verifyPassword(body.password || '', row.password_hash))
    throw createError({ statusCode: 401, message: 'Correo o contraseña incorrectos.' })
  const tenant = await resolveTenant(event)
  await ensureMembership(event, tenant.id, row.id)
  const m = await db.prepare('SELECT role, status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, row.id) as { role: string, status?: string }
  const status = m?.status || 'active'
  if (status === 'suspended')
    throw createError({ statusCode: 403, message: 'Tu cuenta está suspendida en esta comunidad. Si creés que es un error, escribile a un administrador.' })
  setSession(event, row.id, (row as { token_version?: number }).token_version ?? 0)
  return { user: { ...publicUser(row), role: m.role }, status }
})
