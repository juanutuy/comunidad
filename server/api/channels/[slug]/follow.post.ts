// Seguir / dejar de seguir un canal (toggle).
import { channelBySlug, requireUser, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const channel = await channelBySlug(event, tenant.id, getRouterParam(event, 'slug')!)
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const db = await dbFor(event)
  const existing = await db.prepare('SELECT id FROM follows WHERE tenant_id = ? AND user_id = ? AND channel_id = ?').get(tenant.id, user.id, channel.id)
  if (existing) {
    await db.prepare('DELETE FROM follows WHERE id = ?').run((existing as { id: number }).id)
    return { following: false }
  }
  await db.prepare('INSERT INTO follows (tenant_id, user_id, channel_id) VALUES (?, ?, ?)').run(tenant.id, user.id, channel.id)
  return { following: true }
})
