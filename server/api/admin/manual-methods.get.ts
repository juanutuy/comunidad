// Métodos de pago manual del tenant (Fase 17, solo admin): lo que el
// comprador ve al pagar por fuera — transferencia, billetera, enlace
// u otro — con las instrucciones literales para completar el pago.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare('SELECT id, type, title, details, active, sort FROM manual_payment_methods WHERE tenant_id = ? ORDER BY sort, id').all(tenant.id) as Record<string, unknown>[]
  return {
    methods: rows.map(m => ({ id: m.id, type: m.type, title: m.title, details: m.details, active: !!m.active })),
  }
})
