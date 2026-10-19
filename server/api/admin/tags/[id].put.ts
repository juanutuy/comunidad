// Renombrar una etiqueta privada (solo admin, Fase 14).
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ name?: string }>(event)
  const name = (body.name || '').trim().slice(0, 40)
  if (!name) throw createError({ statusCode: 400, message: 'La etiqueta necesita un nombre.' })
  const db = await dbFor(event)
  const tag = await db.prepare('SELECT id FROM member_tags WHERE tenant_id = ? AND id = ?').get(tenant.id, id)
  if (!tag) throw createError({ statusCode: 404, message: 'Etiqueta no encontrada.' })
  const dupe = await db.prepare('SELECT id FROM member_tags WHERE tenant_id = ? AND lower(name) = lower(?) AND id != ?').get(tenant.id, name, id)
  if (dupe) throw createError({ statusCode: 409, message: 'Ya existe una etiqueta con ese nombre.' })
  await db.prepare('UPDATE member_tags SET name = ? WHERE id = ?').run(name, id)
  return { ok: true }
})
