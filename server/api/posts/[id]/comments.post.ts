// Comentar una publicación (solo miembros con sesión).
import { requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, rawDb } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = resolveTenant(event)
  const user = requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ body?: string }>(event)
  const text = (body.body || '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'El comentario no puede estar vacío.' })
  const db = rawDb()
  if (!db.prepare('SELECT id FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id))
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const id = Number(db.prepare('INSERT INTO comments (tenant_id, post_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(tenant.id, postId, user.id, text, nowIso()).lastInsertRowid)
  return { id, body: text, author: { name: user.name, slug: user.slug } }
})
