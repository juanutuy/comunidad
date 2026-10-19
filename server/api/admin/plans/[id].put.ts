// Editar un plan de membresía (solo admin, Fase 4).
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

const INTERVALS = ['month', 'year', 'once']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ name?: string, description?: string, priceCents?: number, interval?: string, active?: boolean }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'El plan necesita un nombre.' })
  const interval = INTERVALS.includes(body.interval || '') ? body.interval! : 'month'
  const db = await dbFor(event)
  const r = await db.prepare('UPDATE plans SET name = ?, description = ?, price_cents = ?, interval = ?, active = ? WHERE id = ? AND tenant_id = ?')
    .run(name, (body.description || '').trim(), Math.max(0, Math.round(Number(body.priceCents) || 0)), interval, body.active === false ? 0 : 1, id, tenant.id)
  if (!r.changes) throw createError({ statusCode: 404, message: 'Plan no encontrado.' })
  return { ok: true }
})
