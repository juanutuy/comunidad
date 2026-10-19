// Inscripción a un curso (guarda el enrollment en la base).
// Fase 4: un curso PAGO no se inscribe directo — la inscripción la
// concede el webhook de Stripe tras el pago confirmado. Aquí solo se
// verifica si ya existe un pago confirmado (por si el webhook llegó
// pero el enrollment no se creó) y se concede en ese caso.
import { requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'
import { awardPoints } from '../../../utils/points'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const course = await db.prepare('SELECT id, price_cents, status, enroll_limit FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, getRouterParam(event, 'slug')!) as { id: number, price_cents: number, status?: string, enroll_limit?: number } | undefined
  if (!course || course.status === 'draft') throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  // Fase 8: límite de inscritos (0 = sin límite). Un curso secreto o
  // privado SÍ admite inscripción por enlace directo de un miembro:
  // la visibilidad afecta a los listados, no a este endpoint.
  if (Number(course.enroll_limit || 0) > 0) {
    const already = await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, course.id, user.id)
    if (!already) {
      const count = (await db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE tenant_id = ? AND course_id = ?').get(tenant.id, course.id) as { n: number }).n
      if (count >= Number(course.enroll_limit))
        throw createError({ statusCode: 400, message: 'Este curso alcanzó su límite de inscritos.' })
    }
  }
  if (Number(course.price_cents) > 0) {
    const already = await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, course.id, user.id)
    if (!already) {
      const paid = await db.prepare("SELECT id FROM payments WHERE tenant_id = ? AND user_id = ? AND kind = 'course' AND item_id = ? AND status = 'paid'").get(tenant.id, user.id, course.id)
      if (!paid)
        throw createError({ statusCode: 402, message: 'Este curso es pago: completá la compra para inscribirte. Tu acceso se activa automáticamente cuando se confirma el pago.' })
    }
  }
  const wasEnrolled = !!await db.prepare('SELECT id FROM enrollments WHERE tenant_id = ? AND course_id = ? AND user_id = ?').get(tenant.id, course.id, user.id)
  await db.prepare('INSERT OR IGNORE INTO enrollments (tenant_id, course_id, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, course.id, user.id, nowIso())
  // Fase 5: +5 puntos la primera vez que se inscribe a un curso.
  if (!wasEnrolled) await awardPoints(event, tenant.id, user.id, 'course_enroll', course.id).catch(() => {})
  return { enrolled: true }
})
