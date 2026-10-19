// RSVP a un evento (toggle "Asistiré").
import { requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'
import { awardPoints } from '../../../utils/points'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const row = await db.prepare('SELECT id FROM events WHERE tenant_id = ? AND slug = ?').get(tenant.id, getRouterParam(event, 'slug')!) as { id: number } | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Evento no encontrado.' })
  const existing = await db.prepare('SELECT id FROM rsvps WHERE tenant_id = ? AND event_id = ? AND user_id = ?').get(tenant.id, row.id, user.id)
  if (existing) {
    await db.prepare('DELETE FROM rsvps WHERE id = ?').run((existing as { id: number }).id)
    return { myRsvp: false }
  }
  await db.prepare('INSERT INTO rsvps (tenant_id, event_id, user_id) VALUES (?, ?, ?)').run(tenant.id, row.id, user.id)
  // Fase 5: +10 puntos por confirmar asistencia (una vez por evento).
  await awardPoints(event, tenant.id, user.id, 'event_rsvp', row.id).catch(() => {})
  return { myRsvp: true }
})
