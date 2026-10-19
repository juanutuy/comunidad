// Borrar un diseño de certificado (Fase 16): si ya se emitieron
// certificados con este diseño, NO se borra (quedaría imposible
// explicar el origen de esos certificados): se devuelve 409 y la
// salida es desactivarlo. Sin emisiones, se borra y los cursos que
// lo tenían elegido vuelven al diseño por defecto del sistema.
import { requireCourseManager, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const blueprintId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const existing = await db.prepare('SELECT id FROM certificate_blueprints WHERE id = ? AND tenant_id = ?').get(blueprintId, tenant.id)
  if (!existing) throw createError({ statusCode: 404, message: 'Diseño no encontrado.' })
  const issuedCount = (await db.prepare('SELECT COUNT(*) AS n FROM certificates WHERE tenant_id = ? AND blueprint_id = ?').get(tenant.id, blueprintId) as { n: number }).n
  if (issuedCount > 0)
    throw createError({ statusCode: 409, message: 'Ya se emitieron certificados con este diseño: no se puede borrar. Desactivalo para que deje de ofrecerse en los cursos; los certificados emitidos no cambian.' })
  await db.prepare('UPDATE courses SET certificate_blueprint_id = NULL WHERE tenant_id = ? AND certificate_blueprint_id = ?').run(tenant.id, blueprintId)
  await db.prepare('DELETE FROM certificate_blueprints WHERE id = ?').run(blueprintId)
  return { ok: true, id: blueprintId }
})
