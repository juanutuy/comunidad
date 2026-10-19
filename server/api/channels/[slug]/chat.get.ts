// Historial del chat de un canal (Fase 3). El chat es solo para
// miembros con acceso al canal: visitantes y miembros sin acceso
// (canal pago/privado) reciben 401/403, igual que el WebSocket.
import { canAccessChannel, channelBySlug, resolveTenant, currentAuth } from '../../../utils/community'
import { CHAT_SELECT, serializeChatMessage, type ChatMessageRow } from '../../../utils/chat'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const channel = await channelBySlug(event, tenant.id, slug)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const { user, role } = await currentAuth(event, tenant.id)
  if (!user) throw createError({ statusCode: 401, message: 'Iniciá sesión para ver el chat.' })
  const access = await canAccessChannel(event, user.id, role, channel)
  if (!access) throw createError({ statusCode: 403, message: 'No tenés acceso al chat de este canal.' })
  const db = await dbFor(event)
  const rows = await db.prepare(`${CHAT_SELECT} WHERE m.tenant_id = ? AND m.channel_id = ? ORDER BY m.id DESC LIMIT 100`)
    .all(tenant.id, channel.id) as ChatMessageRow[]
  return { messages: rows.reverse().map(serializeChatMessage), me: user.id }
})
