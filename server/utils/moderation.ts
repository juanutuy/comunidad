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
export async function notifyAdmins(event: H3Event, tenantId: number, actorId: number | null, title: string, link: string): Promise<void> {
  const db = await dbFor(event)
  const admins = await db.prepare('SELECT user_id FROM memberships WHERE tenant_id = ? AND role = \'admin\'').all(tenantId) as { user_id: number }[]
  for (const a of admins) {
    if (actorId && a.user_id === actorId) continue
    await notify(event, { tenantId, userId: a.user_id, actorId, type: 'report', title, link })
  }
}

// Borrado completo de una publicación y todo lo que cuelga de ella
// (misma cascada que DELETE /api/posts/[id]).
export async function deletePostCascade(event: H3Event, tenantId: number, postId: number, channelSlug: string, postSlug: string): Promise<void> {
  const db = await dbFor(event)
  await db.prepare('DELETE FROM poll_votes WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM poll_options WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM reactions WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM comments WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM bookmarks WHERE post_id = ?').run(postId)
  await db.prepare('DELETE FROM notifications WHERE tenant_id = ? AND link = ?').run(tenantId, `/p/${channelSlug}/${postSlug}`)
  await db.prepare('DELETE FROM posts WHERE id = ?').run(postId)
}
