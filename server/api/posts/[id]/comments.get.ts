// Comentarios de una publicación para la sección expansible de la
// tarjeta (Fase 16-G). Devuelve el MISMO árbol que serializa el
// detalle (utils/comments.ts) con las MISMAS reglas de acceso que
// GET /api/post: sin acceso real al canal los comentarios no viajan
// (withheld) — leer un anticipo completo no es participar, y en
// modo público el visitante lee el post pero no la conversación.
import { POST_SELECT, canAccessChannel, channelVisibility, currentAuth, resolveTenant } from '../../../utils/community'
import type { ChannelRow } from '../../../utils/community'
import { dbFor } from '../../../utils/db'
import { getPrivacySettings, requireSessionUnlessPublic } from '../../../utils/privacy'
import { fetchCommentTree } from '../../../utils/comments'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const postId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const row = await db.prepare(`${POST_SELECT} WHERE p.id = ? AND p.tenant_id = ?`).get(postId, tenant.id) as Record<string, unknown> | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const { user, role } = await currentAuth(event, tenant.id)
  await requireSessionUnlessPublic(event, tenant.id, user)
  if (row.status && row.status !== 'published' && user?.id !== row.author_id && !(row.status === 'review' && role === 'admin'))
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const channel = await db.prepare('SELECT * FROM channels WHERE id = ? AND tenant_id = ?').get(Number(row.channel_id_raw), tenant.id) as ChannelRow | undefined
  const access = channel ? await canAccessChannel(event, user?.id ?? null, role, channel) : false
  const allowComments = row.allow_comments === undefined || row.allow_comments === null ? true : !!row.allow_comments
  if (channel && channel.type === 'private' && !access)
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  if (channel && channelVisibility(channel) !== 'public' && !access)
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const priv = await getPrivacySettings(event, tenant.id)
  const visitorPublic = !user && priv.visibility === 'public'
  if (!access || visitorPublic) {
    return { comments: [], total: 0, allowComments, canInteract: false, withheld: true }
  }
  const tree = await fetchCommentTree(event, tenant.id, postId, user?.id ?? null)
  return { comments: tree.roots, total: tree.total, allowComments, canInteract: true, withheld: false }
})
