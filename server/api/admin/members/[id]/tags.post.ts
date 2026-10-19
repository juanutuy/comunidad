// Asignar las etiquetas privadas de un miembro (solo admin, Fase 14):
// reemplaza el conjunto completo. Las etiquetas son invisibles para
// el miembro: nunca salen por APIs públicas.
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const targetId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ tagIds?: number[] }>(event)
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.map(Number).filter(n => Number.isInteger(n) && n > 0) : []
  const db = await dbFor(event)
  const target = await db.prepare('SELECT id FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, targetId)
  if (!target) throw createError({ statusCode: 404, message: 'Esa persona no es miembro de esta comunidad.' })
  await db.prepare('DELETE FROM member_tag_assignments WHERE tenant_id = ? AND user_id = ?').run(tenant.id, targetId)
  for (const tagId of tagIds) {
    const tag = await db.prepare('SELECT id FROM member_tags WHERE tenant_id = ? AND id = ?').get(tenant.id, tagId)
    if (!tag) continue
    await db.prepare('INSERT OR IGNORE INTO member_tag_assignments (tenant_id, tag_id, user_id) VALUES (?, ?, ?)')
      .run(tenant.id, tagId, targetId)
  }
  return { ok: true }
})
