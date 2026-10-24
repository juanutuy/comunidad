import { requireUser, resolveTenant } from '../../utils/community'
import { accessibleMessage } from '../../utils/messageActions'
import { dbFor, nowIso } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ kind?: unknown, id?: unknown, saved?: unknown }>(event)
  if (!['dm', 'room'].includes(String(body.kind)) || typeof body.saved !== 'boolean') throw createError({ statusCode: 400, message: 'Solicitud inválida. / Invalid request.' })
  const kind = body.kind as 'dm' | 'room'
  const id = Number(body.id)
  await accessibleMessage(event, tenant.id, user.id, kind, id)
  const db = await dbFor(event)
  if (body.saved) await db.prepare('INSERT OR IGNORE INTO saved_messages (tenant_id, user_id, kind, message_id, created_at) VALUES (?, ?, ?, ?, ?)').run(tenant.id, user.id, kind, id, nowIso())
  else await db.prepare('DELETE FROM saved_messages WHERE tenant_id = ? AND user_id = ? AND kind = ? AND message_id = ?').run(tenant.id, user.id, kind, id)
  return { saved: body.saved }
})
