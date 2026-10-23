// Detalle de una publicación por canal+slug, con comentarios.
// Sin acceso al canal: solo anticipo (locked), según las reglas del
// tenant (Fase 15). Un canal privado, para quien no tiene acceso, no
// existe: ni su nombre ni sus publicaciones salen por esta ruta.
import { POST_SELECT, canAccessChannel, channelBySlug, channelVisibility, currentAuth, isChannelArchived, resolveTenant, serializePost } from '../utils/community'
import { dbFor } from '../utils/db'
import { getPrivacySettings, requirePublicChannelOrSession } from '../utils/privacy'
import { fetchCommentTree } from '../utils/comments'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const q = getQuery(event)
  const channel = await channelBySlug(event, tenant.id, String(q.channel || ''))
  if (!channel) throw createError({ statusCode: 404, message: 'Canal no encontrado.' })
  const db = await dbFor(event)
  const row = await db.prepare(`${POST_SELECT} WHERE p.channel_id = ? AND p.slug = ?`).get(channel.id, String(q.post || '')) as Record<string, unknown> | undefined
  if (!row) throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const { user, role } = await currentAuth(event, tenant.id)
  // Fase 16: una publicación de un canal archivado tampoco se abre
  // por enlace directo para los miembros (el canal está cerrado).
  if (isChannelArchived(channel) && role !== 'admin')
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  await requirePublicChannelOrSession(event, tenant.id, user, channel.visibility)
  // Fase 5: borradores y programados SOLO los abre su autor.
  // Fase 12: un post en revisión también lo pueden abrir los admins
  // (para evaluarlo desde su contexto, además de la cola).
  if (row.status && row.status !== 'published' && user?.id !== row.author_id && !(row.status === 'review' && role === 'admin'))
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const access = await canAccessChannel(event, user?.id ?? null, role, channel)
  // Fase 15: canal privado sin acceso = no existe (antes se servía la
  // tarjeta con el anticipo guardado: el título y el resumen de un
  // canal «solo para miembros» salían sin sesión).
  if (channel.type === 'private' && !access)
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  // Fase 16-F: con visibilidad privada o secreta, el detalle directo
  // tampoco filtra nada sin acceso (la pantalla de bloqueo y la
  // compra viven en la página del canal, no acá). Con visibilidad
  // pública la regla de siempre aplica (arriba/abajo: anticipo).
  if (channelVisibility(channel) !== 'public' && !access)
    throw createError({ statusCode: 404, message: 'Publicación no encontrada.' })
  const priv = await getPrivacySettings(event, tenant.id)
  // Fase 15: leer no es participar. Con el anticipo en modo «completo»
  // el no comprador de un canal pago LEE el detalle entero, pero los
  // comentarios no viajan (participar sigue exigiendo la compra) y el
  // serializador marca canInteract = false.
  const readAccess = access || (channel.type === 'paid' && priv.paidPreviewMode === 'full')
  // En el modo público, el visitante lee la publicación pero NO los
  // comentarios (decisión propia de esta fase): los comentarios son
  // conversación de miembros.
  const visitorPublic = !user && (priv.visibility === 'public' || channelVisibility(channel) === 'public')
  // Fase 16-G: los comentarios viajan como ÁRBOL (raíces con sus
  // respuestas, reacciones por comentario y adjuntos) desde el
  // serializador compartido — el detalle y la tarjeta expansible
  // muestran exactamente lo mismo.
  const tree = access && !visitorPublic
    ? await fetchCommentTree(event, tenant.id, row.id as number, user?.id ?? null)
    : { roots: [], total: 0 }
  return {
    post: await serializePost(event, row, user?.id ?? null, readAccess, role, { canInteract: access }),
    comments: tree.roots,
    commentTotal: tree.total,
    // Para que la página no diga «todavía no hay comentarios» cuando
    // los comentarios existen pero no viajan para este lector.
    commentsWithheld: visitorPublic,
  }
})
