// Editar título y cuerpo de una publicación propia (Fase 5: borradores
// y programados desde «Mis borradores»; Fase 16-B: también las YA
// PUBLICADAS, desde el menú «…» de la tarjeta — «Editar publicación»
// como en la referencia). Solo el autor; el cuerpo rico se sanitiza y
// toda edición deja la marca edited_at del «Editado».
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { htmlToText, sanitizeHtml } from '../../utils/sanitize'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, body?: string, bodyHtml?: string, scheduledAt?: string }>(event)
  const db = await dbFor(event)
  const post = await db.prepare('SELECT author_id, status, kind FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id) as { author_id: number, status: string, kind: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (post.author_id !== user.id)
    throw createError({ statusCode: 403, message: 'Solo el autor puede editar esta publicación.' })
  let title = (body.title || '').trim()
  // Fase 8: si el editor manda cuerpo rico, se sanitiza y el texto
  // plano se deriva (igual que al crear). El anónimo NO se toca acá:
  // se fija solo al crear la publicación.
  let bodyHtml: string | null = null
  let text = (body.body || '').trim()
  if (typeof body.bodyHtml === 'string') {
    bodyHtml = sanitizeHtml(body.bodyHtml)
    text = htmlToText(bodyHtml)
  }
  if (post.kind === 'poll' && !title && text) title = text.slice(0, 80)
  if (!title || !text) throw createError({ statusCode: 400, message: 'La publicación necesita título y contenido.' })
  let scheduledAt: string | null = null
  if (post.status === 'scheduled') {
    const when = new Date(body.scheduledAt || '')
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now())
      throw createError({ statusCode: 400, message: 'Elegí una fecha y hora futuras para programar.' })
    scheduledAt = when.toISOString()
  }
  // Fase 7: toda edición deja marca (edited_at) para el «Editado»
  // de la tarjeta cuando la publicación salga.
  if (scheduledAt)
    await db.prepare('UPDATE posts SET title = ?, body = ?, body_html = ?, teaser = ?, scheduled_at = ?, edited_at = ? WHERE id = ?').run(title, text, bodyHtml ?? '', text.slice(0, 160), scheduledAt, nowIso(), postId)
  else
    await db.prepare('UPDATE posts SET title = ?, body = ?, body_html = ?, teaser = ?, edited_at = ? WHERE id = ?').run(title, text, bodyHtml ?? '', text.slice(0, 160), nowIso(), postId)
  return { ok: true }
})
