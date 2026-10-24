import { pagination } from '../../utils/pagination'
import { postMetadata } from '../../utils/postMetadata'
// Detalle de un canal: datos, seguimiento, acceso y sus publicaciones.
// Si el canal es pago/privado y el usuario no tiene acceso, las
// publicaciones se devuelven bloqueadas (solo teaser).
import { POST_SELECT, canAccessChannel, channelBySlug, channelContentType, channelVisibility, currentAuth, isChannelArchived, publishDuePosts, resolveTenant, serializePost } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { getPrivacySettings, requirePublicChannelOrSession } from '../../utils/privacy'
import { hiddenFilterSql } from '../../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const channel = await channelBySlug(event, tenant.id, slug)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const { user, role } = await currentAuth(event, tenant.id)
  // Fase 16: un canal archivado no está disponible para los miembros
  // (ni por enlace directo). El admin lo sigue abriendo para
  // gestionarlo desde la consola.
  if (isChannelArchived(channel) && role !== 'admin')
    throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  await requirePublicChannelOrSession(event, tenant.id, user, channel.visibility)
  const access = await canAccessChannel(event, user?.id ?? null, role, channel)
  // Fase 15: un canal privado, para quien no tiene acceso, no existe
  // (404 también acá: ni el nombre ni sus publicaciones se filtran).
  if (channel.type === 'private' && !access)
    throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const visibility = channelVisibility(channel)
  // Fase 16-F: un canal SECRETO sin acceso tampoco existe (404, como
  // el privado de siempre). Uno con visibilidad PRIVADA sin acceso
  // SÍ abre su página, pero como pantalla de bloqueo: cabecera y
  // aviso (y compra si tiene precio), sin una sola publicación.
  if (visibility === 'secret' && !access)
    throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const visibilityLocked = visibility === 'private' && !access
  const priv = await getPrivacySettings(event, tenant.id)
  // Fase 15: con «dónde aparecen» en 'hidden', el no comprador no ve
  // ni las tarjetas bloqueadas: la página del canal queda como su
  // pantalla de acceso (cabecera + compra), sin publicaciones.
  const hideLockedPosts = channel.type === 'paid' && !access && priv.paidLockedWhere === 'hidden'
  const db = await dbFor(event)
  const following = user ? !!await db.prepare('SELECT id FROM follows WHERE tenant_id = ? AND user_id = ? AND channel_id = ?').get(tenant.id, user.id, channel.id) : false
  await publishDuePosts(event, tenant.id)
  const hf = hiddenFilterSql(user?.id ?? null)
  const { limit, offset } = pagination(event)
  const pinnedRows = hideLockedPosts || visibilityLocked ? [] : await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.channel_id = ? AND p.pinned = 1
    AND (p.status = 'published' OR (p.status = 'review' AND (? = 'admin' OR p.author_id = ?)))${hf.sql}
    ORDER BY p.created_at DESC, p.id DESC LIMIT 20`)
    .all(tenant.id, channel.id, role, user?.id ?? null, ...hf.params) as Record<string, unknown>[]
  const rows = hideLockedPosts || visibilityLocked ? [] : await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.channel_id = ? AND p.pinned = 0
    AND (p.status = 'published' OR (p.status = 'review' AND (? = 'admin' OR p.author_id = ?)))${hf.sql}
    ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .all(tenant.id, channel.id, role, user?.id ?? null, ...hf.params, limit + 1, offset) as Record<string, unknown>[]
  const page = rows.slice(0, limit)
  const metadata = await postMetadata(event, [...pinnedRows, ...page], user?.id ?? null)
  return {
    channel: {
      id: channel.id, slug: channel.slug, name: channel.name, icon: channel.icon,
      description: channel.description, type: channel.type, priceCents: channel.price_cents,
      contentType: channelContentType(channel),
      coverUrl: channel.cover_url || '',
      visibility,
      groupId: channel.group_id,
      archived: isChannelArchived(channel),
      postPermission: channel.post_permission || 'members',
      following, hasAccess: access,
      visibilityLocked,
    },
    nextOffset: rows.length > limit ? offset + limit : null,
    pinnedPosts: await Promise.all(pinnedRows.map(r => serializePost(event, r, user?.id ?? null, access, role, { metadata: metadata.get(Number(r.id)) }))),
    posts: await Promise.all(page.map(r => serializePost(event, r, user?.id ?? null, access, role, { metadata: metadata.get(Number(r.id)) }))),
  }
})
