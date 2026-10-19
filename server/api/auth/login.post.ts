// Inicio de sesión con correo y contraseña (scrypt).
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
  setSession(event, row.id, (row as { token_version?: number }).token_version ?? 0)
  const m = await db.prepare('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, row.id) as { role: string }
  return { user: { ...publicUser(row), role: m.role } }
})
