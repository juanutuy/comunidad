import type { H3Event } from 'h3'
import { dbFor } from './db'
import { roomOrThrow } from './rooms'

export type MessageKind = 'dm' | 'room'
export async function accessibleMessage(event: H3Event, tenantId: number, userId: number, kind: MessageKind, id: number) {
  const db = await dbFor(event)
  if (!Number.isInteger(id) || id < 1) throw createError({ statusCode: 400, message: 'Mensaje inválido. / Invalid message.' })
  const message = kind === 'dm'
    ? await db.prepare('SELECT * FROM dm_messages WHERE tenant_id = ? AND id = ? AND (sender_id = ? OR recipient_id = ?)').get(tenantId, id, userId, userId)
    : await db.prepare('SELECT * FROM chat_room_messages WHERE tenant_id = ? AND id = ?').get(tenantId, id)
  if (!message) throw createError({ statusCode: 404, message: 'Mensaje no encontrado. / Message not found.' })
  if (kind === 'room') await roomOrThrow(event, tenantId, Number(message.room_id), userId)
  return message
}

export async function messageFlags(event: H3Event, tenantId: number, userId: number, kind: MessageKind, ids: number[]) {
  const db = await dbFor(event)
  const rows = await db.prepare('SELECT message_id FROM saved_messages WHERE tenant_id = ? AND user_id = ? AND kind = ? AND message_id IN (SELECT value FROM json_each(?))').all(tenantId, userId, kind, JSON.stringify(ids))
  return new Set(rows.map(r => Number(r.message_id)))
}
