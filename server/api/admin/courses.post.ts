// Crear un curso (solo admin, Fase 5). El precio reutiliza el flujo
// de la Fase 4: un curso pago no se inscribe directo, lo concede el
// pago confirmado (webhook de Stripe) o un pago ya registrado.
import { requireCourseManager, resolveTenant } from '../../utils/community'
import { parseCourseInput, parseCourseStudioFields } from '../../utils/courseAdmin'
import { nowIso, dbFor, slugify } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const body = await readBody<Record<string, unknown>>(event)
  const input = parseCourseInput(body)
  const studio = parseCourseStudioFields(body)
  const db = await dbFor(event)
  let slug = slugify(input.title)
  if (await db.prepare('SELECT id FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  // Fase 8: un curso NUEVO nace con el certificado APAGADO (es opt-in,
  // como en la referencia); los cursos que ya existían conservan el
  // comportamiento anterior por el default de la columna (1). Si el
  // body lo pide explícitamente, manda el body.
  const certificateEnabled = studio.certificateEnabled !== undefined ? studio.certificateEnabled : 0
  const id = Number((await db.prepare(`INSERT INTO courses (tenant_id, slug, title, description, short_description, description_html, level, price_cents, status, image_url, banner_url, visibility, enroll_limit, drip_mode, certificate_enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(tenant.id, slug, input.title, studio.description !== undefined ? studio.description : input.description,
      studio.shortDescription || '', studio.descriptionHtml || '', input.level, input.priceCents, input.status,
      input.imageUrl, studio.bannerUrl || '', studio.visibility || 'public', studio.enrollLimit || 0,
      studio.dripMode || 'none', certificateEnabled, nowIso())).lastInsertRowId)
  return { id, slug }
})
