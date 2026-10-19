// Inscripción a un curso (guarda el enrollment en la base).
// Fase 4: un curso PAGO no se inscribe directo — la inscripción la
// concede el webhook de Stripe tras el pago confirmado. Aquí solo se
// verifica si ya existe un pago confirmado (por si el webhook llegó
// pero el enrollment no se creó) y se concede en ese caso.
import { requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id, price_cents FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, getRouterParam(event, 'slug')!) as { id: number, price_cents: number } | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  if (Number(course.price_cents) > 0) {
    const already = await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, course.id, user.id)
    if (!already) {
      const paid = await db.prepare("SELECT id FROM payments WHERE tenant_id = ? AND user_id = ? AND kind = 'course' AND item_id = ? AND status = 'paid'").get(tenant.id, user.id, course.id)
      if (!paid)
        throw createError({ statusCode: 402, message: 'Este curso es pago: completá la compra para inscribirte. Tu acceso se activa automáticamente cuando se confirma el pago.' })
    }
  }
  await db.prepare('INSERT OR IGNORE INTO enrollments (tenant_id, course_id, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, course.id, user.id, nowIso())
  return { enrolled: true }
})
