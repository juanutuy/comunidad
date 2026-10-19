// Cola de moderación (Fase 12, solo admin): reportes de contenido
// con su contexto completo y publicaciones en revisión. Los reportes
// se devuelven enriquecidos (objetivo, autor del contenido, quién
// reportó) y ordenados con los pendientes primero; la página agrupa
// los pendientes por objetivo, porque las acciones se aplican al
// objetivo, no a un reporte suelto.
import { requireModerator, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { sanitizeHtml } from '../../utils/sanitize'

interface UserMini { id: number, name: string, slug: string, avatarUrl: string }

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const db = await dbFor(event)
  const userById = async (id: number | null): Promise<UserMini | null> => {
    if (!id) return null
    const u = await db.prepare('SELECT id, name, slug, avatar_url FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return u ? { id: Number(u.id), name: String(u.name), slug: String(u.slug), avatarUrl: String(u.avatar_url || '') } : null
  }

  const reportRows = await db.prepare(`SELECT * FROM reports WHERE tenant_id = ?
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`).all(tenant.id) as Record<string, unknown>[]
  const reports = []
  for (const r of reportRows) {
    const targetType = String(r.target_type) as 'post' | 'comment'
    const targetId = Number(r.target_id)
    let target: Record<string, unknown>
    if (targetType === 'post') {
      const p = await db.prepare(`SELECT p.title, p.body, p.slug, c.slug AS channel_slug, c.name AS channel_name, p.author_id
        FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(targetId, tenant.id) as Record<string, unknown> | undefined
      target = p
        ? { exists: true, title: String(p.title), excerpt: String(p.body || '').slice(0, 280), link: `/p/${p.channel_slug}/${p.slug}`, channelName: String(p.channel_name), author: await userById(Number(p.author_id)) }
        : { exists: false, title: '', excerpt: '', link: '', channelName: '', author: null }
    }
    else {
      const c = await db.prepare('SELECT body, author_id, post_id FROM comments WHERE id = ? AND tenant_id = ?').get(targetId, tenant.id) as Record<string, unknown> | undefined
      if (c) {
        const p = await db.prepare(`SELECT p.title, p.slug, ch.slug AS channel_slug, ch.name AS channel_name
          FROM posts p JOIN channels ch ON ch.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(Number(c.post_id), tenant.id) as Record<string, unknown> | undefined
        target = {
          exists: true, title: p ? `Comentario en «${String(p.title)}»` : 'Comentario',
          excerpt: String(c.body || '').slice(0, 280),
          link: p ? `/p/${p.channel_slug}/${p.slug}` : '', channelName: p ? String(p.channel_name) : '',
          author: await userById(Number(c.author_id)),
        }
      }
      else target = { exists: false, title: '', excerpt: '', link: '', channelName: '', author: null }
    }
    reports.push({
      id: Number(r.id), targetType, targetId,
      reason: String(r.reason), note: String(r.note || ''),
      status: String(r.status), action: String(r.action || 'none'),
      createdAt: String(r.created_at), resolvedAt: String(r.resolved_at || ''),
      reporter: await userById(Number(r.reporter_id)),
      resolvedBy: await userById(r.resolved_by ? Number(r.resolved_by) : null),
      target,
    })
  }

  // Publicaciones en revisión: las más viejas primero (cola FIFO).
  const reviewRows = await db.prepare(`SELECT p.id, p.title, p.body, p.body_html, p.slug, p.kind, p.created_at, p.author_id,
      c.slug AS channel_slug, c.name AS channel_name
    FROM posts p JOIN channels c ON c.id = p.channel_id
    WHERE p.tenant_id = ? AND p.status = 'review' ORDER BY p.created_at ASC LIMIT 100`).all(tenant.id) as Record<string, unknown>[]
  const reviewPosts = []
  for (const p of reviewRows) {
    reviewPosts.push({
      id: Number(p.id), title: String(p.title),
      body: String(p.body || ''), bodyHtml: sanitizeHtml(String(p.body_html || '')),
      slug: String(p.slug), kind: String(p.kind || 'post'), createdAt: String(p.created_at),
      channel: { slug: String(p.channel_slug), name: String(p.channel_name) },
      author: await userById(Number(p.author_id)),
    })
  }

  const pendingReports = reports.filter(r => r.status === 'pending').length
  return {
    counts: { pendingReports, inReview: reviewPosts.length },
    reports, reviewPosts,
  }
})
