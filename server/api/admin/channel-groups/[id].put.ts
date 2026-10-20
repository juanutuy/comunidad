// Editar un grupo de canales (solo admin): renombrar y/o reordenar
// (sort). Fase 16-F.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const groupId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ name?: string, sort?: number }>(event)
  const db = await dbFor(event)
  const group = await db.prepare('SELECT * FROM channel_groups WHERE id = ? AND tenant_id = ?').get(groupId, tenant.id) as { id: number, name: string, sort: number } | undefined
  if (!group) throw createError({ statusCode: 404, message: 'Grupo no encontrado.' })
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : group.name
  if (!name) throw createError({ statusCode: 400, message: 'El grupo necesita un nombre.' })
  const sort = typeof body.sort === 'number' && Number.isFinite(body.sort) ? Math.round(body.sort) : group.sort
  await db.prepare('UPDATE channel_groups SET name = ?, sort = ? WHERE id = ?').run(name, sort, groupId)
  return { ok: true, id: groupId, name, sort }
})
