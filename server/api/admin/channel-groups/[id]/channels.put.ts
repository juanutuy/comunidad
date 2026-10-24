// Guardar el orden de canales de un grupo (solo admin del tenant).
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const groupId = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(groupId) || groupId <= 0) throw createError({ statusCode: 400, message: 'Grupo no válido.' })

  const body = await readBody<{ channelIds?: unknown }>(event)
  if (!Array.isArray(body.channelIds) || body.channelIds.some(id => !Number.isSafeInteger(id) || Number(id) <= 0)) {
    throw createError({ statusCode: 400, message: 'La lista de canales no es válida.' })
  }
  const channelIds = body.channelIds as number[]
  if (new Set(channelIds).size !== channelIds.length) throw createError({ statusCode: 400, message: 'Hay canales repetidos en el orden.' })

  const db = await dbFor(event)
  const group = await db.prepare('SELECT id FROM channel_groups WHERE id = ? AND tenant_id = ?').get(groupId, tenant.id)
  if (!group) throw createError({ statusCode: 404, message: 'Grupo no encontrado.' })

  const rows = await db.prepare('SELECT id FROM channels WHERE tenant_id = ? AND group_id = ? ORDER BY sort, id').all(tenant.id, groupId) as { id: number }[]
  const expected = new Set(rows.map(row => Number(row.id)))
  if (channelIds.length !== expected.size || channelIds.some(id => !expected.has(id))) {
    throw createError({ statusCode: 400, message: 'El orden debe incluir todos los canales del grupo.' })
  }

  if (channelIds.length) {
    await db.batch(channelIds.map((id, index) => ({
      sql: 'UPDATE channels SET sort = ? WHERE id = ? AND tenant_id = ? AND group_id = ?',
      params: [index + 1, id, tenant.id, groupId],
    })))
  }
  return { ok: true, groupId, channelIds }
})
