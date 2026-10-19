// Crear un método de pago manual (Fase 17, solo admin).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'

const TYPES = ['transferencia', 'billetera', 'enlace', 'otro']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ type?: string, title?: string, details?: string }>(event)
  const type = TYPES.includes(body.type || '') ? body.type! : 'otro'
  const title = String(body.title || '').trim().slice(0, 120)
  if (!title) throw createError({ statusCode: 400, message: 'El método necesita un título (es lo que ve el comprador).' })
  const details = String(body.details || '').trim().slice(0, 2000)
  if (!details) throw createError({ statusCode: 400, message: 'Escribí las instrucciones del método (número de cuenta, billetera, enlace…): sin eso el comprador no puede pagar.' })
  const db = await dbFor(event)
  const sort = ((await db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM manual_payment_methods WHERE tenant_id = ?').get(tenant.id)) as { m: number }).m + 1
  const now = nowIso()
  const r = await db.prepare('INSERT INTO manual_payment_methods (tenant_id, type, title, details, active, sort, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
    .run(tenant.id, type, title, details, sort, now, now)
  return { method: { id: Number(r.lastInsertRowId), type, title, details, active: true } }
})
