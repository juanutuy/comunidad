import { POST_SELECT, channelVisibility, currentAuth, publishDuePosts, resolveTenant, serializePost } from '../utils/community'
import { dbFor } from '../utils/db'
import { getPrivacySettings, requirePublicChannelsOrSession } from '../utils/privacy'
import { hiddenFilterSql } from '../utils/blocks'
import { activeSubscription, channelAccessDecision } from '../../shared/access'
import { postMetadata } from '../utils/postMetadata'
import { pagination } from '../utils/pagination'
import type { ChannelRow } from '../utils/community'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role } = await currentAuth(event, tenant.id)
  await requirePublicChannelsOrSession(event, tenant.id, user)
  const db = await dbFor(event)
  await publishDuePosts(event, tenant.id)
  const priv = await getPrivacySettings(event, tenant.id)
  const { limit, offset } = pagination(event)
  const sort = getQuery(event).sort === 'asc' ? 'asc' : 'desc'
  const channels = await db.prepare('SELECT * FROM channels WHERE tenant_id = ?').all(tenant.id) as ChannelRow[]
  const direct = new Set(user ? (await db.prepare('SELECT channel_id FROM channel_access WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id)).map(r => r.channel_id) : [])
  const subscribed = user ? await activeSubscription((sql, ...params) => db.prepare(sql).get(...params), tenant.id, user.id) : false
  const access = new Map(channels.map(c => [c.id, channelAccessDecision(c, user?.id ?? null, role, direct.has(c.id), subscribed)]))
  const visible = channels.filter(c => {
    if (!user && channelVisibility(c) !== 'public') return false
    if (c.archived_at && role !== 'admin') return false
    if (access.get(c.id)) return true
    return channelVisibility(c) === 'public' && c.type === 'paid' && priv.paidLockedWhere === 'feed'
  }).map(c => c.id)
  const hf = hiddenFilterSql(user?.id ?? null)
  const order = sort === 'asc' ? 'p.created_at ASC, p.id ASC' : 'p.pinned DESC, p.created_at DESC, p.id DESC'
  const rows = await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.channel_id IN (SELECT value FROM json_each(?))
    AND (p.status = 'published' OR (p.status = 'review' AND (? = 'admin' OR p.author_id = ?)))${hf.sql}
    ORDER BY ${order} LIMIT ? OFFSET ?`).all(tenant.id, JSON.stringify(visible), role, user?.id ?? null, ...hf.params, limit + 1, offset)
  const page = rows.slice(0, limit)
  const metadata = await postMetadata(event, page, user?.id ?? null)
  const posts = await Promise.all(page.map(r => serializePost(event, r, user?.id ?? null, access.get(r.channel_id_raw) ?? false, role, { metadata: metadata.get(r.id) })))
  return { posts, nextOffset: rows.length > limit ? offset + limit : null }
})
