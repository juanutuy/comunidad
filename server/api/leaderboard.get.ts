import { currentAuth, resolveTenant } from '../utils/community'
import { requireSessionUnlessPublic } from '../utils/privacy'
import { levelFor } from '../utils/levels'
import { getGamification } from '../utils/gamification'
import { dbFor } from '../utils/db'
import { pagination } from '../utils/pagination'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user } = await currentAuth(event, tenant.id)
  await requireSessionUnlessPublic(event, tenant.id, user)
  const db = await dbFor(event)
  const gam = await getGamification(event, tenant.id)
  const { limit, offset } = pagination(event)
  const rows = await db.prepare(`WITH
    posts_count AS (SELECT author_id, COUNT(*) AS n FROM posts WHERE tenant_id = ? AND status = 'published' GROUP BY author_id),
    comments_count AS (SELECT author_id, COUNT(*) AS n FROM comments WHERE tenant_id = ? GROUP BY author_id),
    reactions_count AS (SELECT p.author_id, COUNT(*) AS n FROM reactions r JOIN posts p ON p.id = r.post_id WHERE p.tenant_id = ? GROUP BY p.author_id),
    comment_reactions_count AS (SELECT c.author_id, COUNT(*) AS n FROM comment_reactions cr JOIN comments c ON c.id = cr.comment_id WHERE c.tenant_id = ? GROUP BY c.author_id),
    extras AS (SELECT user_id, SUM(points) AS n FROM point_events WHERE tenant_id = ? GROUP BY user_id),
    scored AS (
      SELECT u.id, u.name, u.slug, u.avatar_url,
        COALESCE(p.n, 0) AS post_count, COALESCE(c.n, 0) AS comment_count, COALESCE(r.n, 0) AS reactions_received, COALESCE(cr.n, 0) AS comment_reactions_received,
        COALESCE(p.n, 0) * ? + COALESCE(c.n, 0) * ? + COALESCE(r.n, 0) * ? + COALESCE(cr.n, 0) * ? + COALESCE(e.n, 0) AS points
      FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ? AND m.status IN ('active', 'restricted')
      LEFT JOIN posts_count p ON p.author_id = u.id LEFT JOIN comments_count c ON c.author_id = u.id
      LEFT JOIN reactions_count r ON r.author_id = u.id LEFT JOIN comment_reactions_count cr ON cr.author_id = u.id LEFT JOIN extras e ON e.user_id = u.id
    ) SELECT * FROM scored ORDER BY points DESC, id ASC LIMIT ? OFFSET ?`)
    .all(tenant.id, tenant.id, tenant.id, tenant.id, tenant.id, gam.points.post, gam.points.comment, gam.points.reaction_received, gam.points.comment_reaction, tenant.id, limit + 1, offset)
  return {
    nextOffset: rows.length > limit ? offset + limit : null,
    ranking: rows.slice(0, limit).map(r => ({ id: r.id, name: r.name, slug: r.slug, avatarUrl: r.avatar_url || '', posts: r.post_count, comments: r.comment_count,
      reactionsReceived: r.reactions_received, commentReactionsReceived: r.comment_reactions_received, points: r.points, level: levelFor(r.points, gam.levels).name })),
  }
})
