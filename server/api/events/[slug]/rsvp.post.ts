// RSVP a un evento (toggle "Asistiré").
import { requireUser, resolveTenant } from '../../../utils/community'
import { rawDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const user = requireUser(event, tenant.id)
  const db = rawDb()
  const row = db.prepare('SELECT id FROM events WHERE tenant_id = ? AND slug = ?').get(tenant.id, getRouterParam(event, 'slug')!) as { id: number } | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Evento no encontrado.' })
  const existing = db.prepare('SELECT id FROM rsvps WHERE tenant_id = ? AND event_id = ? AND user_id = ?').get(tenant.id, row.id, user.id)
  if (existing) {
    db.prepare('DELETE FROM rsvps WHERE id = ?').run((existing as { id: number }).id)
    return { myRsvp: false }
  }
  db.prepare('INSERT INTO rsvps (tenant_id, event_id, user_id) VALUES (?, ?, ?)').run(tenant.id, row.id, user.id)
  return { myRsvp: true }
})
