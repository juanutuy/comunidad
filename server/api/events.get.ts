// Lista de eventos con conteo de asistentes y mi RSVP.
import { currentAuth, resolveTenant } from '../utils/community'
import { rawDb } from '../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const { user } = currentAuth(event, tenant.id)
  const db = rawDb()
  const rows = db.prepare(`SELECT e.*, u.name AS host_name, u.slug AS host_slug FROM events e LEFT JOIN users u ON u.id = e.host_id WHERE e.tenant_id = ? ORDER BY e.starts_at`).all(tenant.id) as Record<string, unknown>[]
  return {
    events: rows.map(e => ({
      id: e.id, slug: e.slug, title: e.title, description: e.description,
      startsAt: e.starts_at, endsAt: e.ends_at, location: e.location, category: e.category,
      host: { name: e.host_name, slug: e.host_slug },
      going: (db.prepare('SELECT COUNT(*) AS n FROM rsvps WHERE event_id = ?').get(e.id) as { n: number }).n,
      myRsvp: user ? !!db.prepare('SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?').get(e.id, user.id) : false,
      past: new Date(e.starts_at as string) < new Date(),
    })),
  }
})
