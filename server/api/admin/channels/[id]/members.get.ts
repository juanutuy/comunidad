// Miembros de un canal con su estado de ACCESO concedido
// (channel_access) — la lista que gestiona «Gestionar miembros»
// del menú contextual del canal (Fase 16-F). Guard: equipo
// (admin/moderador). Devuelve TODOS los miembros del tenant con la
// marca de si tienen acceso concedido a este canal y su origen;
// seguir el canal es otra relación (follows) y no se toca acá.
import { requireModerator, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const channelId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const channel = await db.prepare('SELECT id, name FROM channels WHERE id = ? AND tenant_id = ?').get(channelId, tenant.id) as { id: number, name: string } | undefined
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const rows = await db.prepare(`SELECT u.id, u.name, u.slug, u.avatar_url, m.role,
      ca.id AS access_id, ca.source AS access_source, ca.created_at AS access_at
    FROM memberships m JOIN users u ON u.id = m.user_id
    LEFT JOIN channel_access ca ON ca.tenant_id = m.tenant_id AND ca.user_id = u.id AND ca.channel_id = ?
    WHERE m.tenant_id = ? ORDER BY u.name`).all(channelId, tenant.id) as Record<string, unknown>[]
  return {
    channel: { id: channel.id, name: channel.name },
    members: rows.map(r => ({
      id: Number(r.id), name: r.name, slug: r.slug, avatarUrl: r.avatar_url || '',
      role: r.role || 'member',
      hasAccess: !!r.access_id,
      accessSource: (r.access_source as string) || '',
      accessAt: (r.access_at as string) || '',
    })),
  }
})
