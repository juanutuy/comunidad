// Salas grupales de chat del usuario (Fase 5): las salas donde es
// miembro, con sus integrantes y el último mensaje de cada una.
import { requireUser, resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT r.id, r.name, r.created_at,
      (SELECT COUNT(*) FROM chat_room_members m2 WHERE m2.room_id = r.id) AS member_count,
      (SELECT msg.body FROM chat_room_messages msg WHERE msg.room_id = r.id ORDER BY msg.id DESC LIMIT 1) AS last_body,
      (SELECT msg.created_at FROM chat_room_messages msg WHERE msg.room_id = r.id ORDER BY msg.id DESC LIMIT 1) AS last_at
    FROM chat_rooms r JOIN chat_room_members m ON m.room_id = r.id AND m.user_id = ?
    WHERE r.tenant_id = ? ORDER BY COALESCE(last_at, r.created_at) DESC`).all(me.id, tenant.id) as Record<string, unknown>[]
  return {
    rooms: rows.map(r => ({
      id: r.id, name: r.name, memberCount: Number(r.member_count || 0),
      lastBody: r.last_body || '', lastAt: r.last_at || r.created_at,
    })),
  }
})
