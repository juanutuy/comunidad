// Serialización de comentarios (Fase 16-G): UN solo lugar arma el
// árbol de comentarios de una publicación para el detalle
// (GET /api/post) y para la sección expansible de la tarjeta
// (GET /api/posts/[id]/comments), así ambas superficies muestran
// exactamente lo mismo.
//
// Forma: raíces ordenadas por fecha (las reordena el cliente según
// el selector de orden) con `replies` SIEMPRE cronológicas. El hilo
// tiene UN nivel: comments.parent_id de una respuesta apunta a la
// raíz; responder a una respuesta cuelga de la raíz (lo garantiza
// el endpoint de creación). Cada nodo trae su adjunto (si tiene) y
// el resumen de reacciones con emojis (counts/top/total + la mía).
//
// Bloqueos (Fase 5): los comentarios de autores bloqueados por el
// lector no viajan; una respuesta visible cuya raíz quedó filtrada
// se promueve a raíz (no se pierde conversación ajena por un
// bloqueo personal).
import type { H3Event } from 'h3'
import { blockedByMe } from './blocks'
import { dbFor } from './db'
import { summarizeReactionRows } from './reactions'
import type { ReactionSummaryData } from './reactions'

export interface CommentNode {
  id: number
  body: string
  createdAt: string
  parentId: number | null
  mediaType: string
  mediaUrl: string
  mediaName: string
  author: { name: string, slug: string, avatarUrl: string }
  reactions: ReactionSummaryData['counts']
  reactionTop: string[]
  reactionTotal: number
  myReaction: string | null
  replies: CommentNode[]
}

interface CommentRow {
  id: number, body: string, created_at: string, parent_id: number | null
  media_type?: string, media_url?: string, media_name?: string
  author_id: number, author_name: string, author_slug: string, author_avatar: string | null
}

function toNode(row: CommentRow, counts: ReactionSummaryData, myReaction: string | null): CommentNode {
  return {
    id: Number(row.id),
    body: row.body,
    createdAt: row.created_at,
    parentId: row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id),
    mediaType: (row.media_type as string) || 'none',
    mediaUrl: (row.media_url as string) || '',
    mediaName: (row.media_name as string) || '',
    author: { name: row.author_name, slug: row.author_slug, avatarUrl: row.author_avatar || '' },
    reactions: counts.counts,
    reactionTop: counts.top,
    reactionTotal: counts.total,
    myReaction,
    replies: [],
  }
}

export async function fetchCommentTree(event: H3Event, tenantId: number, postId: number, userId: number | null): Promise<{ roots: CommentNode[], total: number }> {
  const db = await dbFor(event)
  const blocked = await blockedByMe(event, tenantId, userId)
  const rows = await db.prepare(`SELECT c.*, u.name AS author_name, u.slug AS author_slug, u.avatar_url AS author_avatar FROM comments c JOIN users u ON u.id = c.author_id WHERE c.post_id = ? ORDER BY c.created_at, c.id`).all(postId) as CommentRow[]
  const visible = rows.filter(c => !blocked.has(Number(c.author_id)))
  const ids = visible.map(c => Number(c.id))
  const countsByComment = new Map<number, ReactionSummaryData>()
  const mineByComment = new Map<number, string>()
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',')
    const reactionRows = await db.prepare(`SELECT comment_id, type, COUNT(*) AS n FROM comment_reactions WHERE comment_id IN (${placeholders}) GROUP BY comment_id, type`).all(...ids) as { comment_id: number, type: string, n: number }[]
    const grouped = new Map<number, { type: string, n: number }[]>()
    for (const r of reactionRows) {
      const list = grouped.get(Number(r.comment_id)) || []
      list.push({ type: r.type, n: r.n })
      grouped.set(Number(r.comment_id), list)
    }
    for (const [cid, list] of grouped) countsByComment.set(cid, summarizeReactionRows(list))
    if (userId) {
      const mine = await db.prepare(`SELECT comment_id, type FROM comment_reactions WHERE comment_id IN (${placeholders}) AND user_id = ?`).all(...ids, userId) as { comment_id: number, type: string }[]
      for (const m of mine) mineByComment.set(Number(m.comment_id), m.type)
    }
  }
  const empty = summarizeReactionRows([])
  const nodes = new Map<number, CommentNode>()
  for (const row of visible) {
    const id = Number(row.id)
    nodes.set(id, toNode(row, countsByComment.get(id) || empty, mineByComment.get(id) ?? null))
  }
  const roots: CommentNode[] = []
  for (const row of visible) {
    const node = nodes.get(Number(row.id))!
    const parentId = row.parent_id === null || row.parent_id === undefined ? null : Number(row.parent_id)
    const parent = parentId !== null ? nodes.get(parentId) : undefined
    if (parent && parentId !== Number(row.id)) parent.replies.push(node)
    else roots.push(node)
  }
  return { roots, total: visible.length }
}

// Un comentario recién creado, serializado igual que en el árbol
// (sin respuestas y sin reacciones todavía).
export async function fetchCommentNode(event: H3Event, commentId: number, userId: number | null): Promise<CommentNode | null> {
  const db = await dbFor(event)
  const row = await db.prepare(`SELECT c.*, u.name AS author_name, u.slug AS author_slug, u.avatar_url AS author_avatar FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`).get(commentId) as CommentRow | undefined
  if (!row) return null
  const reactionRows = await db.prepare('SELECT type, COUNT(*) AS n FROM comment_reactions WHERE comment_id = ? GROUP BY type').all(commentId) as { type: string, n: number }[]
  const mine = userId
    ? await db.prepare('SELECT type FROM comment_reactions WHERE comment_id = ? AND user_id = ?').get(commentId, userId) as { type: string } | undefined
    : undefined
  const node = toNode(row, summarizeReactionRows(reactionRows), mine?.type ?? null)
  return node
}
