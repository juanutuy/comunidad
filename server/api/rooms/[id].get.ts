import { messageFlags } from '../../utils/messageActions'
// Historial de una sala grupal (Fase 5): solo para sus miembros.
import { requireUser, resolveTenant } from '../../utils/community'
import { roomOrThrow } from '../../utils/rooms'
import { serializeChatMessage, type ChatMessageRow } from '../../utils/chat'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const roomId = Number(getRouterParam(event, 'id'))
  const room = await roomOrThrow(event, tenant.id, roomId, me.id)
  const db = await dbFor(event)
  const memberRows = await db.prepare(`SELECT u.id, u.name, u.slug, u.avatar_url FROM chat_room_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = ? ORDER BY u.name`).all(roomId) as Record<string, unknown>[]
  const rows = await db.prepare(`SELECT m.id, m.body, m.created_at, m.reply_to, m.author_id,
      u.name AS author_name, u.slug AS author_slug, u.avatar_url AS author_avatar
    FROM chat_room_messages m JOIN users u ON u.id = m.author_id
    WHERE m.room_id = ? ORDER BY m.id DESC LIMIT 100`).all(roomId) as unknown as ChatMessageRow[]
  const saved = await messageFlags(event, tenant.id, me.id, 'room', rows.map(r => Number(r.id)))
  return {
    room: {
      id: room.id, name: room.name,
      members: memberRows.map(m => ({ id: m.id, name: m.name, slug: m.slug, avatarUrl: m.avatar_url || '' })),
    },
    messages: rows.reverse().map(r => ({ ...serializeChatMessage(r), saved: saved.has(Number(r.id)), mine: r.author_id === me.id })),
  }
})
