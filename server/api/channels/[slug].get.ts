// Detalle de un canal: datos, seguimiento, acceso y sus publicaciones.
// Si el canal es pago/privado y el usuario no tiene acceso, las
// publicaciones se devuelven bloqueadas (solo teaser).
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../../utils/community'
import { rawDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const channel = channelBySlug(tenant.id, slug)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const { user, role } = currentAuth(event, tenant.id)
  const access = canAccessChannel(user?.id ?? null, role, channel)
  const db = rawDb()
  const following = user ? !!db.prepare('SELECT id FROM follows WHERE tenant_id = ? AND user_id = ? AND channel_id = ?').get(tenant.id, user.id, channel.id) : false
  const rows = db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.channel_id = ? ORDER BY p.pinned DESC, p.created_at DESC`).all(tenant.id, channel.id) as Record<string, unknown>[]
  return {
    channel: {
      id: channel.id, slug: channel.slug, name: channel.name, icon: channel.icon,
      description: channel.description, type: channel.type, priceCents: channel.price_cents,
      following, hasAccess: access,
    },
    posts: rows.map(r => serializePost(r, user?.id ?? null, access)),
  }
})
