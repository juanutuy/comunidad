// Conceder acceso a un canal a un miembro (Fase 16-F, «Gestionar
// miembros» en contexto). Guard: equipo (admin/moderador). Es la
// «invitación» de los canales con visibilidad privada/secreta y un
// canal gratuito cerrado: el acceso queda en channel_access con
// origen 'manual'. De paso el miembro pasa a SEGUIR el canal, para
// que le aparezca en su lateral (sin esto el acceso concedido sería
// invisible hasta buscar el canal a mano).
import { requireModerator, resolveTenant } from '../../../../utils/community'
import { dbFor, nowIso } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const channelId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ userId?: number }>(event)
  const userId = Number(body.userId || 0)
  if (!userId) throw createError({ statusCode: 400, message: 'Falta el miembro.' })
  const db = await dbFor(event)
  const channel = await db.prepare('SELECT id FROM channels WHERE id = ? AND tenant_id = ?').get(channelId, tenant.id)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const member = await db.prepare('SELECT id FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, userId)
  if (!member) throw createError({ statusCode: 404, message: 'Esa persona no es miembro de la comunidad.' })
  await db.prepare('INSERT OR IGNORE INTO channel_access (tenant_id, user_id, channel_id, source, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenant.id, userId, channelId, 'manual', nowIso())
  await db.prepare('INSERT OR IGNORE INTO follows (tenant_id, user_id, channel_id) VALUES (?, ?, ?)')
    .run(tenant.id, userId, channelId)
  return { ok: true, hasAccess: true }
})
