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
import { canAccessChannel, currentAuth, isChannelArchived, isStaff, channelPostPermission, requireCanWrite, channelBySlug, channelContentType, requireUser, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'
import { getReviewEnabled } from '../../utils/moderation'
import { msg } from '../../utils/i18n'
import { htmlToText, sanitizeHtml } from '../../utils/sanitize'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  await requireCanWrite(event, tenant.id, user.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, body?: string, bodyHtml?: string, scheduledAt?: string, allowComments?: boolean, mediaType?: string, mediaUrl?: string, attachmentName?: string, album?: string }>(event)
  const db = await dbFor(event)
  const post = await db.prepare('SELECT author_id, status, kind, channel_id FROM posts WHERE id = ? AND tenant_id = ?').get(postId, tenant.id) as { author_id: number, status: string, kind: string, channel_id: number } | undefined
  if (!post) throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.notFound') })
  if (post.author_id !== user.id)
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'posts.onlyAuthorEdit') })
  const channel = await db.prepare('SELECT * FROM channels WHERE id = ? AND tenant_id = ?').get(post.channel_id, tenant.id)
  if (!channel || isChannelArchived(channel)) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  if (!await canAccessChannel(event, user.id, role, channel) || (channelPostPermission(channel) === 'staff' && !isStaff(role)))
    throw createError({ statusCode: 403, message: 'No tenés permiso para editar en este canal.' })
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
  if (!title || !text) throw createError({ statusCode: 400, message: await msg(event, tenant.id, post.kind === 'poll' ? 'posts.needsBody' : 'posts.needsTitleBody') })
  let scheduledAt: string | null = null
  if (post.status === 'scheduled') {
    const when = new Date(body.scheduledAt || '')
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now())
      throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'posts.scheduleFuture') })
    scheduledAt = when.toISOString()
  }
  // Fase 16-C: campos extra del compositor en modo edición. Solo se
  // tocan si VIENEN en el cuerpo (los clientes viejos no los mandan y
  // el adjunto/comentarios quedan como están). En una encuesta el
  // adjunto no existe (al crear nace en 'none'): se ignora.
  const sets = ['title = ?', 'body = ?', 'body_html = ?', 'teaser = ?', 'edited_at = ?']
  if (post.status === 'published' && role !== 'admin' && await getReviewEnabled(event, tenant.id)) sets.push("status = 'review'")
  const vals: unknown[] = [title, text, bodyHtml ?? '', text.slice(0, 160), nowIso()]
  if (scheduledAt) { sets.push('scheduled_at = ?'); vals.push(scheduledAt) }
  if (typeof body.allowComments === 'boolean') { sets.push('allow_comments = ?'); vals.push(body.allowComments ? 1 : 0) }
  // Fase 16-F: el álbum se edita solo si viene en el cuerpo Y el
  // canal del post es de imagen (misma regla que al crear).
  if (typeof body.album === 'string') {
    const chRow = await db.prepare('SELECT slug FROM channels WHERE id = ?').get(post.channel_id) as { slug: string } | undefined
    const ch = chRow ? await channelBySlug(event, tenant.id, chRow.slug) : null
    if (ch && channelContentType(ch) === 'image') { sets.push('album = ?'); vals.push(body.album.trim().slice(0, 80)) }
  }
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
