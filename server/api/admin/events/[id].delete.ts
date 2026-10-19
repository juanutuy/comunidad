// Borrar un evento (solo admin, Fase 5): caen también sus RSVP y
// los puntos que ese evento otorgó.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const eventId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const row = await db.prepare('SELECT id FROM events WHERE id = ? AND tenant_id = ?').get(eventId, tenant.id)
  if (!row) throw createError({ statusCode: 404, message: 'Evento no encontrado.' })
  await db.prepare("DELETE FROM point_events WHERE tenant_id = ? AND kind = 'event_rsvp' AND ref_id = ?").run(tenant.id, eventId)
  await db.prepare('DELETE FROM rsvps WHERE tenant_id = ? AND event_id = ?').run(tenant.id, eventId)
  await db.prepare('DELETE FROM events WHERE id = ?').run(eventId)
  return { ok: true }
})
