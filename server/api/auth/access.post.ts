// Entrar con un enlace de acceso de un solo uso (Fase 14): lo genera
// un administrador desde la ficha del miembro («Enviar enlace de
// acceso») para quien perdió su contraseña o nunca la tuvo a mano.
// El enlace vence a la hora, se usa UNA sola vez y no sirve si la
// membresía no está activa.
import { setSession } from '../../utils/auth'
import { publicUser, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string }>(event)
  const token = String(body.token || '')
  if (!token) throw createError({ statusCode: 400, message: 'Falta el enlace de acceso.' })
  const db = await dbFor(event)
  const tenant = await resolveTenant(event)
  const link = await db.prepare('SELECT * FROM access_links WHERE tenant_id = ? AND token = ?').get(tenant.id, token) as
    { id: number, user_id: number, expires_at: string, used_at: string } | undefined
  if (!link || link.used_at)
    throw createError({ statusCode: 400, message: 'Este enlace de acceso ya no sirve: pudo haber sido usado o reemplazado por uno nuevo.' })
  if (new Date(link.expires_at).getTime() <= Date.now())
    throw createError({ statusCode: 400, message: 'Este enlace de acceso venció. Pedile uno nuevo a un administrador.' })
  const m = await db.prepare('SELECT role, status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, link.user_id) as { role: string, status?: string } | undefined
  if (!m || (m.status || 'active') !== 'active')
    throw createError({ statusCode: 403, message: 'Esta cuenta no puede entrar a la comunidad en este momento.' })
  const consumed = await db.prepare("UPDATE access_links SET used_at = ? WHERE id = ? AND used_at = '' AND expires_at > ?").run(nowIso(), link.id, nowIso())
  if (!consumed.changes) throw createError({ statusCode: 400, message: 'Este enlace ya fue utilizado o venció.' })
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(link.user_id) as import('../../utils/community').UserRow
  setSession(event, user.id, (user as { token_version?: number }).token_version ?? 0)
  return { user: { ...publicUser(user), role: m.role }, status: 'active' }
})
