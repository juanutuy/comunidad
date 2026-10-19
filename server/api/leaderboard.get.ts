// Ranking por puntos calculados de actividad real:
// publicación = 10, comentario = 3, reacción recibida = 2.
import { resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const db = await dbFor(event)
  const rows = await db.prepare(`
    SELECT u.id, u.name, u.slug,
      (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.tenant_id = ?) AS post_count,
      (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id AND c.tenant_id = ?) AS comment_count,
      (SELECT COUNT(*) FROM reactions r JOIN posts p2 ON p2.id = r.post_id WHERE p2.author_id = u.id AND p2.tenant_id = ?) AS reactions_received
    FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
    ORDER BY u.id`).all(tenant.id, tenant.id, tenant.id, tenant.id) as Record<string, number>[]
  const ranking = rows.map(r => ({
    id: r.id, name: r.name, slug: r.slug,
    posts: r.post_count, comments: r.comment_count, reactionsReceived: r.reactions_received,
    points: r.post_count! * 10 + r.comment_count! * 3 + r.reactions_received! * 2,
  })).sort((a, b) => b.points - a.points)
  return { ranking }
})
