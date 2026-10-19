// Crear un plan de membresía del tenant (solo admin, Fase 4).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'

const INTERVALS = ['month', 'year', 'once']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string, description?: string, priceCents?: number, interval?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'El plan necesita un nombre.' })
  const priceCents = Math.max(0, Math.round(Number(body.priceCents) || 0))
  const interval = INTERVALS.includes(body.interval || '') ? body.interval! : 'month'
  const db = await dbFor(event)
  const sort = ((await db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM plans WHERE tenant_id = ?').get(tenant.id)) as { m: number }).m + 1
  const r = await db.prepare('INSERT INTO plans (tenant_id, name, description, price_cents, interval, active, sort, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
    .run(tenant.id, name, (body.description || '').trim(), priceCents, interval, sort, nowIso())
  return { plan: { id: Number(r.lastInsertRowId), name, priceCents, interval, active: true } }
})
