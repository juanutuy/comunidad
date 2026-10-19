// Seguir / dejar de seguir un canal (toggle).
import { channelBySlug, requireUser, resolveTenant } from '../../../utils/community'
import { rawDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const user = requireUser(event, tenant.id)
  const channel = channelBySlug(tenant.id, getRouterParam(event, 'slug')!)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const db = rawDb()
  const existing = db.prepare('SELECT id FROM follows WHERE tenant_id = ? AND user_id = ? AND channel_id = ?').get(tenant.id, user.id, channel.id)
  if (existing) {
    db.prepare('DELETE FROM follows WHERE id = ?').run((existing as { id: number }).id)
    return { following: false }
  }
  db.prepare('INSERT INTO follows (tenant_id, user_id, channel_id) VALUES (?, ?, ?)').run(tenant.id, user.id, channel.id)
  return { following: true }
})
