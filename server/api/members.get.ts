// Miembros del tenant para mensajes directos (Fase 3): incluye la
// última conexión registrada (users.last_seen_at, se actualiza al
// abrir un WebSocket) y los no leídos que cada uno me mandó.
import { requireUser, resolveTenant } from '../utils/community'
import { isOnline } from '../utils/chat'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT u.id, u.name, u.slug, u.avatar_url, u.last_seen_at, m.role,
      (SELECT COUNT(*) FROM dm_messages d WHERE d.tenant_id = ? AND d.sender_id = u.id AND d.recipient_id = ? AND d.read_at = '') AS unread
    FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
    WHERE u.id != ? ORDER BY u.name`).all(tenant.id, me.id, tenant.id, me.id) as Record<string, unknown>[]
  return {
    members: rows.map(r => ({
      id: r.id, name: r.name, slug: r.slug, avatarUrl: r.avatar_url || '', role: r.role,
      lastSeenAt: r.last_seen_at || '', online: isOnline(r.last_seen_at as string), unread: Number(r.unread || 0),
    })),
  }
})
