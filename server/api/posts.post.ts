// Crear una publicación (solo miembros con acceso al canal).
import { canAccessChannel, channelBySlug, currentAuth, requireUser, resolveTenant } from '../utils/community'
import { nowIso, rawDb, slugify } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = resolveTenant(event)
  const user = requireUser(event, tenant.id)
  const { role } = currentAuth(event, tenant.id)
  const body = await readBody<{ channelSlug?: string, title?: string, body?: string, mediaType?: string, mediaUrl?: string }>(event)
  const channel = channelBySlug(tenant.id, body.channelSlug || '')
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  if (!canAccessChannel(user.id, role, channel))
    throw createError({ statusCode: 403, message: 'No tenés acceso a publicar en este canal.' })
  const title = (body.title || '').trim()
  const text = (body.body || '').trim()
  if (!title || !text) throw createError({ statusCode: 400, message: 'La publicación necesita título y contenido.' })
  const mediaType = ['image', 'video'].includes(body.mediaType || '') ? body.mediaType! : 'none'
  const db = rawDb()
  let slug = slugify(title)
  if (db.prepare('SELECT id FROM posts WHERE channel_id = ? AND slug = ?').get(channel.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const id = Number(db.prepare('INSERT INTO posts (tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
    .run(tenant.id, channel.id, user.id, slug, title, text, text.slice(0, 160), mediaType, (body.mediaUrl || '').trim(), nowIso()).lastInsertRowid)
  return { id, slug, channelSlug: channel.slug }
})
