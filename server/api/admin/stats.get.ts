// Panel de administración (Fase 5): cifras reales del tenant,
// actividad de los últimos 30 días y listas de atención (posts sin
// comentarios y miembros recientes).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { isOnline } from '../../utils/chat'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const one = async (sql: string, ...p: unknown[]) => Number(((await db.prepare(sql).get(...p)) as { n: number }).n || 0)
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const memberRows = await db.prepare('SELECT u.id, u.name, u.slug, u.avatar_url, u.created_at, u.last_seen_at, m.role FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ? ORDER BY u.created_at DESC').all(tenant.id) as Record<string, unknown>[]
  const revenue = await db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE tenant_id = ? AND status = 'paid'").get(tenant.id) as { n: number }

  const totals = {
    members: memberRows.length,
    onlineNow: memberRows.filter(r => isOnline(r.last_seen_at as string)).length,
    channels: await one('SELECT COUNT(*) AS n FROM channels WHERE tenant_id = ?', tenant.id),
    posts: await one("SELECT COUNT(*) AS n FROM posts WHERE tenant_id = ? AND status = 'published'", tenant.id),
    comments: await one('SELECT COUNT(*) AS n FROM comments WHERE tenant_id = ?', tenant.id),
    courses: await one("SELECT COUNT(*) AS n FROM courses WHERE tenant_id = ? AND status = 'published'", tenant.id),
    events: await one('SELECT COUNT(*) AS n FROM events WHERE tenant_id = ?', tenant.id),
    activeSubscriptions: await one("SELECT COUNT(*) AS n FROM member_subscriptions WHERE tenant_id = ? AND status = 'active'", tenant.id),
    revenueCents: Number(revenue?.n || 0),
  }
  const activity30 = {
    newMembers: memberRows.filter(r => String(r.created_at) >= since30).length,
    posts: await one("SELECT COUNT(*) AS n FROM posts WHERE tenant_id = ? AND status = 'published' AND created_at >= ?", tenant.id, since30),
    comments: await one('SELECT COUNT(*) AS n FROM comments WHERE tenant_id = ? AND created_at >= ?', tenant.id, since30),
  }
  const quietPosts = await db.prepare(`SELECT p.id, p.title, p.slug, p.created_at, c.slug AS channel_slug, c.name AS channel_name, u.name AS author_name
    FROM posts p JOIN channels c ON c.id = p.channel_id JOIN users u ON u.id = p.author_id
    WHERE p.tenant_id = ? AND p.status = 'published' AND NOT EXISTS (SELECT 1 FROM comments cm WHERE cm.post_id = p.id)
    ORDER BY p.created_at DESC LIMIT 5`).all(tenant.id) as Record<string, unknown>[]
  // Fase 12: contadores de moderación para el bloque «Necesita tu
  // atención» del Panel (reportes pendientes + posts en revisión).
  const moderation = {
    pendingReports: await one("SELECT COUNT(*) AS n FROM reports WHERE tenant_id = ? AND status = 'pending'", tenant.id).catch(() => 0),
    inReview: await one("SELECT COUNT(*) AS n FROM posts WHERE tenant_id = ? AND status = 'review'", tenant.id),
  }
  return {
    totals, activity30, moderation,
    postsWithoutComments: quietPosts.map(p => ({ id: p.id, title: p.title, slug: p.slug, channelSlug: p.channel_slug, channelName: p.channel_name, authorName: p.author_name, createdAt: p.created_at })),
    recentMembers: memberRows.slice(0, 5).map(r => ({ id: r.id, name: r.name, slug: r.slug, avatarUrl: r.avatar_url || '', role: r.role, createdAt: r.created_at })),
  }
})
