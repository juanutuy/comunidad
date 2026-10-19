// Detalle de evento con asistentes.
import { currentAuth, resolveTenant } from '../../utils/community'
import { rawDb } from '../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const db = rawDb()
  const row = db.prepare(`SELECT e.*, u.name AS host_name, u.slug AS host_slug FROM events e LEFT JOIN users u ON u.id = e.host_id WHERE e.tenant_id = ? AND e.slug = ?`)
    .get(tenant.id, getRouterParam(event, 'slug')!) as Record<string, unknown> | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Evento no encontrado.' })
  const { user } = currentAuth(event, tenant.id)
  const attendees = db.prepare(`SELECT u.name, u.slug FROM rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = ?`).all(row.id)
  return {
    event: {
      id: row.id, slug: row.slug, title: row.title, description: row.description,
      startsAt: row.starts_at, endsAt: row.ends_at, location: row.location, category: row.category,
      host: { name: row.host_name, slug: row.host_slug },
      going: attendees.length,
      myRsvp: user ? !!db.prepare('SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?').get(row.id, user.id) : false,
    },
    attendees,
  }
})
