import type { H3Event } from 'h3'
import { dbFor } from './db'
import type { PollView } from './community'

export interface PostMetadata {
  reactions: { type: string, n: number }[]
  myReaction: string | null
  commentCount: number
  bookmarked: boolean
  poll: PollView | null
}
export async function postMetadata(event: H3Event, rows: Record<string, unknown>[], userId: number | null): Promise<Map<number, PostMetadata>> {
  const out = new Map(rows.map(row => [Number(row.id), { reactions: [], myReaction: null, commentCount: 0, bookmarked: false, poll: null } as PostMetadata]))
  if (!rows.length) return out
  const db = await dbFor(event)
  const ids = JSON.stringify(rows.map(r => Number(r.id)))
  const selected = 'post_id IN (SELECT value FROM json_each(?))'
  const reactions = await db.prepare(`SELECT post_id, type, COUNT(*) AS n FROM reactions WHERE ${selected} GROUP BY post_id, type`).all(ids)
  for (const row of reactions) out.get(row.post_id)!.reactions.push({ type: row.type, n: row.n })
  const comments = await db.prepare(`SELECT post_id, COUNT(*) AS n FROM comments WHERE ${selected} GROUP BY post_id`).all(ids)
  for (const row of comments) out.get(row.post_id)!.commentCount = row.n
  if (userId) {
    const mine = await db.prepare(`SELECT post_id, type FROM reactions WHERE ${selected} AND user_id = ?`).all(ids, userId)
    for (const row of mine) out.get(row.post_id)!.myReaction = row.type
    const saved = await db.prepare(`SELECT post_id FROM bookmarks WHERE ${selected} AND user_id = ?`).all(ids, userId)
    for (const row of saved) out.get(row.post_id)!.bookmarked = true
  }
  const polls = rows.filter(r => r.kind === 'poll').map(r => Number(r.id))
  if (polls.length) {
    const options = await db.prepare(`SELECT * FROM poll_options WHERE ${selected} ORDER BY sort, id`).all(JSON.stringify(polls))
    const votes = await db.prepare(`SELECT post_id, option_id, COUNT(*) AS n, MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine FROM poll_votes WHERE ${selected} GROUP BY post_id, option_id`).all(userId, JSON.stringify(polls))
    for (const id of polls) {
      const ownVotes = votes.filter(v => v.post_id === id)
      const total = ownVotes.reduce((sum, row) => sum + Number(row.n), 0)
      out.get(id)!.poll = {
        totalVotes: total, myOptionId: ownVotes.find(v => v.mine)?.option_id ?? null,
        options: options.filter(o => o.post_id === id).map(o => {
          const count = Number(ownVotes.find(v => v.option_id === o.id)?.n || 0)
          return { id: o.id, label: o.label, votes: count, pct: total ? Math.round(count / total * 100) : 0 }
        }),
      }
    }
  }
  return out
}
