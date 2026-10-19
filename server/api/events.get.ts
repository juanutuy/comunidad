// Lista de eventos con conteo de asistentes y mi RSVP.
import { currentAuth, resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user } = await currentAuth(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT e.*, u.name AS host_name, u.slug AS host_slug FROM events e LEFT JOIN users u ON u.id = e.host_id WHERE e.tenant_id = ? ORDER BY e.starts_at`).all(tenant.id) as Record<string, unknown>[]
  const events = await Promise.all(rows.map(async e => ({
    id: e.id, slug: e.slug, title: e.title, description: e.description,
    startsAt: e.starts_at, endsAt: e.ends_at, location: e.location, category: e.category,
    host: { name: e.host_name, slug: e.host_slug },
    going: (await db.prepare('SELECT COUNT(*) AS n FROM rsvps WHERE event_id = ?').get(e.id) as unknown as { n: number }).n,
    myRsvp: user ? !!await db.prepare('SELECT id FROM rsvps WHERE event_id = ? AND user_id = ?').get(e.id, user.id) : false,
    past: new Date(e.starts_at as string) < new Date(),
  })))
  return { events }
})
