// Pago manual (Fase 17): el comprador declara que ya pagó por fuera
// (transferencia, billetera, enlace del admin) y la compra queda
// PENDIENTE de revisión. Este endpoint NUNCA concede acceso: el
// acceso lo da recién un admin al aprobar desde Ingresos → Pagos
// pendientes (grantPaymentAccess, la misma concesión del webhook).
// Sin métodos manuales activos responde 409, igual que Stripe en
// oscuro: la app no finge canales de cobro que no existen.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { eventLocale, msg } from '../../utils/i18n'
import { getPaymentSettings, resolvePurchasable } from '../../utils/payments'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  // Fase 18: errores en el idioma del comprador.
  const locale = await eventLocale(event, tenant.id)
  const settings = await getPaymentSettings(event, tenant.id)
  if (!settings.manualPaymentsEnabled)
    throw createError({ statusCode: 409, message: await msg(event, tenant.id, 'billing.manualDisabled') })

  const body = await readBody<{ kind?: string, slug?: string, planId?: number, methodId?: number, reference?: string }>(event)
  const methodId = Number(body.methodId) || 0
  const method = await db.prepare('SELECT * FROM manual_payment_methods WHERE tenant_id = ? AND id = ? AND active = 1').get(tenant.id, methodId) as Record<string, unknown> | undefined
  if (!method) throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'billing.chooseMethod') })

  const item = await resolvePurchasable(db, tenant, body, locale)

  // Sin duplicados: un pago manual ya pendiente para el mismo
  // producto bloquea otro (la UI muestra «Tu pago está en revisión»).
  const pending = await db.prepare(`SELECT id FROM payments WHERE tenant_id = ? AND user_id = ? AND kind = ? AND item_id = ? AND gateway = 'manual' AND status = 'pending'`)
    .get(tenant.id, user.id, item.kind, item.itemId) as { id: number } | undefined
  if (pending)
    throw createError({ statusCode: 409, message: await msg(event, tenant.id, 'billing.paymentInReview') })

  // Si ya tiene el acceso, no hay nada que cobrar de nuevo.
  if (item.kind === 'channel') {
    const acc = await db.prepare('SELECT id FROM channel_access WHERE tenant_id = ? AND user_id = ? AND channel_id = ?').get(tenant.id, user.id, item.itemId)
    if (acc) throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'billing.alreadyChannelAccess') })
  }
  else if (item.kind === 'course') {
    const enr = await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND user_id = ? AND course_id = ?').get(tenant.id, user.id, item.itemId)
    if (enr) throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'billing.alreadyEnrolled') })
  }
  else if (item.kind === 'plan') {
    const sub = await db.prepare("SELECT id FROM member_subscriptions WHERE tenant_id = ? AND user_id = ? AND plan_id = ? AND status = 'active'").get(tenant.id, user.id, item.planId)
    if (sub) throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'billing.alreadySubscribed') })
  }

  const now = nowIso()
  const reference = String(body.reference || '').trim().slice(0, 300)
  const inserted = await db.prepare(`INSERT INTO payments (tenant_id, user_id, kind, item_id, plan_id, amount_cents, currency, status, gateway, method_id, reference, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'manual', ?, ?, ?, ?)`)
    .run(tenant.id, user.id, item.kind, item.itemId, item.planId, item.amountCents, settings.currency.toLowerCase(), methodId, reference, now, now)
  return { paymentId: Number(inserted.lastInsertRowId), status: 'pending' }
})
