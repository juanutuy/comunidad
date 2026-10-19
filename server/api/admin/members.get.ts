// Miembros del tenant con su rol (solo admin).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { levelFor, memberStats } from '../../utils/levels'
import { getGamification } from '../../utils/gamification'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const gam = await getGamification(event, tenant.id)
  const rows = await db.prepare(`SELECT u.id, u.name, u.slug, u.email, u.avatar_url, u.created_at, m.role
    FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? ORDER BY u.name`).all(tenant.id) as Record<string, unknown>[]
  const members = []
  for (const r of rows) {
    const stats = await memberStats(event, tenant.id, r.id as number)
    members.push({
      id: r.id, name: r.name, slug: r.slug, email: r.email, avatarUrl: r.avatar_url || '',
      role: r.role, memberSince: r.created_at, points: stats.points, level: levelFor(stats.points, gam.levels).name,
    })
  }
  return { members }
})
