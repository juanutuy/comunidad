// Datos del rail derecho: próximos eventos, publicaciones recientes,
// top líderes por puntos y miembros en línea (Fase 5).
import { currentAuth, resolveTenant } from '../utils/community'
import { isOnline } from '../utils/chat'
import { levelFor } from '../utils/levels'
import { getGamification } from '../utils/gamification'
import { dbFor } from '../utils/db'
import { getPrivacySettings } from '../utils/privacy'
import { hiddenFilterSql } from '../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user } = await currentAuth(event, tenant.id)
  const db = await dbFor(event)
  // Fase 15: el riel se renderiza según la config del tenant (orden,
  // visibilidad y audiencia por bloque). Para el visitante del modo
  // público, `blocks` solo trae los de audiencia 'everyone' y los
  // datos de los bloques de miembros ni siquiera viajan.
  const priv = await getPrivacySettings(event, tenant.id)
  const visitorPublic = !user && priv.visibility === 'public'
  const blocks = priv.feedSidebar
    .filter(b => b.visible)
    .filter(b => !visitorPublic || b.audience === 'everyone')
    .map(b => ({ key: b.key, audience: b.audience }))
  const blockOn = (key: string) => blocks.some(b => b.key === key)
  // Fase 7: los eventos del rail llevan anfitrión (como la referencia).
  const events = await db.prepare(`SELECT e.slug, e.title, e.starts_at, u.name AS host_name FROM events e LEFT JOIN users u ON u.id = e.host_id WHERE e.tenant_id = ? AND e.starts_at >= datetime('now') ORDER BY e.starts_at LIMIT 3`).all(tenant.id)
  const hf = hiddenFilterSql(user?.id ?? null)
  const recent = await db.prepare(`SELECT p.slug, p.title, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.tenant_id = ? AND c.type = 'free' AND p.status = 'published'${hf.sql} ORDER BY p.pinned DESC, p.created_at DESC LIMIT 5`).all(tenant.id, ...hf.params)
  // Top líderes: misma fórmula del ranking (actividad + point_events),
  // con los valores de la configuración de gamificación (Fase 9).
  const gam = await getGamification(event, tenant.id)
  const leaderRows = await db.prepare(`
    SELECT u.id, u.name, u.slug, u.avatar_url,
      (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.tenant_id = ? AND p.status = 'published') AS post_count,
      (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id AND c.tenant_id = ?) AS comment_count,
      (SELECT COUNT(*) FROM reactions r JOIN posts p2 ON p2.id = r.post_id WHERE p2.author_id = u.id AND p2.tenant_id = ?) AS reactions_received,
      (SELECT COALESCE(SUM(pe.points), 0) FROM point_events pe WHERE pe.user_id = u.id AND pe.tenant_id = ?) AS extra_points
    FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?`).all(tenant.id, tenant.id, tenant.id, tenant.id, tenant.id) as Record<string, number | string>[]
  const leaders = leaderRows.map(r => ({
    id: r.id, name: r.name, slug: r.slug, avatarUrl: (r.avatar_url as string) || '',
    points: (r.post_count as number) * gam.points.post + (r.comment_count as number) * gam.points.comment + (r.reactions_received as number) * gam.points.reaction_received + (r.extra_points as number),
  })).sort((a, b) => b.points - a.points).slice(0, 5)
    .map(l => ({ ...l, level: levelFor(l.points, gam.levels).name }))
  // En línea: última conexión WebSocket hace menos de 2 minutos.
  const memberRows = await db.prepare(`SELECT u.id, u.name, u.slug, u.avatar_url, u.last_seen_at FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ? ORDER BY u.name`).all(tenant.id) as Record<string, unknown>[]
  const online = memberRows
    .filter(r => isOnline(r.last_seen_at as string))
    .slice(0, 8)
    .map(r => ({ id: r.id, name: r.name, slug: r.slug, avatarUrl: r.avatar_url || '', me: user ? Number(r.id) === user.id : false }))
  // Fase 7: bloque MEMBERS del rail (en línea primero, como la
  // referencia, con su punto de presencia).
  const members = [...memberRows]
    .sort((a, b) => Number(isOnline(b.last_seen_at as string)) - Number(isOnline(a.last_seen_at as string)))
    .slice(0, 5)
    .map(r => ({ id: r.id, name: r.name, slug: r.slug, avatarUrl: r.avatar_url || '', online: isOnline(r.last_seen_at as string) }))
  return {
    blocks,
    events: blockOn('upcoming_events') ? events : [],
    recent: blockOn('recent_posts') ? recent : [],
    leaders: blockOn('leaders') ? leaders : [],
    online: blockOn('online_now') ? online : [],
    members: blockOn('members') ? members : [],
  }
})
