import { accessibleMessage } from '../../utils/messageActions'
// Enviar un mensaje directo (Fase 3): persiste en dm_messages, avisa
// en vivo a la sala de la conversación (Durable Object) y crea la
// notificación in-app del destinatario (que además empuja su campana
// en vivo vía notify()).
import { currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../utils/community'
import { assertGate } from '../../utils/members'
import { otherMember, serializeChatMessage, type ChatMessageRow } from '../../utils/chat'
import { publishRealtime, roomDm } from '../../utils/realtime'
import { notify } from '../../utils/notify'
import { dbFor, nowIso } from '../../utils/db'
import { blockBetween } from '../../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  // Fase 14: restricción de escritura y compuerta de mensajes directos.
  await requireCanWrite(event, tenant.id, me.id)
  await assertGate(event, tenant.id, me.id, role, 'dm')
  const slug = getRouterParam(event, 'slug')!
  const other = await otherMember(event, tenant.id, slug, me.id)

  // Fase 5: con un bloqueo entre ambos (en cualquier sentido) no se
  // pueden enviar mensajes directos.
  if (await blockBetween(event, tenant.id, me.id, other.id as number))
    throw createError({ statusCode: 403, message: 'No se pueden enviar mensajes: hay un bloqueo entre vos y esta persona. Revisá tus ajustes de cuenta.' })
  const body = await readBody<{ body?: string, replyTo?: number }>(event)
  const text = (body?.body || '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'El mensaje no puede estar vacío.' })
  if (text.length > 2000) throw createError({ statusCode: 400, message: 'El mensaje es demasiado largo (máx. 2000 caracteres).' })

  const db = await dbFor(event)
  let replyTo = body.replyTo == null ? null : Number(body.replyTo)
  if (replyTo !== null) {
    const parent = await accessibleMessage(event, tenant.id, me.id, 'dm', replyTo)
    if (!((parent.sender_id === me.id && parent.recipient_id === other.id) || (parent.sender_id === other.id && parent.recipient_id === me.id))) throw createError({ statusCode: 400, message: 'Respuesta fuera de la conversación. / Reply outside conversation.' })
    if (parent.reply_to) replyTo = Number(parent.reply_to)
  }
  const created = nowIso()
  const res = await db.prepare('INSERT INTO dm_messages (tenant_id, sender_id, recipient_id, body, read_at, created_at, reply_to) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, me.id, other.id, text, '', created, replyTo)
  const message = {
    ...serializeChatMessage({
      id: Number(res.lastInsertRowId), body: text, created_at: created, reply_to: replyTo,
      author_id: me.id, author_name: me.name, author_slug: me.slug, author_avatar: me.avatar_url,
    } as ChatMessageRow),
    readAt: '', mine: true,
  }
  await publishRealtime(event, roomDm(tenant.id, me.id, other.id as number), { type: 'dm', message: { ...message, mine: false } })
  await notify(event, {
    tenantId: tenant.id, userId: other.id as number, actorId: me.id, type: 'dm',
    title: `${me.name} te envió un mensaje directo`, link: `/messages?with=${me.slug}`,
  })
  return { message }
})
