// Panel de administración (Fase 5; período y gráficas en la Fase 13):
// cifras reales del tenant. Los totales («De un vistazo») NO dependen
// del período; el bloque «En este período», las series temporales, los
// canales más activos y los principales contribuidores SÍ, según el
// parámetro ?range=7|30|90|365 (30 por defecto; otro valor cae a 30).
//
// Buckets de las series (regla documentada en el README, Fase 13):
//   7 y 30 días  → un bucket por día (hoy y los días anteriores).
//   90 días      → 13 buckets de 7 días desde el inicio de la ventana.
//   365 («12 meses») → los últimos 12 meses calendario, un bucket por
//                      mes (del primer día del mes de hace 11 meses).
// La ventana del período empieza al inicio del primer bucket, así las
// sumas de las series siempre coinciden con los conteos del período.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { isOnline } from '../../utils/chat'
import { dbFor } from '../../utils/db'
import { getGamification, levelForConfig } from '../../utils/gamification'

const RANGES = [7, 30, 90, 365]
const DAY_MS = 24 * 3600 * 1000

interface Bucket { label: string, start: number, end: number }

function startOfDayUtc(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function buildBuckets(range: number, nowMs: number): { buckets: Bucket[], sinceIso: string } {
  const buckets: Bucket[] = []
  if (range === 365) {
    const now = new Date(nowMs)
    const first = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
    for (let i = 0; i < 12; i++) {
      const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1)
      const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i + 1, 1)
      const d = new Date(start)
      const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      buckets.push({ label, start, end })
    }
    return { buckets, sinceIso: new Date(first).toISOString() }
  }
  if (range === 90) {
    const first = startOfDayUtc(nowMs) - 90 * DAY_MS
    for (let i = 0; i < 13; i++) {
      const start = first + i * 7 * DAY_MS
      buckets.push({ label: new Date(start).toISOString().slice(0, 10), start, end: start + 7 * DAY_MS })
    }
    return { buckets, sinceIso: new Date(first).toISOString() }
  }
  const first = startOfDayUtc(nowMs) - (range - 1) * DAY_MS
  for (let i = 0; i < range; i++) {
    const start = first + i * DAY_MS
    buckets.push({ label: new Date(start).toISOString().slice(0, 10), start, end: start + DAY_MS })
  }
  return { buckets, sinceIso: new Date(first).toISOString() }
}

