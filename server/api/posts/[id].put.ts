// Editar título y cuerpo de una publicación propia (Fase 5: borradores
// y programados desde «Mis borradores»; Fase 16-B: también las YA
// PUBLICADAS, desde el menú «…» de la tarjeta — «Editar publicación»
// como en la referencia). Solo el autor; el cuerpo rico se sanitiza y
// toda edición deja la marca edited_at del «Editado».
// Fase 16-C: la edición vive en el MISMO compositor de crear, así que
// el PUT también acepta el estado de comentarios (`allowComments`) y
// el adjunto principal (mediaType/mediaUrl/attachmentName) cuando
// vienen en el cuerpo — con las mismas validaciones que al crear. El
// anónimo NO se acepta acá: se fija solo al crear (Fase 8).
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { htmlToText, sanitizeHtml } from '../../utils/sanitize'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, body?: string, bodyHtml?: string, scheduledAt?: string, allowComments?: boolean, mediaType?: string, mediaUrl?: string, attachmentName?: string }>(event)
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
  // Fase 16-C: campos extra del compositor en modo edición. Solo se
  // tocan si VIENEN en el cuerpo (los clientes viejos no los mandan y
  // el adjunto/comentarios quedan como están). En una encuesta el
  // adjunto no existe (al crear nace en 'none'): se ignora.
  const sets = ['title = ?', 'body = ?', 'body_html = ?', 'teaser = ?', 'edited_at = ?']
  const vals: unknown[] = [title, text, bodyHtml ?? '', text.slice(0, 160), nowIso()]
  if (scheduledAt) { sets.push('scheduled_at = ?'); vals.push(scheduledAt) }
  if (typeof body.allowComments === 'boolean') { sets.push('allow_comments = ?'); vals.push(body.allowComments ? 1 : 0) }
  if (post.kind !== 'poll' && typeof body.mediaType === 'string') {
    const mediaType = ['image', 'video', 'file'].includes(body.mediaType) ? body.mediaType : 'none'
    sets.push('media_type = ?', 'media_url = ?', 'attachment_name = ?')
    vals.push(
      mediaType,
      mediaType === 'none' ? '' : (body.mediaUrl || '').trim().slice(0, 500),
      mediaType === 'file' ? String(body.attachmentName || '').slice(0, 120) : '',
    )
  }
  // Fase 7: toda edición deja marca (edited_at) para el «Editado»
  // de la tarjeta cuando la publicación salga.
  await db.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`).run(...vals, postId)
  return { ok: true }
})
