// Tabla central de Contenido → Publicaciones (Fase 16): TODOS los
// posts del tenant con buscador, filtro por estado y paginación
// simple, como la tabla Content → Post de la referencia pero con
// nuestros estados reales (published|draft|scheduled|review — el
// «Edit Review» de la referencia no existe acá, ver Fase 12).
// Acceso: admin y moderator (requireModerator).
import { requireModerator, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

const STATUSES = ['published', 'draft', 'scheduled', 'review'] as const

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const status = STATUSES.includes(String(query.status) as typeof STATUSES[number]) ? String(query.status) : 'all'
  const limit = Math.min(100, Math.max(1, Number(query.limit || 25) || 25))
  const offset = Math.max(0, Number(query.offset || 0) || 0)
  const db = await dbFor(event)

  const countRows = await db.prepare('SELECT status, COUNT(*) AS n FROM posts WHERE tenant_id = ? GROUP BY status').all(tenant.id) as { status: string, n: number }[]
  const counts = { all: 0, published: 0, draft: 0, scheduled: 0, review: 0 }
  for (const r of countRows) {
    counts.all += Number(r.n)
    if (r.status === 'published' || r.status === 'draft' || r.status === 'scheduled' || r.status === 'review')
      counts[r.status] = Number(r.n)
  }

  const like = `%${q}%`
  const where = ['p.tenant_id = ?']
  const params: unknown[] = [tenant.id]
  if (status !== 'all') { where.push('p.status = ?'); params.push(status) }
  if (q) { where.push('(p.title LIKE ? OR u.name LIKE ?)'); params.push(like, like) }
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.author_id WHERE ${where.join(' AND ')}`).get(...params) as { n: number }).n
  const rows = await db.prepare(`SELECT p.id, p.slug, p.title, p.status, p.kind, p.anonymous, p.edited_at, p.created_at, p.scheduled_at,
      u.name AS author_name, u.slug AS author_slug,
      c.name AS channel_name, c.slug AS channel_slug,
      (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS reaction_count,
      (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count
    FROM posts p JOIN users u ON u.id = p.author_id JOIN channels c ON c.id = p.channel_id
    WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[]
  return {
    counts,
    total: Number(total),
    limit,
    offset,
    posts: rows.map(r => ({
      id: Number(r.id), slug: r.slug, title: r.title, status: r.status, kind: r.kind || 'post',
      anonymous: !!r.anonymous, edited: !!r.edited_at,
      createdAt: r.created_at, scheduledAt: r.scheduled_at || '',
      author: { name: r.author_name, slug: r.author_slug },
      channel: { name: r.channel_name, slug: r.channel_slug },
      reactions: Number(r.reaction_count), comments: Number(r.comment_count),
    })),
  }
})
