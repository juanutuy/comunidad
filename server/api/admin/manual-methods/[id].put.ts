// Editar un método de pago manual (Fase 17, solo admin): título,
// instrucciones y activo/inactivo. Desactivar no toca los pagos ya
// registrados con ese método: quedan en la cola con su título.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor, nowIso } from '../../../utils/db'

const TYPES = ['transferencia', 'billetera', 'enlace', 'otro']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ type?: string, title?: string, details?: string, active?: boolean }>(event)
  const db = await dbFor(event)
  const current = await db.prepare('SELECT * FROM manual_payment_methods WHERE tenant_id = ? AND id = ?').get(tenant.id, id) as Record<string, unknown> | undefined
  if (!current) throw createError({ statusCode: 404, message: 'Método no encontrado.' })
  const type = TYPES.includes(body.type || '') ? body.type! : String(current.type)
  const title = body.title !== undefined ? String(body.title).trim().slice(0, 120) : String(current.title)
  if (!title) throw createError({ statusCode: 400, message: 'El método necesita un título.' })
  const details = body.details !== undefined ? String(body.details).trim().slice(0, 2000) : String(current.details)
  if (!details) throw createError({ statusCode: 400, message: 'Las instrucciones no pueden quedar vacías.' })
  const active = body.active === undefined ? !!current.active : !!body.active
  await db.prepare('UPDATE manual_payment_methods SET type = ?, title = ?, details = ?, active = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .run(type, title, details, active ? 1 : 0, nowIso(), id, tenant.id)
  return { ok: true }
})
