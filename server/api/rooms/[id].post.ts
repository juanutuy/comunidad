import { accessibleMessage } from '../../utils/messageActions'
import { notify } from '../../utils/notify'
// Enviar un mensaje a una sala grupal (Fase 5): persiste en
// chat_room_messages y empuja en vivo a la sala del Durable Object
// (`room:{tenant}:{roomId}`); sin tiempo real, los clientes lo
// levantan por polling contra el mismo GET.
import { currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../utils/community'
import { assertGate, containsLink } from '../../utils/members'
import { roomOrThrow } from '../../utils/rooms'
import { serializeChatMessage, type ChatMessageRow } from '../../utils/chat'
import { publishRealtime, roomGroup } from '../../utils/realtime'
import { dbFor, nowIso } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const roomId = Number(getRouterParam(event, 'id'))
  await roomOrThrow(event, tenant.id, roomId, me.id)
  const body = await readBody<{ body?: string, replyTo?: number }>(event)
  const text = (body?.body || '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'El mensaje no puede estar vacío.' })
  if (text.length > 2000) throw createError({ statusCode: 400, message: 'El mensaje es demasiado largo (máx. 2000 caracteres).' })
  // Fase 14: restricción de escritura y compuertas del chat de salas.
  const { role } = await currentAuth(event, tenant.id)
  await requireCanWrite(event, tenant.id, me.id)
  await assertGate(event, tenant.id, me.id, role, 'chat')
  if (containsLink(text)) await assertGate(event, tenant.id, me.id, role, 'chat_link')
  const db = await dbFor(event)
  let replyTo = body.replyTo == null ? null : Number(body.replyTo)
  if (replyTo !== null) {
    const parent = await accessibleMessage(event, tenant.id, me.id, 'room', replyTo)
    if (Number(parent.room_id) !== roomId) throw createError({ statusCode: 400, message: 'Respuesta fuera de la sala. / Reply outside room.' })
    if (parent.reply_to) replyTo = Number(parent.reply_to)
  }
  const created = nowIso()
  const res = await db.prepare('INSERT INTO chat_room_messages (tenant_id, room_id, author_id, body, created_at, reply_to) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tenant.id, roomId, me.id, text, created, replyTo)
  const message = {
    ...serializeChatMessage({
      id: Number(res.lastInsertRowId), body: text, created_at: created, reply_to: replyTo,
      author_id: me.id, author_name: me.name, author_slug: me.slug, author_avatar: me.avatar_url,
    } as ChatMessageRow),
    mine: true,
  }
  await publishRealtime(event, roomGroup(tenant.id, roomId), { type: 'room', message: { ...message, mine: false } })
  // Mention only current participants of this room, never global users or other tenants.
  const mentions = [...new Set(Array.from(text.matchAll(/(?:^|\s)@([a-z0-9][a-z0-9-]{0,119})\b/gi), match => match[1]!.toLowerCase()))].slice(0, 20)
  if (mentions.length) {
    const recipients = await db.prepare(`SELECT u.id FROM users u
      JOIN chat_room_members rm ON rm.user_id = u.id AND rm.tenant_id = ? AND rm.room_id = ?
      JOIN memberships m ON m.user_id = u.id AND m.tenant_id = rm.tenant_id
      WHERE u.slug IN (SELECT value FROM json_each(?)) AND u.id <> ? AND m.status IN ('active', 'restricted')`)
      .all(tenant.id, roomId, JSON.stringify(mentions), me.id)
    for (const recipient of recipients) await notify(event, { tenantId: tenant.id, userId: recipient.id, actorId: me.id, type: 'mention', title: `${me.name} te mencionó / mentioned you`, link: `/messages?room=${roomId}` })
  }
  return { message }
})
