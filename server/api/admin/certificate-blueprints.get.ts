// Diseños de certificado (blueprints) del tenant — Fase 16.
// «Design a certificate once, then attach it to any course»: la
// lista trae, por diseño, cuántos cursos lo usan y cuántos
// certificados ya se emitieron con él (del snapshot de emisión).
// Acceso: admin y encargado de cursos (es una herramienta de cursos).
import { requireCourseManager, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare('SELECT * FROM certificate_blueprints WHERE tenant_id = ? ORDER BY created_at DESC, id DESC').all(tenant.id) as Record<string, unknown>[]
  const blueprints = []
  for (const b of rows) {
    const courses = (await db.prepare('SELECT COUNT(*) AS n FROM courses WHERE tenant_id = ? AND certificate_blueprint_id = ?').get(tenant.id, b.id) as { n: number }).n
    const issued = (await db.prepare('SELECT COUNT(*) AS n FROM certificates WHERE tenant_id = ? AND blueprint_id = ?').get(tenant.id, b.id) as { n: number }).n
    blueprints.push({
      id: Number(b.id), name: b.name, accentColor: b.accent_color, headingText: b.heading_text,
      bodyText: b.body_text, signerName: b.signer_name, signerTitle: b.signer_title,
      showLogo: !!b.show_logo, active: !!b.active,
      coursesUsing: Number(courses), certificatesIssued: issued,
      createdAt: b.created_at, updatedAt: b.updated_at,
    })
  }
  return { blueprints }
})
