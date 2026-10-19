// Desbloquear a un miembro (Fase 5): su contenido vuelve a verse y
// los mensajes directos se rehabilitan.
import { requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const other = await db.prepare('SELECT id FROM users WHERE slug = ?').get(slug) as { id: number } | undefined
  if (!other) throw createError({ statusCode: 404, message: 'Miembro no encontrado.' })
  await db.prepare('DELETE FROM user_blocks WHERE tenant_id = ? AND blocker_id = ? AND blocked_id = ?')
    .run(tenant.id, me.id, other.id)
  return { ok: true, blocked: false }
})
