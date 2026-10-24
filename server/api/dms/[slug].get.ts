import { messageFlags } from '../../utils/messageActions'
// Conversación directa con un miembro (Fase 3): historial completo
// entre ambos (últimos 200), con el estado de lectura de cada mensaje.
import { requireUser, resolveTenant } from '../../utils/community'
import { DM_SELECT, isOnline, otherMember, serializeChatMessage, type ChatMessageRow } from '../../utils/chat'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const slug = getRouterParam(event, 'slug')!
  const other = await otherMember(event, tenant.id, slug, me.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`${DM_SELECT} WHERE m.tenant_id = ? AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)) ORDER BY m.id DESC LIMIT 200`)
    .all(tenant.id, me.id, other.id, other.id, me.id) as (ChatMessageRow & { read_at: string })[]
  const saved = await messageFlags(event, tenant.id, me.id, 'dm', rows.map(r => Number(r.id)))
  return {
    other: {
      id: other.id, name: other.name, slug: other.slug, avatarUrl: other.avatar_url || '',
      lastSeenAt: other.last_seen_at || '', online: isOnline(other.last_seen_at as string),
    },
    messages: rows.reverse().map(r => ({ ...serializeChatMessage(r), saved: saved.has(Number(r.id)), readAt: r.read_at || '', mine: r.author_id === me.id })),
    me: me.id,
  }
})
