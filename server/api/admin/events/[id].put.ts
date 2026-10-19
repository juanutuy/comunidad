// Editar un evento (solo admin, Fase 5). El slug no cambia.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { parseEventInput } from '../../../utils/courseAdmin'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const eventId = Number(getRouterParam(event, 'id'))
  const input = parseEventInput(await readBody(event))
  const db = await dbFor(event)
  const row = await db.prepare('SELECT id FROM events WHERE id = ? AND tenant_id = ?').get(eventId, tenant.id)
  if (!row) throw createError({ statusCode: 404, message: 'Evento no encontrado.' })
  await db.prepare('UPDATE events SET title = ?, description = ?, description_html = ?, starts_at = ?, ends_at = ?, location = ?, category = ?, agenda = ? WHERE id = ?')
    .run(input.title, input.description, input.descriptionHtml, input.startsAt, input.endsAt, input.location, input.category, input.agenda, eventId)
  return { ok: true }
})
