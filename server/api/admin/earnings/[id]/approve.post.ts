// Aprobar un pago manual (Fase 17, solo admin): recién ACÁ el pago
// pasa a 'paid' y se concede el acceso, con paymentGrantCommands — la
// misma función que usa el webhook de Stripe. Antes de esta
// aprobación el comprador no tenía nada, aunque hubiera declarado
// el pago: declarar no es cobrar.
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor, nowIso } from '../../../../utils/db'
import { notify } from '../../../../utils/notify'
import { paymentGrantCommands, periodEndForInterval } from '../../../../utils/payments'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const admin = await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const payment = await db.prepare("SELECT * FROM payments WHERE tenant_id = ? AND id = ? AND gateway = 'manual'").get(tenant.id, id) as Record<string, unknown> | undefined
  if (!payment) throw createError({ statusCode: 404, message: 'Pago manual no encontrado.' })
  if (payment.status !== 'pending')
    throw createError({ statusCode: 409, message: 'Este pago ya fue revisado.' })

  const now = nowIso()

  let periodEnd = ''
  let productName = ''
  let link = '/pricing'
  if (payment.kind === 'plan') {
    const plan = await db.prepare('SELECT name, interval FROM plans WHERE id = ?').get(Number(payment.plan_id || payment.item_id)) as { name: string, interval: string } | undefined
    periodEnd = periodEndForInterval(String(plan?.interval || 'month'))
    productName = plan?.name || 'tu plan'
  }
  else if (payment.kind === 'channel') {
    const ch = await db.prepare('SELECT name, slug FROM channels WHERE id = ?').get(Number(payment.item_id)) as { name: string, slug: string } | undefined
    productName = ch?.name || 'el canal'
    link = ch ? `/channels/${ch.slug}` : '/feeds'
  }
  else if (payment.kind === 'course') {
    const co = await db.prepare('SELECT title, slug FROM courses WHERE id = ?').get(Number(payment.item_id)) as { title: string, slug: string } | undefined
    productName = co?.title || 'el curso'
    link = co ? `/courses/${co.slug}` : '/courses'
  }

  const results = await db.batch([
    ...paymentGrantCommands(payment, { source: 'manual', periodEnd }),
    { sql: "UPDATE payments SET status = 'paid', decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'", params: [admin.id, now, now, payment.id] },
  ])
  if (!results.at(-1)?.changes) throw createError({ statusCode: 409, message: 'Este pago ya fue revisado.' })
  await notify(event, {
    tenantId: tenant.id, userId: Number(payment.user_id), actorId: admin.id, type: 'payment',
    title: `Tu pago fue aprobado: ya tenés acceso a ${productName}`,
    link,
  })
  return { ok: true, status: 'paid' }
})