function bucketize(buckets: Bucket[], timestamps: string[]): number[] {
  const counts = buckets.map(() => 0)
  for (const ts of timestamps) {
    const ms = new Date(ts).getTime()
    if (Number.isNaN(ms)) continue
    for (let i = 0; i < buckets.length; i++) {
      if (ms >= buckets[i]!.start && ms < buckets[i]!.end) { counts[i]!++; break }
    }
  }
  return counts
}

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const one = async (sql: string, ...p: unknown[]) => Number(((await db.prepare(sql).get(...p)) as { n: number }).n || 0)

  const rawRange = Number(getQuery(event).range)
  const range = RANGES.includes(rawRange) ? rawRange : 30
  const { buckets, sinceIso } = buildBuckets(range, Date.now())

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

  // --- Período (Fase 13) ---
  const memberDates = memberRows.map(r => String(r.created_at)).filter(ts => ts >= sinceIso)
  const postDates = (await db.prepare("SELECT created_at FROM posts WHERE tenant_id = ? AND status = 'published' AND created_at >= ?").all(tenant.id, sinceIso) as { created_at: string }[]).map(r => r.created_at)
  const commentDates = (await db.prepare('SELECT created_at FROM comments WHERE tenant_id = ? AND created_at >= ?').all(tenant.id, sinceIso) as { created_at: string }[]).map(r => r.created_at)
  const periodRevenue = await db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?").get(tenant.id, sinceIso) as { n: number }
  const period = {
    newMembers: memberDates.length,
    posts: postDates.length,
    comments: commentDates.length,
    earningsCents: Number(periodRevenue?.n || 0),
  }
  const memberCounts = bucketize(buckets, memberDates)
  const postCounts = bucketize(buckets, postDates)
  const commentCounts = bucketize(buckets, commentDates)
  const series = {
    members: buckets.map((b, i) => ({ bucket: b.label, count: memberCounts[i]! })),
    postsComments: buckets.map((b, i) => ({ bucket: b.label, posts: postCounts[i]!, comments: commentCounts[i]! })),
  }

  const channelRows = await db.prepare(`SELECT c.id, c.name, c.slug,
      (SELECT COUNT(*) FROM posts p WHERE p.tenant_id = ? AND p.channel_id = c.id AND p.status = 'published' AND p.created_at >= ?) AS posts,
      (SELECT COUNT(*) FROM comments cm JOIN posts p2 ON p2.id = cm.post_id WHERE cm.tenant_id = ? AND p2.channel_id = c.id AND cm.created_at >= ?) AS comments
    FROM channels c WHERE c.tenant_id = ?`).all(tenant.id, sinceIso, tenant.id, sinceIso, tenant.id) as Record<string, unknown>[]
  const busiestChannels = channelRows
    .map(r => ({ id: Number(r.id), name: String(r.name), slug: String(r.slug), posts: Number(r.posts || 0), comments: Number(r.comments || 0), total: Number(r.posts || 0) + Number(r.comments || 0) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  const gamification = await getGamification(event, tenant.id)
  const contributorRows = await db.prepare(`SELECT u.id, u.name, u.slug, u.avatar_url, SUM(pe.points) AS earned,
      (SELECT COALESCE(SUM(pe2.points), 0) FROM point_events pe2 WHERE pe2.tenant_id = pe.tenant_id AND pe2.user_id = u.id) AS total
    FROM point_events pe JOIN users u ON u.id = pe.user_id
    WHERE pe.tenant_id = ? AND pe.created_at >= ?
    GROUP BY u.id ORDER BY earned DESC, u.name ASC LIMIT 8`).all(tenant.id, sinceIso) as Record<string, unknown>[]
  const topContributors = contributorRows.map((r) => {
    const totalPoints = Number(r.total || 0)
    const level = levelForConfig(gamification.levels, totalPoints)
    return {
      id: Number(r.id), name: String(r.name), slug: String(r.slug), avatarUrl: String(r.avatar_url || ''),
      earned: Number(r.earned || 0), totalPoints, levelName: level.name, levelIcon: level.icon,
    }
  })

  // Compatibilidad con lo que el Panel ya consumía: actividad fija de
  // 30 días (ventana propia, independiente del rango elegido).
  const since30 = new Date(Date.now() - 30 * DAY_MS).toISOString()
  const activity30 = {
    newMembers: memberRows.filter(r => String(r.created_at) >= since30).length,
    posts: await one("SELECT COUNT(*) AS n FROM posts WHERE tenant_id = ? AND status = 'published' AND created_at >= ?", tenant.id, since30),
    comments: await one('SELECT COUNT(*) AS n FROM comments WHERE tenant_id = ? AND created_at >= ?', tenant.id, since30),
  }

  // Publicaciones sin respuesta (toda la historia, como cola de
  // atención): conteo total + las 5 más recientes sin comentarios.
  const quietPosts = await db.prepare(`SELECT p.id, p.title, p.slug, p.created_at, c.slug AS channel_slug, c.name AS channel_name, u.name AS author_name
    FROM posts p JOIN channels c ON c.id = p.channel_id JOIN users u ON u.id = p.author_id
    WHERE p.tenant_id = ? AND p.status = 'published' AND NOT EXISTS (SELECT 1 FROM comments cm WHERE cm.post_id = p.id)
    ORDER BY p.created_at DESC LIMIT 5`).all(tenant.id) as Record<string, unknown>[]
  const unansweredItems = quietPosts.map(p => ({ id: p.id, title: p.title, slug: p.slug, channelSlug: p.channel_slug, channelName: p.channel_name, authorName: p.author_name, createdAt: p.created_at }))
  const unanswered = {
    count: await one(`SELECT COUNT(*) AS n FROM posts p WHERE p.tenant_id = ? AND p.status = 'published' AND NOT EXISTS (SELECT 1 FROM comments cm WHERE cm.post_id = p.id)`, tenant.id),
    items: unansweredItems,
  }

  // Fase 12: contadores de moderación para el bloque «Necesita tu
  // atención» del Panel (reportes pendientes + posts en revisión).
  // Fase 14: se suman las solicitudes de ingreso pendientes, y el
  // bloque completo se expone también como `attention`.
  const moderation = {
    pendingReports: await one("SELECT COUNT(*) AS n FROM reports WHERE tenant_id = ? AND status = 'pending'", tenant.id).catch(() => 0),
    inReview: await one("SELECT COUNT(*) AS n FROM posts WHERE tenant_id = ? AND status = 'review'", tenant.id),
    joinRequests: await one("SELECT COUNT(*) AS n FROM join_requests WHERE tenant_id = ? AND status = 'pending'", tenant.id).catch(() => 0),
  }
  const attention = { ...moderation, unanswered: unanswered.count }
  return {
    range, totals, activity30, moderation, attention, period, series, busiestChannels, topContributors, unanswered,
    generatedAt: new Date().toISOString(),
    postsWithoutComments: unansweredItems,
    recentMembers: memberRows.slice(0, 5).map(r => ({ id: r.id, name: r.name, slug: r.slug, avatarUrl: r.avatar_url || '', role: r.role, createdAt: r.created_at })),
  }
})
