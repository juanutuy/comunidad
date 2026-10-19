// Enviar un mensaje a una sala grupal (Fase 5): persiste en
// chat_room_messages y empuja en vivo a la sala del Durable Object
// (`room:{tenant}:{roomId}`); sin tiempo real, los clientes lo
// levantan por polling contra el mismo GET.
import { requireUser, resolveTenant } from '../../utils/community'
import { roomOrThrow } from '../../utils/rooms'
import { serializeChatMessage, type ChatMessageRow } from '../../utils/chat'
import { publishRealtime, roomGroup } from '../../utils/realtime'
import { dbFor, nowIso } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const roomId = Number(getRouterParam(event, 'id'))
  await roomOrThrow(event, tenant.id, roomId, me.id)
  const body = await readBody<{ body?: string }>(event)
  const text = (body?.body || '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'El mensaje no puede estar vacío.' })
  if (text.length > 2000) throw createError({ statusCode: 400, message: 'El mensaje es demasiado largo (máx. 2000 caracteres).' })
  const db = await dbFor(event)
  const created = nowIso()
  const res = await db.prepare('INSERT INTO chat_room_messages (tenant_id, room_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenant.id, roomId, me.id, text, created)
  const message = {
    ...serializeChatMessage({
      id: Number(res.lastInsertRowId), body: text, created_at: created,
      author_id: me.id, author_name: me.name, author_slug: me.slug, author_avatar: me.avatar_url,
    } as ChatMessageRow),
    mine: true,
  }
  await publishRealtime(event, roomGroup(tenant.id, roomId), { type: 'room', message: { ...message, mine: false } })
  return { message }
})
