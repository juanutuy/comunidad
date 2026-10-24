import { requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'
import { verifyPassword } from '../../../utils/auth'
import { limitAuthAttempts } from '../../../utils/authLimits'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  await limitAuthAttempts(event, user.email)
  const body = await readBody<{ password?: string }>(event)
  const db = await dbFor(event)
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id)
  // A working password must remain available before removing a login method.
  if (typeof body.password !== 'string' || !verifyPassword(body.password, row.password_hash)) throw createError({ statusCode: 401, message: 'Contraseña actual incorrecta. / Incorrect current password.' })
  await db.prepare("DELETE FROM oauth_identities WHERE tenant_id = ? AND user_id = ? AND provider = 'google'").run(tenant.id, user.id)
  return { ok: true }
})
