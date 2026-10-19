// Agregador de videos: publicaciones con media_type='video'.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../utils/community'
import { rawDb } from '../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  const { user, role } = currentAuth(event, tenant.id)
  const rows = rawDb().prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.media_type = 'video' ORDER BY p.created_at DESC`).all(tenant.id) as Record<string, unknown>[]
  return {
    posts: rows.map((r) => {
      const ch = channelBySlug(tenant.id, r.channel_slug as string)!
      return serializePost(r, user?.id ?? null, canAccessChannel(user?.id ?? null, role, ch))
    }),
  }
})
