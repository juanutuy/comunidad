// Datos del certificado: solo si el usuario completó el 100% del curso.
// La fecha de finalización es la última lección completada.
// Fase 16: al resultar elegible, el certificado se EMITE (registro en
// `certificates` con código de verificación y foto del diseño
// vigente — blueprint del curso o diseño por defecto del sistema) y
// las visitas siguientes devuelven esa misma emisión: editar el
// diseño después no altera lo ya emitido. La verificación pública
// vive en /verify/[code].
import { requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'
import { issueCertificate } from '../../../utils/certificates'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const course = await db.prepare('SELECT * FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug) as Record<string, unknown> | undefined
  if (!course) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  // Fase 8: el certificado es POR CURSO — si el curso lo tiene
  // apagado (certificate_enabled = 0), no se emite aunque el avance
  // sea del 100%. Las lecciones en borrador no cuentan en el total.
  const certificateEnabled = course.certificate_enabled === undefined ? true : !!course.certificate_enabled
  const totals = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM lessons l JOIN chapters ch ON ch.id = l.chapter_id WHERE ch.course_id = ? AND l.status = 'published') AS total,
      (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
       WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ? AND l.status = 'published') AS done,
      (SELECT MAX(lp.completed_at) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN chapters ch ON ch.id = l.chapter_id
       WHERE ch.course_id = ? AND lp.user_id = ? AND lp.tenant_id = ?) AS finished_at`)
    .get(course.id, course.id, user.id, tenant.id, course.id, user.id, tenant.id) as unknown as { total: number, done: number, finished_at: string | null }
  const eligible = certificateEnabled && totals.total > 0 && totals.done >= totals.total
  let certificate = null
  if (eligible) {
    const issued = await issueCertificate(event, tenant, user, course, totals.finished_at || '')
    certificate = {
      memberName: issued.memberName, courseTitle: issued.courseTitle, communityName: issued.communityName,
      finishedAt: issued.finishedAt, code: issued.code, issuedAt: issued.issuedAt,
      design: issued.design,
      // El logo solo viaja si el diseño lo pide y la comunidad tiene
      // una marca cargada (icono primero, logo si no).
      logoUrl: issued.design.showLogo ? (tenant.icon_url || tenant.logo_url || '') : '',
    }
  }
  return {
    eligible,
    certificateEnabled,
    progress: { completed: totals.done, total: totals.total, pct: totals.total ? Math.round((totals.done / totals.total) * 100) : 0 },
    certificate,
  }
})
