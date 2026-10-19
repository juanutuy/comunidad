// Borrar una etiqueta privada (solo admin, Fase 14): se borran
// también sus asignaciones; los miembros no pierden nada más.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const tag = await db.prepare('SELECT id FROM member_tags WHERE tenant_id = ? AND id = ?').get(tenant.id, id)
  if (!tag) throw createError({ statusCode: 404, message: 'Etiqueta no encontrada.' })
  await db.prepare('DELETE FROM member_tag_assignments WHERE tenant_id = ? AND tag_id = ?').run(tenant.id, id)
  await db.prepare('DELETE FROM member_tags WHERE id = ?').run(id)
  return { ok: true }
})
