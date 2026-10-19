// Resolver los reportes pendientes de un objetivo (Fase 12, solo
// admin). La acción se aplica a TODOS los reportes 'pending' del
// mismo objetivo, porque la cola los agrupa:
//   - outcome 'dismissed' → quedan descartados.
//   - outcome 'resolved'  → resueltos sin acción sobre el contenido.
//   - outcome 'remove'    → se elimina el contenido (misma cascada
//     que el borrado normal) y quedan resueltos con
//     action='content_removed'. Si el contenido ya no existe, la API
//     lo rechaza: en ese caso solo se puede cerrar el reporte.
import { requireModerator, resolveTenant } from '../../../../../utils/community'
import { nowIso, dbFor } from '../../../../../utils/db'
import { deletePostCascade } from '../../../../../utils/moderation'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const admin = await requireModerator(event, tenant.id)
  const reportId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ outcome?: string }>(event)
  const outcome = body.outcome
  if (!['dismissed', 'resolved', 'remove'].includes(outcome || ''))
    throw createError({ statusCode: 400, message: 'Acción de moderación inválida.' })
  const db = await dbFor(event)
  const report = await db.prepare('SELECT * FROM reports WHERE id = ? AND tenant_id = ?').get(reportId, tenant.id) as Record<string, unknown> | undefined
  if (!report) throw createError({ statusCode: 404, message: 'Reporte no encontrado.' })
  if (report.status !== 'pending') return { ok: true, already: true }

  const targetType = String(report.target_type)
  const targetId = Number(report.target_id)
  let removed = false
  if (outcome === 'remove') {
    if (targetType === 'post') {
      const post = await db.prepare(`SELECT p.slug, c.slug AS channel_slug FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.id = ? AND p.tenant_id = ?`).get(targetId, tenant.id) as { slug: string, channel_slug: string } | undefined
      if (!post) throw createError({ statusCode: 409, message: 'El contenido ya no existe: cerrá el reporte sin eliminarlo.' })
      await deletePostCascade(event, tenant.id, targetId, post.channel_slug, post.slug)
    }
    else {
      const comment = await db.prepare('SELECT id FROM comments WHERE id = ? AND tenant_id = ?').get(targetId, tenant.id)
      if (!comment) throw createError({ statusCode: 409, message: 'El contenido ya no existe: cerrá el reporte sin eliminarlo.' })
      await db.prepare('DELETE FROM comments WHERE id = ?').run(targetId)
    }
    removed = true
  }

  const status = outcome === 'dismissed' ? 'dismissed' : 'resolved'
  const action = removed ? 'content_removed' : 'none'
  const res = await db.prepare("UPDATE reports SET status = ?, action = ?, resolved_by = ?, resolved_at = ? WHERE tenant_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'")
    .run(status, action, admin.id, nowIso(), tenant.id, targetType, targetId)
  return { ok: true, updated: res.changes ?? 0, removed }
})
