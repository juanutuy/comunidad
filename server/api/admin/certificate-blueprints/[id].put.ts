// Editar un diseño de certificado (Fase 16). Ojo: editar el diseño
// NO toca los certificados ya emitidos — cada emisión guardó su
// propia foto del diseño (ver utils/certificates.ts).
import { requireCourseManager, resolveTenant } from '../../../utils/community'
import { dbFor, nowIso } from '../../../utils/db'
import { parseBlueprintInput } from '../../../utils/certificatesAdmin'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const blueprintId = Number(getRouterParam(event, 'id'))
  const body = await readBody<Record<string, unknown>>(event)
  const db = await dbFor(event)
  const existing = await db.prepare('SELECT * FROM certificate_blueprints WHERE id = ? AND tenant_id = ?').get(blueprintId, tenant.id) as Record<string, unknown> | undefined
  if (!existing) throw createError({ statusCode: 404, message: 'Diseño no encontrado.' })
  const input = parseBlueprintInput({
    name: existing.name, accentColor: existing.accent_color, headingText: existing.heading_text,
    bodyText: existing.body_text, signerName: existing.signer_name, signerTitle: existing.signer_title,
    showLogo: !!existing.show_logo, ...body,
  })
  const active = input.active === undefined ? Number(existing.active) : (input.active ? 1 : 0)
  await db.prepare('UPDATE certificate_blueprints SET name = ?, accent_color = ?, heading_text = ?, body_text = ?, signer_name = ?, signer_title = ?, show_logo = ?, active = ?, updated_at = ? WHERE id = ?')
    .run(input.name, input.accentColor, input.headingText, input.bodyText, input.signerName, input.signerTitle, input.showLogo ? 1 : 0, active, nowIso(), blueprintId)
  return { ok: true, id: blueprintId }
})
