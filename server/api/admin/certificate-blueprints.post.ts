// Crear un diseño de certificado (Fase 16). El cuerpo y el
// encabezado aceptan los marcadores {nombre}, {curso} y {fecha},
// que se reemplazan al emitir cada certificado.
import { requireCourseManager, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { parseBlueprintInput } from '../../utils/certificatesAdmin'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const body = await readBody<Record<string, unknown>>(event)
  const input = parseBlueprintInput(body)
  const db = await dbFor(event)
  const now = nowIso()
  const res = await db.prepare('INSERT INTO certificate_blueprints (tenant_id, name, accent_color, heading_text, body_text, signer_name, signer_title, show_logo, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .run(tenant.id, input.name, input.accentColor, input.headingText, input.bodyText, input.signerName, input.signerTitle, input.showLogo ? 1 : 0, now, now)
  return { ok: true, id: Number(res.lastInsertRowId) }
})
