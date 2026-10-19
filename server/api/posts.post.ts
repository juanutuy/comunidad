// Crear una publicación (solo miembros con acceso al canal).
// Se notifica a quienes siguen el canal y a los mencionados.
import { canAccessChannel, channelBySlug, currentAuth, requireUser, resolveTenant } from '../utils/community'
import { nowIso, dbFor, slugify } from '../utils/db'
import { notify, notifyMentions } from '../utils/notify'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const body = await readBody<{ channelSlug?: string, title?: string, body?: string, mediaType?: string, mediaUrl?: string }>(event)
  const channel = await channelBySlug(event, tenant.id, body.channelSlug || '')
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  if (!(await canAccessChannel(event, user.id, role, channel)))
    throw createError({ statusCode: 403, message: 'No tenés acceso a publicar en este canal.' })
  const title = (body.title || '').trim()
  const text = (body.body || '').trim()
  if (!title || !text) throw createError({ statusCode: 400, message: 'La publicación necesita título y contenido.' })
  const mediaType = ['image', 'video'].includes(body.mediaType || '') ? body.mediaType! : 'none'
  const db = await dbFor(event)
  let slug = slugify(title)
  if (await db.prepare('SELECT id FROM posts WHERE channel_id = ? AND slug = ?').get(channel.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const id = Number((await db.prepare('INSERT INTO posts (tenant_id, channel_id, author_id, slug, title, body, teaser, media_type, media_url, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
    .run(tenant.id, channel.id, user.id, slug, title, text, text.slice(0, 160), mediaType, (body.mediaUrl || '').trim(), nowIso())).lastInsertRowId)
  const link = `/p/${channel.slug}/${slug}`
  const followers = await db.prepare('SELECT user_id FROM follows WHERE tenant_id = ? AND channel_id = ?').all(tenant.id, channel.id) as { user_id: number }[]
  for (const f of followers) {
    await notify(event, {
      tenantId: tenant.id, userId: f.user_id, actorId: user.id, type: 'new_post',
      title: `${user.name} publicó «${title}» en ${channel.name}`, link,
    })
  }
  await notifyMentions(event, tenant.id, user, `${title}\n${text}`, link)
  return { id, slug, channelSlug: channel.slug }
})
