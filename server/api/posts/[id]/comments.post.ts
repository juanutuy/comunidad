// Comentar una publicación (solo miembros con sesión).
// Se notifica al autor de la publicación y a quienes sean mencionados.
//
// Fase 16-G: el mismo endpoint crea RESPUESTAS (body.parentId) y
// acepta UN adjunto (mediaType/mediaUrl/mediaName, espejo del
// adjunto principal de posts; el archivo ya subió por /api/uploads).
// El hilo tiene UN nivel: si el padre es a su vez una respuesta, la
// nueva cuelga de la raíz del hilo. Responder notifica además al
// autor del comentario padre (y en ese caso el aviso genérico al
// autor del post no se duplica si es la misma persona). Un
// comentario puede ser solo un adjunto (sin texto); texto y adjunto
// vacíos a la vez, no.
import { canAccessChannel, currentAuth, requireCanWrite, requireUser, resolveTenant } from '../../../utils/community'
import type { ChannelRow } from '../../../utils/community'
import { nowIso, dbFor } from '../../../utils/db'
import { msg } from '../../../utils/i18n'
import { assertGate, containsLink } from '../../../utils/members'
import { notify, notifyMentions } from '../../../utils/notify'
import { fetchCommentNode } from '../../../utils/comments'

const MEDIA_TYPES = ['image', 'video', 'file']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const { role } = await currentAuth(event, tenant.id)
  const postId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ body?: string, parentId?: number, mediaType?: string, mediaUrl?: string, mediaName?: string }>(event)
  const text = (body.body || '').trim()
  const mediaType = MEDIA_TYPES.includes(body.mediaType || '') ? body.mediaType! : 'none'
  const mediaUrl = mediaType === 'none' ? '' : (body.mediaUrl || '').trim().slice(0, 500)
  const mediaName = mediaType === 'file' ? String(body.mediaName || '').slice(0, 120) : ''
  if (mediaType !== 'none' && !mediaUrl) throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'posts.commentEmpty') })
  if (!text && mediaType === 'none') throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'posts.commentEmpty') })
  // Fase 14: restricción de escritura y compuerta de enlaces del feed.
  await requireCanWrite(event, tenant.id, user.id)
  if (containsLink(text)) await assertGate(event, tenant.id, user.id, role, 'feed_link')
  const db = await dbFor(event)
  const post = await db.prepare(`SELECT p.author_id, p.title, p.slug, p.status, p.allow_comments, c.id AS channel_id, c.slug AS channel_slug, c.type AS channel_type FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(postId, tenant.id) as { author_id: number, title: string, slug: string, status: string, allow_comments: number, channel_id: number, channel_slug: string, channel_type: string } | undefined
  if (!post) throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.notFound') })
  // Fase 15: participar exige el acceso real al canal. Con el
  // anticipo en modo «completo» un no comprador puede LEER el post de
  // un canal pago, pero comentar sigue siendo de compradores (antes
  // este endpoint no verificaba el acceso al canal).
  const postChannel = { id: post.channel_id, tenant_id: tenant.id, group_id: null, slug: post.channel_slug, name: '', icon: '', description: '', type: post.channel_type, price_cents: 0 } as ChannelRow
  if (!(await canAccessChannel(event, user.id, role, postChannel)))
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'posts.commentNoAccess') })
  // Fase 12: en un post que no está publicado (p. ej. en revisión)
  // solo pueden comentar su autor y los admins; para el resto no existe.
  if (post.status !== 'published' && post.author_id !== user.id && role !== 'admin')
    throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.notFound') })
  // Fase 7: el autor pudo desactivar los comentarios al publicar.
  // Con los comentarios desactivados tampoco se responde (16-G).
  if (post.allow_comments === 0)
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'posts.commentsDisabled') })
  // Fase 16-G: el padre tiene que ser un comentario DE ESTE post.
  // Si el padre es una respuesta, la nueva cuelga de su raíz.
  let parentId: number | null = null
  let parentAuthorId: number | null = null
  if (body.parentId) {
    const parent = await db.prepare('SELECT id, author_id, parent_id FROM comments WHERE id = ? AND post_id = ? AND tenant_id = ?').get(Number(body.parentId), postId, tenant.id) as { id: number, author_id: number, parent_id: number | null } | undefined
    if (!parent) throw createError({ statusCode: 404, message: await msg(event, tenant.id, 'posts.commentParentNotFound') })
    parentId = parent.parent_id ? Number(parent.parent_id) : Number(parent.id)
    parentAuthorId = Number(parent.author_id)
  }
  const id = Number((await db.prepare('INSERT INTO comments (tenant_id, post_id, author_id, body, created_at, parent_id, media_type, media_url, media_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, postId, user.id, text, nowIso(), parentId, mediaType, mediaUrl, mediaName)).lastInsertRowId)
  const link = `/p/${post.channel_slug}/${post.slug}`
  if (parentAuthorId !== null) {
    await notify(event, {
      tenantId: tenant.id, userId: parentAuthorId, actorId: user.id, type: 'comment',
      title: `${user.name} respondió a tu comentario en «${post.title}»`, link,
    })
  }
  // El autor del post recibe el aviso de comentario nuevo, salvo
  // que ya recibió el de respuesta (padre suyo) por esta misma acción.
  if (parentAuthorId !== post.author_id) {
    await notify(event, {
      tenantId: tenant.id, userId: post.author_id, actorId: user.id, type: 'comment',
      title: `${user.name} comentó tu publicación «${post.title}»`, link,
    })
  }
  await notifyMentions(event, tenant.id, user, text, link, [post.author_id, ...(parentAuthorId !== null ? [parentAuthorId] : [])])
  const comment = await fetchCommentNode(event, id, user.id)
  return { id, comment }
})
