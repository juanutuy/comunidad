// Feed principal: publicaciones de canales públicos + seguidos por el
// usuario. Las de canales pagos/privados sin acceso van como teaser.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, publishDuePosts, resolveTenant, serializePost } from '../utils/community'
import { dbFor } from '../utils/db'
import { hiddenFilterSql } from '../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role } = await currentAuth(event, tenant.id)
  const db = await dbFor(event)
  await publishDuePosts(event, tenant.id)
  const hf = hiddenFilterSql(user?.id ?? null)
  // Fase 7: orden del feed elegido por el lector. «Recientes» (desc,
  // por defecto) deja los fijados primero; «Antiguos» (asc) es
  // cronológico simple, sin destacar fijados — así lo hace la
  // referencia y evita que un anuncio viejo bloquee el orden.
  const sort = getQuery(event).sort === 'asc' ? 'asc' : 'desc'
  const orderBy = sort === 'asc' ? 'p.created_at ASC' : 'p.pinned DESC, p.created_at DESC'
  const rows = await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.status = 'published'${hf.sql} ORDER BY ${orderBy} LIMIT 50`).all(tenant.id, ...hf.params) as Record<string, unknown>[]
  // Fase 12: los posts en revisión SOLO aparecen en el feed de su
  // autor y de los admins (con la insignia «En revisión» que pinta
  // PostCard desde `status`). Para el resto no existen.
  if (user) {
    const reviewRows = role === 'admin'
      ? await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.status = 'review'${hf.sql} ORDER BY p.created_at DESC LIMIT 50`).all(tenant.id, ...hf.params) as Record<string, unknown>[]
      : await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.status = 'review' AND p.author_id = ?${hf.sql} ORDER BY p.created_at DESC LIMIT 50`).all(tenant.id, user.id, ...hf.params) as Record<string, unknown>[]
    rows.push(...reviewRows)
    rows.sort((a, b) => sort === 'asc'
      ? String(a.created_at).localeCompare(String(b.created_at))
      : (Number(b.pinned) - Number(a.pinned)) || String(b.created_at).localeCompare(String(a.created_at)))
  }
  const followed = new Set(user
    ? (await db.prepare('SELECT channel_id FROM follows WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as unknown as { channel_id: number }[]).map(f => f.channel_id)
    : [])
  const posts = []
  for (const r of rows) {
    const channel = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
    const access = await canAccessChannel(event, user?.id ?? null, role, channel)
    if (channel.type !== 'free' && !followed.has(channel.id) && !access) continue
    posts.push(await serializePost(event, r, user?.id ?? null, access, role))
  }
  return { posts }
})
