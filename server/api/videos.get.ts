// Agregador de videos: publicaciones con media_type='video'.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../utils/community'
import { dbFor } from '../utils/db'
import { hiddenFilterSql } from '../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role } = await currentAuth(event, tenant.id)
  const db = await dbFor(event)
  const hf = hiddenFilterSql(user?.id ?? null)
  const rows = await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.media_type = 'video' AND p.status = 'published'${hf.sql} ORDER BY p.created_at DESC`).all(tenant.id, ...hf.params) as Record<string, unknown>[]
  const posts = await Promise.all(rows.map(async (r) => {
    const ch = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
    return serializePost(event, r, user?.id ?? null, await canAccessChannel(event, user?.id ?? null, role, ch))
  }))
  return { posts }
})
