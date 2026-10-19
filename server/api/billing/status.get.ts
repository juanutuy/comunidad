// Estado de los pagos en línea del tenant (Fase 4): la UI usa esto
// para decidir si muestra botones de compra o «Pagos en línea
// próximamente». enabled=true solo si están las DOS claves de Stripe.
// Fase 17: suma la moneda del tenant y si hay pagos manuales
// utilizables (interruptor encendido Y al menos un método activo),
// para que el checkout ofrezca la vía manual sin otra llamada.
import { resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { getPaymentSettings } from '../../utils/payments'
import { stripeConfig, stripeEnabled } from '../../utils/stripe'
import { emailEnabled } from '../../utils/email'

export default defineEventHandler(async (event) => {
  const c = stripeConfig()
  let currency = 'USD'
  let manualEnabled = false
  try {
    const tenant = await resolveTenant(event)
    const settings = await getPaymentSettings(event, tenant.id)
    currency = settings.currency
    if (settings.manualPaymentsEnabled) {
      const db = await dbFor(event)
      const row = await db.prepare('SELECT COUNT(*) AS n FROM manual_payment_methods WHERE tenant_id = ? AND active = 1').get(tenant.id) as { n: number }
      manualEnabled = Number(row?.n || 0) > 0
    }
  }
  catch { /* sin tenant resoluble: defaults honestos */ }
  return {
    enabled: stripeEnabled(),
    publishableKey: stripeEnabled() ? c.publishableKey : '',
    emailEnabled: emailEnabled(),
    currency,
    manualEnabled,
  }
})
