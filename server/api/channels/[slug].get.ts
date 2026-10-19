// Detalle de un canal: datos, seguimiento, acceso y sus publicaciones.
// Si el canal es pago/privado y el usuario no tiene acceso, las
// publicaciones se devuelven bloqueadas (solo teaser).
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, publishDuePosts, resolveTenant, serializePost } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { hiddenFilterSql } from '../../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const channel = await channelBySlug(event, tenant.id, slug)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const { user, role } = await currentAuth(event, tenant.id)
  const access = await canAccessChannel(event, user?.id ?? null, role, channel)
  const db = await dbFor(event)
  const following = user ? !!await db.prepare('SELECT id FROM follows WHERE tenant_id = ? AND user_id = ? AND channel_id = ?').get(tenant.id, user.id, channel.id) : false
  await publishDuePosts(event, tenant.id)
  const hf = hiddenFilterSql(user?.id ?? null)
  const rows = await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.channel_id = ? AND p.status = 'published'${hf.sql} ORDER BY p.pinned DESC, p.created_at DESC`).all(tenant.id, channel.id, ...hf.params) as Record<string, unknown>[]
  // Fase 12: en el canal también, los posts en revisión solo los ven
  // su autor y los admins (misma regla que el feed).
  if (user) {
    const reviewRows = role === 'admin'
      ? await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.channel_id = ? AND p.status = 'review'${hf.sql} ORDER BY p.created_at DESC`).all(tenant.id, channel.id, ...hf.params) as Record<string, unknown>[]
      : await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.channel_id = ? AND p.status = 'review' AND p.author_id = ?${hf.sql} ORDER BY p.created_at DESC`).all(tenant.id, channel.id, user.id, ...hf.params) as Record<string, unknown>[]
    rows.push(...reviewRows)
    rows.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || String(b.created_at).localeCompare(String(a.created_at)))
  }
  return {
    channel: {
      id: channel.id, slug: channel.slug, name: channel.name, icon: channel.icon,
      description: channel.description, type: channel.type, priceCents: channel.price_cents,
      following, hasAccess: access,
    },
    posts: await Promise.all(rows.map(r => serializePost(event, r, user?.id ?? null, access, role))),
  }
})
