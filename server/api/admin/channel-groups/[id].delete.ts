// Eliminar un grupo de canales (solo admin). Fase 16-F: los canales
// del grupo NO se borran — pasan al grupo por defecto (el primero
// del orden). El grupo por defecto no se puede eliminar, y tampoco
// el único grupo del tenant.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const groupId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const groups = await db.prepare('SELECT id FROM channel_groups WHERE tenant_id = ? ORDER BY sort, id').all(tenant.id) as { id: number }[]
  if (!groups.some(g => g.id === groupId))
    throw createError({ statusCode: 404, message: 'Grupo no encontrado.' })
  const fallback = groups[0]!
  if (groups.length <= 1)
    throw createError({ statusCode: 400, message: 'No se puede eliminar el único grupo de canales.' })
  if (fallback.id === groupId)
    throw createError({ statusCode: 400, message: 'El grupo por defecto no se puede eliminar: es el destino de los canales cuando se elimina otro grupo.' })
  await db.prepare('UPDATE channels SET group_id = ? WHERE group_id = ? AND tenant_id = ?').run(fallback.id, groupId, tenant.id)
  await db.prepare('DELETE FROM channel_groups WHERE id = ? AND tenant_id = ?').run(groupId, tenant.id)
  return { ok: true, movedTo: fallback.id }
})
