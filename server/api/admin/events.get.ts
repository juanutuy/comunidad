// Gestión de eventos (solo admin, Fase 5): listado completo con
// conteo de asistentes confirmados (RSVP existente).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT e.*,
      (SELECT COUNT(*) FROM rsvps r WHERE r.tenant_id = e.tenant_id AND r.event_id = e.id) AS attendees
    FROM events e WHERE e.tenant_id = ? ORDER BY e.starts_at DESC`).all(tenant.id) as Record<string, unknown>[]
  return {
    events: rows.map(e => ({
      id: e.id, slug: e.slug, title: e.title, description: e.description, descriptionHtml: e.description_html || '',
      startsAt: e.starts_at, endsAt: e.ends_at, location: e.location, category: e.category, agenda: e.agenda || '',
      attendees: Number(e.attendees || 0),
    })),
  }
})
