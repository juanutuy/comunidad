// Pagos manuales pendientes de revisión (Fase 17, solo admin): la
// cola de decisión de Ingresos. Cada fila trae comprador, producto,
// método elegido, monto, fecha y la referencia que dejó el comprador.
// Aprobar/rechazar viven en [id]/approve y [id]/reject.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT p.id, p.kind, p.amount_cents, p.currency, p.reference, p.created_at,
      u.name AS buyer_name, u.email AS buyer_email,
      COALESCE(c.name, co.title, pl.name, '') AS product_name,
      m.title AS method_title
    FROM payments p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN channels c ON p.kind = 'channel' AND c.id = p.item_id
    LEFT JOIN courses co ON p.kind = 'course' AND co.id = p.item_id
    LEFT JOIN plans pl ON p.kind = 'plan' AND pl.id = p.plan_id
    LEFT JOIN manual_payment_methods m ON m.id = p.method_id
    WHERE p.tenant_id = ? AND p.gateway = 'manual' AND p.status = 'pending'
    ORDER BY p.id ASC`).all(tenant.id) as Record<string, unknown>[]
  return {
    pending: rows.map(r => ({
      id: r.id, kind: r.kind, amountCents: r.amount_cents,
      paymentCurrency: String(r.currency || 'usd').toUpperCase(),
      reference: r.reference || '', createdAt: r.created_at,
      buyerName: r.buyer_name, buyerEmail: r.buyer_email,
      productName: r.product_name || r.kind,
      methodTitle: r.method_title || '',
    })),
  }
})
