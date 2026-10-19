// Feed principal: publicaciones de canales públicos + seguidos por el
// usuario. Las de canales pagos/privados sin acceso van como teaser.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role } = await currentAuth(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? ORDER BY p.pinned DESC, p.created_at DESC LIMIT 50`).all(tenant.id) as Record<string, unknown>[]
  const followed = new Set(user
    ? (await db.prepare('SELECT channel_id FROM follows WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as unknown as { channel_id: number }[]).map(f => f.channel_id)
    : [])
  const posts = []
  for (const r of rows) {
    const channel = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
    const access = await canAccessChannel(event, user?.id ?? null, role, channel)
    if (channel.type !== 'free' && !followed.has(channel.id) && !access) continue
    posts.push(await serializePost(event, r, user?.id ?? null, access))
  }
  return { posts }
})
