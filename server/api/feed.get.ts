// Feed principal: publicaciones de canales públicos + seguidos por el
// usuario. Las de canales pagos/privados sin acceso van como teaser.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../utils/community'
import { rawDb } from '../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const { user, role } = currentAuth(event, tenant.id)
  const db = rawDb()
  const rows = db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? ORDER BY p.pinned DESC, p.created_at DESC LIMIT 50`).all(tenant.id) as Record<string, unknown>[]
  const followed = new Set(user
    ? (db.prepare('SELECT channel_id FROM follows WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as { channel_id: number }[]).map(f => f.channel_id)
    : [])
  const posts = rows.filter((r) => {
    const channel = channelBySlug(tenant.id, r.channel_slug as string)!
    if (channel.type === 'free') return true
    return followed.has(channel.id) || canAccessChannel(user?.id ?? null, role, channel)
  }).map((r) => {
    const channel = channelBySlug(tenant.id, r.channel_slug as string)!
    const access = canAccessChannel(user?.id ?? null, role, channel)
    return serializePost(r, user?.id ?? null, access)
  })
  return { posts }
})
