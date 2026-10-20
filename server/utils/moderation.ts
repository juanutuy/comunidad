// Moderación (Fase 12): reportes de contenido y revisión previa
// opcional de publicaciones, como en la referencia (cola de reportes
// en la consola + «On Review» en Content → Post).
//
// Dos piezas:
//   - getReviewEnabled: el ajuste por tenant `tenants.moderation_review`
//     (0/1, default 0). Encendido: los posts de miembros nacen con
//     status 'review' hasta que un admin los aprueba.
//   - deletePostCascade: el borrado completo de un post (reacciones,
//     comentarios, guardados, votos y notificaciones que lo enlazan),
//     compartido entre el borrado normal y «Eliminar contenido» de la
//     cola de moderación para que ambos hagan exactamente lo mismo.
//
// Las notificaciones de moderación ('report' a los admins y
// 'moderation' al autor) NO tienen preferencia propia en Ajustes de
// cuenta: son avisos operativos y siempre llegan (ver notify.ts).
import type { H3Event } from 'h3'
import type { DbCommand } from './db'
import { dbFor } from './db'
import { notify } from './notify'

export async function getReviewEnabled(event: H3Event, tenantId: number): Promise<boolean> {
  try {
    const db = await dbFor(event)
    const row = await db.prepare('SELECT moderation_review FROM tenants WHERE id = ?').get(tenantId) as { moderation_review: number } | undefined
    return !!row?.moderation_review
  }
  catch { return false } // bases anteriores sin la columna: revisión apagada
}

// Avisar a TODOS los admins del tenant menos a quien actúa (regla
// general de no auto-notificación). Se usa al crear un reporte: un
// admin que reporta contenido ajeno no se notifica a sí mismo.
// Fase 14: también avisa de solicitudes de ingreso nuevas, con su
// propio tipo ('join_request'); ambos son avisos operativos sin
// preferencia de usuario, como 'report'.
export async function notifyAdmins(event: H3Event, tenantId: number, actorId: number | null, title: string, link: string, type: 'report' | 'join_request' = 'report'): Promise<void> {
  const db = await dbFor(event)
  const admins = await db.prepare('SELECT user_id FROM memberships WHERE tenant_id = ? AND role = \'admin\'').all(tenantId) as { user_id: number }[]
  for (const a of admins) {
    if (actorId && a.user_id === actorId) continue
    await notify(event, { tenantId, userId: a.user_id, actorId, type, title, link })
  }
}

// Borrado completo de una publicación y todo lo que cuelga de ella
// (misma cascada que DELETE /api/posts/[id]).
export async function deletePostCascade(event: H3Event, tenantId: number, postId: number, channelSlug: string, postSlug: string): Promise<void> {
  const db = await dbFor(event)
  await db.batch(postDeletionCommands(tenantId, postId, channelSlug, postSlug))
}

// Borrado de UN comentario con su cascada (Fase 16-G): si es raíz,
// se van también sus respuestas; en todos los casos se borran las
// reacciones de cada comentario eliminado. Lo comparten el DELETE
// del miembro/staff y «Eliminar contenido» de la cola de moderación.
export async function deleteCommentCascade(event: H3Event, commentId: number): Promise<void> {
  const db = await dbFor(event)
  const replies = await db.prepare('SELECT id FROM comments WHERE parent_id = ?').all(commentId) as { id: number }[]
  const ids = [commentId, ...replies.map(r => Number(r.id))]
  await db.batch([
    { sql: 'DELETE FROM comment_reactions WHERE comment_id IN (SELECT value FROM json_each(?))', params: [JSON.stringify(ids)] },
    { sql: 'DELETE FROM comments WHERE id IN (SELECT value FROM json_each(?))', params: [JSON.stringify(ids)] },
  ])
}

export function postDeletionCommands(tenantId: number, postId: number, channelSlug: string, postSlug: string): DbCommand[] {
  return [
    { sql: 'DELETE FROM comment_reactions WHERE comment_id IN (SELECT id FROM comments WHERE tenant_id = ? AND post_id = ?)', params: [tenantId, postId] },
    { sql: "DELETE FROM reports WHERE tenant_id = ? AND ((target_type = 'post' AND target_id = ?) OR (target_type = 'comment' AND target_id IN (SELECT id FROM comments WHERE post_id = ?)))", params: [tenantId, postId, postId] },
    ...['poll_votes', 'poll_options', 'reactions', 'comments', 'bookmarks', 'user_hidden_posts'].map(table => ({ sql: `DELETE FROM ${table} WHERE tenant_id = ? AND post_id = ?`, params: [tenantId, postId] })),
    { sql: 'DELETE FROM notifications WHERE tenant_id = ? AND link = ?', params: [tenantId, `/p/${channelSlug}/${postSlug}`] },
    { sql: 'DELETE FROM posts WHERE tenant_id = ? AND id = ?', params: [tenantId, postId] },
  ]
}
