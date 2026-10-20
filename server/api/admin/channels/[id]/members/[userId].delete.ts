// Quitar el acceso concedido a un canal (Fase 16-F, «Gestionar
// miembros»). Guard: equipo (admin/moderador). Solo se retira la
// fila de channel_access: el seguimiento (follows) es del miembro
// y no se toca — puede seguir viendo el canal en su lateral, pero
// sin acceso su contenido queda bloqueado según la visibilidad.
import { requireModerator, resolveTenant } from '../../../../../utils/community'
import { dbFor } from '../../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const channelId = Number(getRouterParam(event, 'id'))
  const userId = Number(getRouterParam(event, 'userId'))
  const db = await dbFor(event)
  const channel = await db.prepare('SELECT id FROM channels WHERE id = ? AND tenant_id = ?').get(channelId, tenant.id)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  await db.prepare('DELETE FROM channel_access WHERE tenant_id = ? AND user_id = ? AND channel_id = ?')
    .run(tenant.id, userId, channelId)
  return { ok: true, hasAccess: false }
})
