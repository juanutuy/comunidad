// Ingresos y órdenes (Fase 17): la vista de dinero de la consola,
// espejo honesto de la referencia — KPIs y tabla de órdenes, SIN
// buscador, SIN filtros y SIN exportar (la referencia tampoco los
// tiene). Todo sale de `payments`: nada se calcula en el cliente.
// Lectura: admin y moderador (en la referencia Moderator tiene 1
// permiso de Earnings: ver). Las decisiones (aprobar/rechazar pagos
// manuales) son solo de admin y viven en endpoints aparte.
import { requireModerator, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { getPaymentSettings } from '../../utils/payments'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireModerator(event, tenant.id)
  const db = await dbFor(event)
  const settings = await getPaymentSettings(event, tenant.id)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthIso = monthStart.toISOString()

  const total = await db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE tenant_id = ? AND status = 'paid'").get(tenant.id) as { n: number }
  const monthRevenue = await db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?").get(tenant.id, monthIso) as { n: number }
  const monthOrders = await db.prepare('SELECT COUNT(*) AS n FROM payments WHERE tenant_id = ? AND created_at >= ?').get(tenant.id, monthIso) as { n: number }
  const totalOrders = await db.prepare('SELECT COUNT(*) AS n FROM payments WHERE tenant_id = ?').get(tenant.id) as { n: number }

  const q = getQuery(event)
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 50))
  const offset = Math.max(0, Number(q.offset) || 0)
  const rows = await db.prepare(`SELECT p.id, p.kind, p.item_id, p.plan_id, p.amount_cents, p.currency, p.status, p.gateway, p.created_at,
      u.name AS buyer_name, u.email AS buyer_email,
      COALESCE(c.name, co.title, pl.name, '') AS product_name,
      pl.interval AS plan_interval,
      s.status AS sub_status, s.current_period_end AS sub_period_end
    FROM payments p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN channels c ON p.kind = 'channel' AND c.id = p.item_id
    LEFT JOIN courses co ON p.kind = 'course' AND co.id = p.item_id
    LEFT JOIN plans pl ON p.kind = 'plan' AND pl.id = p.plan_id
    LEFT JOIN member_subscriptions s ON p.kind = 'plan' AND s.tenant_id = p.tenant_id AND s.user_id = p.user_id AND s.plan_id = p.plan_id
    WHERE p.tenant_id = ? ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(tenant.id, limit, offset) as Record<string, unknown>[]

  return {
    currency: settings.currency,
    kpis: {
      totalRevenueCents: Number(total?.n || 0),
      monthRevenueCents: Number(monthRevenue?.n || 0),
      monthOrders: Number(monthOrders?.n || 0),
    },
    total: Number(totalOrders?.n || 0),
    orders: rows.map(r => ({
      id: r.id,
      buyerName: r.buyer_name, buyerEmail: r.buyer_email,
      productName: r.product_name || r.kind,
      kind: r.kind,
      priceType: r.kind === 'plan' && r.plan_interval !== 'once' ? 'subscription' : 'once',
      gateway: r.gateway || 'stripe',
      amountCents: r.amount_cents,
      paymentCurrency: String(r.currency || 'usd').toUpperCase(),
      paymentStatus: r.status,
      subscriptionStatus: r.kind === 'plan' ? (r.sub_status || '') : '',
      nextRenewal: r.kind === 'plan' && r.sub_status === 'active' ? (r.sub_period_end || '') : '',
      createdAt: r.created_at,
    })),
  }
})
