// Bloqueos y publicaciones ocultas (Fase 5, autogestión del
// miembro): preferencias PERSONALES de visibilidad. No son
// moderación — el admin conserva sus herramientas (borrar posts y
// comentarios, gestionar miembros) y puede abrir cualquier
// publicación por su enlace directo para moderarla.
import type { H3Event } from 'h3'
import { dbFor } from './db'

// Usuarios que YO bloqueé en este tenant.
export async function blockedByMe(event: H3Event, tenantId: number, userId: number | null): Promise<Set<number>> {
  if (!userId) return new Set()
  try {
    const db = await dbFor(event)
    const rows = await db.prepare('SELECT blocked_id FROM user_blocks WHERE tenant_id = ? AND blocker_id = ?').all(tenantId, userId) as { blocked_id: number }[]
    return new Set(rows.map(r => Number(r.blocked_id)))
  }
  catch { return new Set() }
}

// ¿Hay un bloqueo en cualquier sentido entre dos usuarios?
export async function blockBetween(event: H3Event, tenantId: number, a: number, b: number): Promise<boolean> {
  const db = await dbFor(event)
  const row = await db.prepare(`SELECT id FROM user_blocks WHERE tenant_id = ?
    AND ((blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)) LIMIT 1`).get(tenantId, a, b, b, a)
  return !!row
}

// Fragmento SQL para excluir de un listado de posts (alias `p`) lo
// que el usuario actual no debe ver: autores bloqueados por él y
// publicaciones que ocultó. Devuelve también los parámetros en orden.
export function hiddenFilterSql(userId: number | null): { sql: string, params: number[] } {
  if (!userId) return { sql: '', params: [] }
  return {
    sql: ` AND p.author_id NOT IN (SELECT blocked_id FROM user_blocks WHERE tenant_id = p.tenant_id AND blocker_id = ?)
           AND p.id NOT IN (SELECT post_id FROM user_hidden_posts WHERE tenant_id = p.tenant_id AND user_id = ?)`,
    params: [userId, userId],
  }
}
