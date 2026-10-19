// Miembros del tenant con su rol, estado y etiquetas (Fase 14).
// Lectura: administradores y moderadores (la consola de Miembros es
// de ambos); las acciones (rol, estado, etiquetas…) exigen admin en
// sus propios endpoints. Filtro opcional ?tag=<id>.
// Las etiquetas son PRIVADAS: solo salen por esta API de consola.
import { requireModerator, resolveTenant } from '../../utils/community'
import { levelFor, memberStats } from '../../utils/levels'
import { getGamification } from '../../utils/gamification'
import { tagsOfMember } from '../../utils/members'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const db = await dbFor(event)
  const gam = await getGamification(event, tenant.id)
  const tagFilter = Number(getQuery(event).tag) || 0
  const rows = await db.prepare(`SELECT u.id, u.name, u.slug, u.email, u.avatar_url, u.created_at, m.role, m.status
    FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? ORDER BY u.name`).all(tenant.id) as Record<string, unknown>[]
  const members = []
  for (const r of rows) {
    const tags = await tagsOfMember(event, tenant.id, r.id as number)
    if (tagFilter && !tags.some(t => t.id === tagFilter)) continue
    const stats = await memberStats(event, tenant.id, r.id as number)
    members.push({
      id: r.id, name: r.name, slug: r.slug, email: r.email, avatarUrl: r.avatar_url || '',
      role: r.role, status: (r.status as string) || 'active',
      memberSince: r.created_at, points: stats.points, level: levelFor(stats.points, gam.levels).name,
      tags,
    })
  }
  const allTags = await db.prepare('SELECT id, name FROM member_tags WHERE tenant_id = ? ORDER BY name').all(tenant.id) as { id: number, name: string }[]
  return { members, tags: allTags }
})
