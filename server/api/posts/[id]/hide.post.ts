// Ocultar una publicación para mí (Fase 5): desaparece de mi feed,
// canales, búsqueda y recientes. No afecta a nadie más ni es
// moderación: la publicación sigue existiendo para el resto.
import { requireUser, resolveTenant } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const me = await requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const post = await db.prepare('SELECT id FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id)
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  await db.prepare('INSERT OR IGNORE INTO user_hidden_posts (tenant_id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)')
    .run(tenant.id, me.id, postId, nowIso())
  return { ok: true, hidden: true }
})
