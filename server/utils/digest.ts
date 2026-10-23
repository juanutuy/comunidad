import type { AsyncDb } from './db'
import { activeSubscription, channelAccessDecision } from '../../shared/access'
import type { ChannelAccessRow } from '../../shared/access'

/** Select protected metadata per recipient, applying access before count and limit. */
export async function digestPosts(db: AsyncDb, tenantId: number, userId: number, role: string, since: string) {
  const channels = await db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND archived_at = ?').all(tenantId, '') as ChannelAccessRow[]
  const direct = new Set((await db.prepare('SELECT channel_id FROM channel_access WHERE tenant_id = ? AND user_id = ?').all(tenantId, userId)).map(r => r.channel_id))
  const subscribed = await activeSubscription((sql, ...params) => db.prepare(sql).get(...params), tenantId, userId)
  const ids = channels.filter(c => channelAccessDecision(c, userId, role, direct.has(c.id), subscribed)).map(c => c.id)
  const params = [tenantId, since, JSON.stringify(ids)]
  const where = "p.tenant_id = ? AND p.status = 'published' AND p.created_at >= ? AND p.channel_id IN (SELECT value FROM json_each(?))"
  const count = await db.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE ${where}`).get(...params) as { n: number }
  const posts = await db.prepare(`SELECT p.title, c.name AS channel_name FROM posts p JOIN channels c ON c.id = p.channel_id AND c.tenant_id = p.tenant_id WHERE ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT 8`).all(...params) as { title: string, channel_name: string }[]
  return { count: count.n, posts }
}
