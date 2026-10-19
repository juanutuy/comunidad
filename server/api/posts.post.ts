// Crear una publicación (solo miembros con acceso al canal).
// Fase 5: además del post común admite:
//   - encuestas (kind='poll', con 2 a 4 opciones en `options`),
//   - guardar como borrador (status='draft': solo lo ve el autor),
//   - programar (status='scheduled' + `scheduledAt` futuro: se publica
//     solo cuando vence, ver publishDuePosts en utils/community.ts).
// Al publicarse (ahora o después) se notifica a quienes siguen el
// canal y a los mencionados.
import { canAccessChannel, channelBySlug, currentAuth, requireUser, resolveTenant } from '../utils/community'
import { nowIso, dbFor, slugify } from '../utils/db'
import { getReviewEnabled } from '../utils/moderation'
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
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  if (!(await canAccessChannel(event, user.id, role, channel)))
    throw createError({ statusCode: 403, message: 'No tenés acceso a publicar en este canal.' })

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
  if (!title || !text) throw createError({ statusCode: 400, message: kind === 'poll' ? 'La encuesta necesita una pregunta.' : 'La publicación necesita título y contenido.' })

  let options: string[] = []
  if (kind === 'poll') {
    options = (body.options || []).map(o => String(o).trim()).filter(Boolean)
    if (options.length < 2 || options.length > 4)
      throw createError({ statusCode: 400, message: 'Una encuesta necesita entre 2 y 4 opciones.' })
    if (options.some(o => o.length > 80))
      throw createError({ statusCode: 400, message: 'Cada opción puede tener hasta 80 caracteres.' })
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
      throw createError({ statusCode: 400, message: 'Elegí una fecha y hora futuras para programar.' })
    scheduledAt = when.toISOString()
  }

  // 'file' (Fase 8): archivo adjunto descargable bajo el cuerpo.
  const mediaType = kind === 'poll' ? 'none' : ['image', 'video', 'file'].includes(body.mediaType || '') ? body.mediaType! : 'none'
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
