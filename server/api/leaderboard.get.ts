// Ranking por puntos calculados de actividad real.
// Desde la Fase 2 cada fila incluye avatar y nivel (utils/levels.ts).
// Desde la Fase 9 los valores por acción y los umbrales de nivel salen
// de la configuración de gamificación del tenant.
import { resolveTenant } from '../utils/community'
import { levelFor } from '../utils/levels'
import { getGamification } from '../utils/gamification'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const db = await dbFor(event)
  const gam = await getGamification(event, tenant.id)
  const rows = await db.prepare(`
    SELECT u.id, u.name, u.slug, u.avatar_url,
      (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.tenant_id = ? AND p.status = 'published') AS post_count,
      (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id AND c.tenant_id = ?) AS comment_count,
      (SELECT COUNT(*) FROM reactions r JOIN posts p2 ON p2.id = r.post_id WHERE p2.author_id = u.id AND p2.tenant_id = ?) AS reactions_received,
      (SELECT COALESCE(SUM(pe.points), 0) FROM point_events pe WHERE pe.user_id = u.id AND pe.tenant_id = ?) AS extra_points
    FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
    ORDER BY u.id`).all(tenant.id, tenant.id, tenant.id, tenant.id, tenant.id) as Record<string, number | string>[]
  const ranking = rows.map((r) => {
    const points = (r.post_count as number) * gam.points.post + (r.comment_count as number) * gam.points.comment + (r.reactions_received as number) * gam.points.reaction_received + (r.extra_points as number)
    return {
      id: r.id, name: r.name, slug: r.slug, avatarUrl: (r.avatar_url as string) || '',
      posts: r.post_count, comments: r.comment_count, reactionsReceived: r.reactions_received,
      points, level: levelFor(points, gam.levels).name,
    }
  }).sort((a, b) => b.points - a.points)
  return { ranking }
})
