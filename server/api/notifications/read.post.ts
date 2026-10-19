// Marcar notificaciones como leídas: una (body.id) o todas (sin id).
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ id?: number }>(event).catch(() => ({} as { id?: number }))
  const db = await dbFor(event)
  if (body?.id) {
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND tenant_id = ? AND user_id = ?').run(body.id, tenant.id, user.id)
  }
  else {
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE tenant_id = ? AND user_id = ? AND is_read = 0').run(tenant.id, user.id)
  }
  const unread = (await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE tenant_id = ? AND user_id = ? AND is_read = 0').get(tenant.id, user.id) as { n: number }).n
  return { ok: true, unread }
})
