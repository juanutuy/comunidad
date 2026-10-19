// Notificaciones del usuario actual: últimas 50 + contador de no leídas.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT n.*, u.name AS actor_name, u.slug AS actor_slug, u.avatar_url AS actor_avatar
    FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
    WHERE n.tenant_id = ? AND n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`).all(tenant.id, user.id) as Record<string, unknown>[]
  const unread = (await db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE tenant_id = ? AND user_id = ? AND is_read = 0').get(tenant.id, user.id) as { n: number }).n
  return {
    unread,
    notifications: rows.map(n => ({
      id: n.id, type: n.type, title: n.title, link: n.link, isRead: !!n.is_read, createdAt: n.created_at,
      actor: n.actor_id ? { name: n.actor_name, slug: n.actor_slug, avatarUrl: n.actor_avatar || '' } : null,
    })),
  }
})
