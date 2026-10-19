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
import { notifyNewPost } from '../utils/notify'

interface CreateBody {
  channelSlug?: string
  title?: string
  body?: string
  mediaType?: string
  mediaUrl?: string
  kind?: string
  options?: string[]
  status?: string
  scheduledAt?: string
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
  const text = (body.body || '').trim()
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

  const status = body.status === 'draft' ? 'draft' : body.status === 'scheduled' ? 'scheduled' : 'published'
  let scheduledAt = ''
  if (status === 'scheduled') {
    const when = new Date(body.scheduledAt || '')
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now())
      throw createError({ statusCode: 400, message: 'Elegí una fecha y hora futuras para programar.' })
    scheduledAt = when.toISOString()
  }

  const mediaType = kind === 'poll' ? 'none' : ['image', 'video'].includes(body.mediaType || '') ? body.mediaType! : 'none'
  const db = await dbFor(event)
  let slug = slugify(title)
  if (await db.prepare('SELECT id FROM posts WHERE channel_id = ? AND slug = ?').get(channel.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const id = Number((await db.prepare('INSERT INTO posts (tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at, status, scheduled_at, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)')
    .run(tenant.id, channel.id, user.id, slug, title, text, text.slice(0, 160), mediaType, kind === 'poll' ? '' : (body.mediaUrl || '').trim(), nowIso(), status, scheduledAt, kind)).lastInsertRowId)
  for (let i = 0; i < options.length; i++) {
    await db.prepare('INSERT INTO poll_options (tenant_id, post_id, label, sort) VALUES (?, ?, ?, ?)')
      .run(tenant.id, id, options[i], i + 1)
  }
  if (status === 'published')
    await notifyNewPost(event, tenant.id, user, channel, { title, body: text, slug }, channel.slug)
  return { id, slug, channelSlug: channel.slug, status }
})
