// Crear una publicación (solo miembros con acceso al canal).
// Fase 5: además del post común admite:
//   - encuestas (kind='poll', con 2 a 4 opciones en `options`),
//   - guardar como borrador (status='draft': solo lo ve el autor),
//   - programar (status='scheduled' + `scheduledAt` futuro: se publica
//     solo cuando vence, ver publishDuePosts en utils/community.ts).
// Al publicarse (ahora o después) se notifica a quienes siguen el
// canal y a los mencionados.
import { canAccessChannel, channelBySlug, channelPostPermission, currentAuth, isChannelArchived, isStaff, requireCanWrite, requireUser, resolveTenant } from '../utils/community'
import { nowIso, dbFor, slugify } from '../utils/db'
import { msg } from '../utils/i18n'
import { getReviewEnabled } from '../utils/moderation'
import { assertGate, containsLink } from '../utils/members'
import { notifyNewPost } from '../utils/notify'
import { htmlToText, sanitizeHtml } from '../utils/sanitize'

interface CreateBody {
  channelSlug?: string
  title?: string
  body?: string
  // Fase 8: cuerpo con formato del editor rico. Si viene, se sanitiza
  // en el servidor y el texto plano (`body`) se DERIVA de él: es la
  // única fuente para teasers, búsqueda y notificaciones.
  bodyHtml?: string
  mediaType?: string
  mediaUrl?: string
  attachmentName?: string
  kind?: string
  options?: string[]
  status?: string
  scheduledAt?: string
  // Fase 7: «Permitir comentarios» del editor (por defecto sí) y
  // «Publicar como anuncio» (solo admin: nace fijado).
  allowComments?: boolean
  pin?: boolean
  // Fase 8: post anónimo (solo se fija al crear; no se convierte después).
  anonymous?: boolean
}

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const body = await readBody<CreateBody>(event)
  const channel = await channelBySlug(event, tenant.id, body.channelSlug || '')
  if (!channel) throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.channelNotFound') })
  // Fase 16: en un canal archivado no se publica (para el miembro el
  // canal no existe; el admin tampoco publica ahí: primero se
  // desarchiva desde la consola).
  if (isChannelArchived(channel))
    throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.channelNotFound') })
  if (!(await canAccessChannel(event, user.id, role, channel)))
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'posts.noChannelAccess') })
  // Fase 16: «Quién puede publicar» del canal en modo 'staff': los
  // posts nuevos son solo del equipo. Comentar y reaccionar no pasan
  // por acá y no se bloquean con este ajuste.
  if (channelPostPermission(channel) === 'staff' && !isStaff(role))
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'posts.staffOnly') })
  // Fase 14: restricción de escritura y compuerta «Crear
  // publicaciones» (el staff nunca se bloquea).
  await requireCanWrite(event, tenant.id, user.id)
  await assertGate(event, tenant.id, user.id, role, 'create_post')

  const kind = body.kind === 'poll' ? 'poll' : 'post'
  let title = (body.title || '').trim()
  // Fase 8: con cuerpo rico, el HTML se sanitiza SIEMPRE en el servidor
  // y el texto plano se deriva de él. Sin cuerpo rico vale el `body`
  // plano de siempre (compatibilidad con clientes anteriores).
  let bodyHtml = ''
  let text = (body.body || '').trim()
  if (typeof body.bodyHtml === 'string' && body.bodyHtml.trim()) {
    bodyHtml = sanitizeHtml(body.bodyHtml)
    text = htmlToText(bodyHtml)
  }
  // En una encuesta la pregunta vive en el cuerpo; si no hay título, se
  // deriva de la pregunta (recortada) para el slug y el encabezado.
  if (kind === 'poll' && !title && text) title = text.slice(0, 80)
  if (!title || !text) throw createError({ statusCode: 400, message: await msg(event, tenant.id, kind === 'poll' ? 'posts.pollNeedsQuestion' : 'posts.needsTitleBody') })

  let options: string[] = []
  if (kind === 'poll') {
    options = (body.options || []).map(o => String(o).trim()).filter(Boolean)
    if (options.length < 2 || options.length > 4)
      throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'posts.pollOptionsRange') })
    if (options.some(o => o.length > 80))
      throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'posts.pollOptionTooLong') })
  }

  let status = body.status === 'draft' ? 'draft' : body.status === 'scheduled' ? 'scheduled' : 'published'
  // Fase 12: revisión previa opcional — con el ajuste del tenant
  // encendido, un post de un miembro NO admin nace en 'review' y no se
  // ve (ni suma puntos: memberStats solo cuenta 'published') hasta que
  // un admin lo aprueba. Los admins publican directo. Borradores y
  // programados conservan su flujo (el programado pasa por
  // publishDuePosts, que aplica la misma regla al vencer).
  if (status === 'published' && role !== 'admin' && await getReviewEnabled(event, tenant.id))
    status = 'review'
  let scheduledAt = ''
  if (status === 'scheduled') {
    const when = new Date(body.scheduledAt || '')
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now())
      throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'posts.scheduleFuture') })
    scheduledAt = when.toISOString()
  }

  // 'file' (Fase 8): archivo adjunto descargable bajo el cuerpo.
  const mediaType = kind === 'poll' ? 'none' : ['image', 'video', 'file'].includes(body.mediaType || '') ? body.mediaType! : 'none'
  // Fase 14: compuertas de contenido — enlace en título/cuerpo y
  // video adjunto exigen su nivel si el tenant las configuró.
  if (containsLink(`${title} ${text}`)) await assertGate(event, tenant.id, user.id, role, 'feed_link')
  if (mediaType === 'video') await assertGate(event, tenant.id, user.id, role, 'feed_video')
  const allowComments = body.allowComments === false ? 0 : 1
  // «Publicar como anuncio» solo tiene efecto para el admin: un miembro
  // no puede fijar su propio post mandando pin=true.
  const pinned = body.pin === true && role === 'admin' ? 1 : 0
  const anonymous = body.anonymous === true ? 1 : 0
  const db = await dbFor(event)
  let slug = slugify(title)
  if (await db.prepare('SELECT id FROM posts WHERE channel_id = ? AND slug = ?').get(channel.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const id = Number((await db.prepare('INSERT INTO posts (tenant_id, channel_id, author_id, slug, title, body, body_html, teaser, media_type, media_url, attachment_name, pinned, created_at, status, scheduled_at, kind, allow_comments, anonymous) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, channel.id, user.id, slug, title, text, bodyHtml, text.slice(0, 160), mediaType, kind === 'poll' ? '' : (body.mediaUrl || '').trim(), mediaType === 'file' ? String(body.attachmentName || '').slice(0, 120) : '', pinned, nowIso(), status, scheduledAt, kind, allowComments, anonymous)).lastInsertRowId)
  for (let i = 0; i < options.length; i++) {
    await db.prepare('INSERT INTO poll_options (tenant_id, post_id, label, sort) VALUES (?, ?, ?, ?)')
      .run(tenant.id, id, options[i], i + 1)
  }
  if (status === 'published')
    await notifyNewPost(event, tenant.id, user, channel, { title, body: text, slug }, channel.slug, { anonymous: !!anonymous })
  return { id, slug, channelSlug: channel.slug, status }
})
