// Editar un curso (solo admin, Fase 5). El slug no cambia para no
// romper enlaces ni pagos ya registrados con ese curso.
// Fase 8: además de los datos base acepta los campos del estudio
// (descripción corta/rica, banner, visibilidad, límite de inscritos,
// drip y certificado) SOLO si vienen en el body — actualización
// parcial, para que el autoguardado toque una cosa por vez y el
// formulario clásico siga funcionando.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { parseCourseInput, parseCourseStudioFields } from '../../../utils/courseAdmin'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const courseId = Number(getRouterParam(event, 'id'))
  const body = await readBody<Record<string, unknown>>(event)
  const studio = parseCourseStudioFields(body)
  const db = await dbFor(event)
  const existing = await db.prepare('SELECT * FROM courses WHERE id = ? AND tenant_id = ?').get(courseId, tenant.id) as Record<string, unknown> | undefined
  if (!existing) throw createError({ statusCode: 404, message: 'Curso no encontrado.' })
  // Fusión con lo guardado: el autoguardado del estudio manda de a un
  // campo y no debe pisar el resto con valores por defecto.
  const input = parseCourseInput({
    title: existing.title, description: existing.description, level: existing.level,
    priceCents: existing.price_cents, status: existing.status || 'published', imageUrl: existing.image_url || '',
    ...body,
  })
  // La descripción rica manda sobre la plana cuando viene; si el
  // formulario clásico manda solo texto plano, se descarta el HTML
  // anterior para que no queden dos versiones conviviendo.
  const descriptionHtml = studio.descriptionHtml !== undefined
    ? studio.descriptionHtml
    : (typeof body.description === 'string' && body.descriptionHtml === undefined ? '' : undefined)
  const description = studio.description !== undefined ? studio.description : input.description
  await db.prepare('UPDATE courses SET title = ?, description = ?, level = ?, price_cents = ?, status = ?, image_url = ? WHERE id = ?')
    .run(input.title, description, input.level, input.priceCents, input.status, input.imageUrl, courseId)
  const sets: string[] = []
  const params: unknown[] = []
  if (descriptionHtml !== undefined) { sets.push('description_html = ?'); params.push(descriptionHtml) }
  if (studio.shortDescription !== undefined) { sets.push('short_description = ?'); params.push(studio.shortDescription) }
  if (studio.bannerUrl !== undefined) { sets.push('banner_url = ?'); params.push(studio.bannerUrl) }
  if (studio.visibility !== undefined) { sets.push('visibility = ?'); params.push(studio.visibility) }
  if (studio.enrollLimit !== undefined) { sets.push('enroll_limit = ?'); params.push(studio.enrollLimit) }
  if (studio.dripMode !== undefined) { sets.push('drip_mode = ?'); params.push(studio.dripMode) }
  if (studio.certificateEnabled !== undefined) { sets.push('certificate_enabled = ?'); params.push(studio.certificateEnabled) }
  if (sets.length) {
    await db.prepare(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`).run(...params, courseId)
  }
  return { ok: true }
})
