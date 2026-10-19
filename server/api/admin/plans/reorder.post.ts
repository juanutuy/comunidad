// Orden de exhibición y plan destacado (Fase 17, solo admin): la
// página pública de planes muestra las tarjetas en ESTE orden y
// resalta el destacado. Se escriben display_order y sort con el
// mismo índice (quedan espejados: el backfill de arranque usa sort
// y nunca debe deshacer un orden elegido acá). featuredId puede ser
// null para quitar el destacado.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ order?: number[], featuredId?: number | null }>(event)
  const db = await dbFor(event)
  const existing = await db.prepare('SELECT id FROM plans WHERE tenant_id = ?').all(tenant.id) as { id: number }[]
  const valid = new Set(existing.map(p => Number(p.id)))

  if (Array.isArray(body.order)) {
    const ids = body.order.map(Number).filter(id => valid.has(id))
    for (let i = 0; i < ids.length; i++) {
      await db.prepare('UPDATE plans SET display_order = ?, sort = ? WHERE id = ? AND tenant_id = ?')
        .run(i + 1, i + 1, ids[i], tenant.id)
    }
  }
  if (body.featuredId !== undefined) {
    const featuredId = body.featuredId === null ? 0 : Number(body.featuredId)
    if (featuredId !== 0 && !valid.has(featuredId))
      throw createError({ statusCode: 400, message: 'El plan destacado no existe en esta comunidad.' })
    await db.prepare('UPDATE plans SET featured = 0 WHERE tenant_id = ?').run(tenant.id)
    if (featuredId !== 0)
      await db.prepare('UPDATE plans SET featured = 1 WHERE id = ? AND tenant_id = ?').run(featuredId, tenant.id)
  }
  return { ok: true }
})
