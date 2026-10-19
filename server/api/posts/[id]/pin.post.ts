// Fijar / desfijar una publicación (solo admin del tenant).
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { rawDb } from '../../../utils/db'

export default defineEventHandler((event) => {
  const tenant = resolveTenant(event)
  requireAdmin(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = rawDb()
  const row = db.prepare('SELECT pinned FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id) as { pinned: number } | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  db.prepare('UPDATE posts SET pinned = ? WHERE id = ?').run(row.pinned ? 0 : 1, postId)
  return { pinned: !row.pinned }
})
