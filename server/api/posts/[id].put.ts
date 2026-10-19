// Editar título y cuerpo de un borrador o programado propio (Fase 5).
// Las publicaciones ya publicadas no se editan por esta vía.
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, body?: string, scheduledAt?: string }>(event)
  const db = await dbFor(event)
  const post = await db.prepare('SELECT author_id, status, kind FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id) as { author_id: number, status: string, kind: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (post.author_id !== user.id)
    throw createError({ statusCode: 403, message: 'Solo el autor puede editar este borrador.' })
  if (post.status === 'published')
    throw createError({ statusCode: 400, message: 'Una publicación ya publicada no se edita desde borradores.' })
  let title = (body.title || '').trim()
  const text = (body.body || '').trim()
  if (post.kind === 'poll' && !title && text) title = text.slice(0, 80)
  if (!title || !text) throw createError({ statusCode: 400, message: 'El borrador necesita título y contenido.' })
  let scheduledAt: string | null = null
  if (post.status === 'scheduled') {
    const when = new Date(body.scheduledAt || '')
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now())
      throw createError({ statusCode: 400, message: 'Elegí una fecha y hora futuras para programar.' })
    scheduledAt = when.toISOString()
  }
  if (scheduledAt)
    await db.prepare('UPDATE posts SET title = ?, body = ?, teaser = ?, scheduled_at = ? WHERE id = ?').run(title, text, text.slice(0, 160), scheduledAt, postId)
  else
    await db.prepare('UPDATE posts SET title = ?, body = ?, teaser = ? WHERE id = ?').run(title, text, text.slice(0, 160), postId)
  return { ok: true }
})
