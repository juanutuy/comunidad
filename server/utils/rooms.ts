// Acceso a salas grupales de chat (Fase 5): la sala debe existir en
// el tenant y el usuario debe ser miembro; si no, 404/403.
import type { H3Event } from 'h3'
import { dbFor } from './db'

export interface RoomRow { id: number, tenant_id: number, name: string, created_by: number, created_at: string }

export async function roomOrThrow(event: H3Event, tenantId: number, roomId: number, userId: number): Promise<RoomRow> {
  const db = await dbFor(event)
  const room = await db.prepare('SELECT * FROM chat_rooms WHERE id = ? AND tenant_id = ?').get(roomId, tenantId) as RoomRow | undefined
  if (!room) throw createError({ statusCode: 404, message: 'Sala no encontrada.' })
  const member = await db.prepare('SELECT id FROM chat_room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId)
  if (!member) throw createError({ statusCode: 403, message: 'No sos miembro de esta sala.' })
  return room
}
