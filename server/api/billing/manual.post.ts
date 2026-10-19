// Pago manual (Fase 17): el comprador declara que ya pagó por fuera
// (transferencia, billetera, enlace del admin) y la compra queda
// PENDIENTE de revisión. Este endpoint NUNCA concede acceso: el
// acceso lo da recién un admin al aprobar desde Ingresos → Pagos
// pendientes (grantPaymentAccess, la misma concesión del webhook).
// Sin métodos manuales activos responde 409, igual que Stripe en
// oscuro: la app no finge canales de cobro que no existen.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { getPaymentSettings, resolvePurchasable } from '../../utils/payments'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const settings = await getPaymentSettings(event, tenant.id)
  if (!settings.manualPaymentsEnabled)
    throw createError({ statusCode: 409, message: 'Los pagos manuales no están activados en esta comunidad.' })

  const body = await readBody<{ kind?: string, slug?: string, planId?: number, methodId?: number, reference?: string }>(event)
  const methodId = Number(body.methodId) || 0
  const method = await db.prepare('SELECT * FROM manual_payment_methods WHERE tenant_id = ? AND id = ? AND active = 1').get(tenant.id, methodId) as Record<string, unknown> | undefined
  if (!method) throw createError({ statusCode: 400, message: 'Elegí un método de pago válido.' })

  const item = await resolvePurchasable(db, tenant, body)

  // Sin duplicados: un pago manual ya pendiente para el mismo
  // producto bloquea otro (la UI muestra «Tu pago está en revisión»).
  const pending = await db.prepare(`SELECT id FROM payments WHERE tenant_id = ? AND user_id = ? AND kind = ? AND item_id = ? AND gateway = 'manual' AND status = 'pending'`)
    .get(tenant.id, user.id, item.kind, item.itemId) as { id: number } | undefined
  if (pending)
    throw createError({ statusCode: 409, message: 'Tu pago ya está en revisión: la administración lo está verificando.' })

  // Si ya tiene el acceso, no hay nada que cobrar de nuevo.
  if (item.kind === 'channel') {
    const acc = await db.prepare('SELECT id FROM channel_access WHERE tenant_id = ? AND user_id = ? AND channel_id = ?').get(tenant.id, user.id, item.itemId)
    if (acc) throw createError({ statusCode: 400, message: 'Ya tenés acceso a este canal.' })
  }
  else if (item.kind === 'course') {
    const enr = await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND user_id = ? AND course_id = ?').get(tenant.id, user.id, item.itemId)
    if (enr) throw createError({ statusCode: 400, message: 'Ya estás inscrito en este curso.' })
  }
  else if (item.kind === 'plan') {
    const sub = await db.prepare("SELECT id FROM member_subscriptions WHERE tenant_id = ? AND user_id = ? AND plan_id = ? AND status = 'active'").get(tenant.id, user.id, item.planId)
    if (sub) throw createError({ statusCode: 400, message: 'Ya tenés una suscripción activa a este plan.' })
  }

  const now = nowIso()
  const reference = String(body.reference || '').trim().slice(0, 300)
  const inserted = await db.prepare(`INSERT INTO payments (tenant_id, user_id, kind, item_id, plan_id, amount_cents, currency, status, gateway, method_id, reference, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'manual', ?, ?, ?, ?)`)
    .run(tenant.id, user.id, item.kind, item.itemId, item.planId, item.amountCents, settings.currency.toLowerCase(), methodId, reference, now, now)
  return { paymentId: Number(inserted.lastInsertRowId), status: 'pending' }
})
