// Enviar un mensaje al chat de un canal (Fase 3): se persiste en
// chat_messages y se empuja en vivo a la sala del canal (Durable Object).
import { canAccessChannel, channelBySlug, isChannelArchived, resolveTenant, currentAuth, requireCanWrite } from '../../../utils/community'
import { assertGate, containsLink } from '../../../utils/members'
import { serializeChatMessage, type ChatMessageRow } from '../../../utils/chat'
import { publishRealtime, roomChannel } from '../../../utils/realtime'
import { dbFor, nowIso } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const channel = await channelBySlug(event, tenant.id, slug)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const { user, role } = await currentAuth(event, tenant.id)
  if (!user) throw createError({ statusCode: 401, message: 'Iniciá sesión para participar en el chat.' })
  // Fase 16: el chat de un canal archivado se cierra para los miembros.
  if (isChannelArchived(channel) && role !== 'admin')
    throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const access = await canAccessChannel(event, user.id, role, channel)
  if (!access) throw createError({ statusCode: 403, message: 'No tenés acceso al chat de este canal.' })

  const body = await readBody<{ body?: string }>(event)
  const text = (body?.body || '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'El mensaje no puede estar vacío.' })
  if (text.length > 2000) throw createError({ statusCode: 400, message: 'El mensaje es demasiado largo (máx. 2000 caracteres).' })
  // Fase 14: restricción de escritura y compuertas del chat (participar
  // y pegar enlaces son compuertas separadas, como en la referencia).
  await requireCanWrite(event, tenant.id, user.id)
  await assertGate(event, tenant.id, user.id, role, 'chat')
  if (containsLink(text)) await assertGate(event, tenant.id, user.id, role, 'chat_link')

  const db = await dbFor(event)
  const created = nowIso()
  const res = await db.prepare('INSERT INTO chat_messages (tenant_id, channel_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenant.id, channel.id, user.id, text, created)
  const message = serializeChatMessage({
    id: Number(res.lastInsertRowId), body: text, created_at: created,
    author_id: user.id, author_name: user.name, author_slug: user.slug, author_avatar: user.avatar_url,
  } as ChatMessageRow)
  await publishRealtime(event, roomChannel(tenant.id, channel.id), { type: 'chat', message })
  return { message }
})
