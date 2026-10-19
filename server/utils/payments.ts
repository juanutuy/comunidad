// Pagos (Fase 17): ajustes de dinero del tenant, resolución de la
// compra (qué se está comprando y cuánto cuesta) y LA concesión de
// acceso al confirmarse un pago. La concesión es una sola función
// compartida: la usa el webhook de Stripe (Fase 4) y la aprobación
// de pagos manuales (Fase 17), para que un pago aprobado a mano
// conceda exactamente lo mismo que uno confirmado por la pasarela.
//
// Regla de oro heredada de la Fase 4: crear un pago NUNCA concede;
// solo concede grantPaymentAccess, y solo se la llama con el pago ya
// confirmado (webhook firmado) o aprobado por un admin (manual).
import type { H3Event } from 'h3'
import type { AsyncDb } from './db'
import { dbFor, nowIso } from './db'
import { serverMessage } from './i18n'
import type { AppLocale } from './i18n'
import { normalizeCurrency } from './money'

export interface PaymentSettings {
  currency: string
  manualPaymentsEnabled: boolean
}

export async function getPaymentSettings(event: H3Event, tenantId: number): Promise<PaymentSettings> {
  try {
    const db = await dbFor(event)
    const row = await db.prepare('SELECT currency, manual_payments_enabled FROM tenants WHERE id = ?').get(tenantId) as { currency?: string, manual_payments_enabled?: number } | undefined
    return {
      currency: normalizeCurrency(row?.currency),
      manualPaymentsEnabled: !!row?.manual_payments_enabled,
    }
  }
  catch {
    // Bases anteriores a la Fase 17 (sin las columnas): los defaults
    // reproducen el comportamiento de siempre.
    return { currency: 'USD', manualPaymentsEnabled: false }
  }
}

export interface Purchasable {
  kind: 'channel' | 'course' | 'plan'
  itemId: number
  planId: number
  amountCents: number
  productName: string
  interval: string // 'month' | 'year' | 'once' (solo planes; '' en el resto)
}

// Resuelve qué se compra (canal pago, curso pago o plan activo) y su
// precio REAL desde la base. Lo comparten el checkout de Stripe y el
// registro de pagos manuales: el monto nunca viene del cliente.
// Fase 18: los errores de resolución salen en el idioma del
// comprador (parámetro opcional; sin él, el idioma base).
export async function resolvePurchasable(db: AsyncDb, tenant: { id: number, name: string }, body: { kind?: string, slug?: string, planId?: number }, locale: AppLocale = 'es'): Promise<Purchasable> {
  const kind = body.kind || ''
  if (kind === 'channel') {
    const ch = await db.prepare("SELECT * FROM channels WHERE tenant_id = ? AND slug = ? AND type = 'paid'").get(tenant.id, body.slug || '') as Record<string, unknown> | undefined
    if (!ch) throw createError({ statusCode: 404, message: serverMessage(locale, 'billing.paidChannelNotFound') })
    if (!(Number(ch.price_cents) > 0)) throw createError({ statusCode: 400, message: serverMessage(locale, 'billing.channelNoPrice') })
    return { kind, itemId: Number(ch.id), planId: 0, amountCents: Number(ch.price_cents), productName: `Acceso al canal ${ch.name} · ${tenant.name}`, interval: '' }
  }
  if (kind === 'course') {
    const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, body.slug || '') as Record<string, unknown> | undefined
    if (!course) throw createError({ statusCode: 404, message: serverMessage(locale, 'billing.courseNotFound') })
    if (!(Number(course.price_cents) > 0)) throw createError({ statusCode: 400, message: serverMessage(locale, 'billing.courseFree') })
    return { kind, itemId: Number(course.id), planId: 0, amountCents: Number(course.price_cents), productName: `Curso ${course.title} · ${tenant.name}`, interval: '' }
  }
  if (kind === 'plan') {
    const plan = await db.prepare('SELECT * FROM plans WHERE tenant_id = ? AND id = ? AND active = 1').get(tenant.id, Number(body.planId) || 0) as Record<string, unknown> | undefined
    if (!plan) throw createError({ statusCode: 404, message: serverMessage(locale, 'billing.planNotFound') })
    return { kind, itemId: Number(plan.id), planId: Number(plan.id), amountCents: Number(plan.price_cents), productName: `Membresía ${plan.name} · ${tenant.name}`, interval: String(plan.interval || 'month') }
  }
  throw createError({ statusCode: 400, message: serverMessage(locale, 'billing.invalidKind') })
}

// Fin del período de una suscripción concedida a mano: Stripe informa
// el suyo por webhook; un pago manual aprobado dura un intervalo
// desde la aprobación (mensual → +1 mes, anual → +1 año, pago único
// → sin vencimiento).
export function periodEndForInterval(interval: string, fromIso = nowIso()): string {
  if (interval === 'once') return ''
  const d = new Date(fromIso)
  if (interval === 'year') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

// Concede el acceso de un pago YA confirmado. Idempotente (INSERT OR
// IGNORE / upsert), como el webhook original de la Fase 4.
// source: 'stripe' | 'manual' (queda registrado en el acceso). El
// camino de Stripe pasa además sus ids de suscripción/cliente, como
// hacía el webhook antes de esta fase; el manual pasa el fin de
// período calculado del intervalo del plan.
export interface GrantOptions {
  source: 'stripe' | 'manual'
  periodEnd?: string
  stripeSubscriptionId?: string
  stripeCustomerId?: string
}

export async function grantPaymentAccess(db: AsyncDb, payment: Record<string, unknown>, opts: GrantOptions): Promise<void> {
  const now = nowIso()
  const tenantId = Number(payment.tenant_id)
  const userId = Number(payment.user_id)
  if (payment.kind === 'channel') {
    await db.prepare('INSERT OR IGNORE INTO channel_access (tenant_id, user_id, channel_id, source, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(tenantId, userId, Number(payment.item_id), opts.source, now)
  }
  else if (payment.kind === 'course') {
    await db.prepare('INSERT OR IGNORE INTO enrollments (tenant_id, course_id, user_id, created_at) VALUES (?, ?, ?, ?)')
      .run(tenantId, Number(payment.item_id), userId, now)
  }
  else if (payment.kind === 'plan') {
    const planId = Number(payment.plan_id || payment.item_id)
    await db.prepare(`INSERT INTO member_subscriptions (tenant_id, user_id, plan_id, status, source, stripe_subscription_id, stripe_customer_id, current_period_end, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, user_id, plan_id) DO UPDATE SET status = 'active', stripe_subscription_id = excluded.stripe_subscription_id, stripe_customer_id = excluded.stripe_customer_id, current_period_end = CASE WHEN excluded.current_period_end != '' THEN excluded.current_period_end ELSE member_subscriptions.current_period_end END, updated_at = excluded.updated_at`)
      .run(tenantId, userId, planId, opts.source, opts.stripeSubscriptionId || '', opts.stripeCustomerId || '', opts.periodEnd || '', now, now)
  }
}
