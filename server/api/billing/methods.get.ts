// Métodos de pago disponibles para el comprador (Fase 17): los
// métodos manuales ACTIVOS del tenant, con las instrucciones que el
// comprador tiene que ver para pagar por fuera (número de cuenta,
// billetera, enlace). Solo para usuarios en sesión: son datos de
// checkout, no vitrina pública.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { getPaymentSettings } from '../../utils/payments'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const settings = await getPaymentSettings(event, tenant.id)
  const methods = settings.manualPaymentsEnabled
    ? (await db.prepare('SELECT id, type, title, details FROM manual_payment_methods WHERE tenant_id = ? AND active = 1 ORDER BY sort, id').all(tenant.id) as Record<string, unknown>[])
      .map(m => ({ id: m.id, type: m.type, title: m.title, details: m.details }))
    : []
  return { manualEnabled: settings.manualPaymentsEnabled && methods.length > 0, currency: settings.currency, methods }
})
