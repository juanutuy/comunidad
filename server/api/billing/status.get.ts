// Estado de los pagos en línea del tenant (Fase 4): la UI usa esto
// para decidir si muestra botones de compra o «Pagos en línea
// próximamente». enabled=true solo si están las DOS claves de Stripe.
import { stripeConfig, stripeEnabled } from '../../utils/stripe'
import { emailEnabled } from '../../utils/email'

export default defineEventHandler(() => {
  const c = stripeConfig()
  return {
    enabled: stripeEnabled(),
    publishableKey: stripeEnabled() ? c.publishableKey : '',
    emailEnabled: emailEnabled(),
  }
})
