// Cambiar la contraseña propia (Fase 5): verifica la actual con el
// hash scrypt existente, exige mínimo 8 caracteres y confirmación.
// Al cambiarla se incrementa users.token_version: TODAS las demás
// sesiones dejan de valer; la sesión actual se reemite con la versión
// nueva para no expulsar a quien la cambió.
import { hashPassword, setSession, verifyPassword } from '../../utils/auth'
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ current?: string, next?: string, confirm?: string }>(event)
  const next = body.next || ''
  if (next.length < 8) throw createError({ statusCode: 400, message: 'La contraseña nueva debe tener al menos 8 caracteres.' })
  if (next !== (body.confirm || '')) throw createError({ statusCode: 400, message: 'La confirmación no coincide con la contraseña nueva.' })
  const db = await dbFor(event)
  const row = await db.prepare('SELECT password_hash, token_version FROM users WHERE id = ?').get(user.id) as { password_hash: string, token_version: number }
  if (!verifyPassword(body.current || '', row.password_hash))
    throw createError({ statusCode: 401, message: 'Tu contraseña actual no es correcta.' })
  const newVersion = (row.token_version ?? 0) + 1
  await db.prepare('UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?')
    .run(hashPassword(next), newVersion, user.id)
  setSession(event, user.id, newVersion)
  return { ok: true }
})
