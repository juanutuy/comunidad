// Rechazar un pago manual (Fase 17, solo admin): el pago queda
// 'rejected' y NO se concede ningún acceso. El comprador recibe el
// aviso in-app y puede volver a intentarlo (un pago rechazado no
// bloquea uno nuevo: el candado anti-duplicados solo mira los
// pendientes).
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor, nowIso } from '../../../../utils/db'
import { notify } from '../../../../utils/notify'

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
  const decision = await db.prepare("UPDATE payments SET status = 'rejected', decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .run(admin.id, now, now, payment.id)
  if (!decision.changes) throw createError({ statusCode: 409, message: 'Este pago ya fue revisado.' })

  let productName = 'tu compra'
  if (payment.kind === 'channel') {
    const ch = await db.prepare('SELECT name FROM channels WHERE id = ?').get(Number(payment.item_id)) as { name: string } | undefined
    if (ch) productName = ch.name
  }
  else if (payment.kind === 'course') {
    const co = await db.prepare('SELECT title FROM courses WHERE id = ?').get(Number(payment.item_id)) as { title: string } | undefined
    if (co) productName = co.title
  }
  else if (payment.kind === 'plan') {
    const pl = await db.prepare('SELECT name FROM plans WHERE id = ?').get(Number(payment.plan_id || payment.item_id)) as { name: string } | undefined
    if (pl) productName = pl.name
  }
  await notify(event, {
    tenantId: tenant.id, userId: Number(payment.user_id), actorId: admin.id, type: 'payment',
    title: `Tu pago manual por ${productName} no fue aprobado. Si ya pagaste, escribile a la administración.`,
    link: '/pricing',
  })
  return { ok: true, status: 'rejected' }
})
