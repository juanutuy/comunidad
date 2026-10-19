// Reportar un post o un comentario (Fase 12). Solo con sesión y solo
// contenido AJENO: nadie reporta lo propio. Un reporte 'pending' por
// (persona, objetivo): repetir el envío responde que ya fue reportado
// y no duplica. Al crearse, se avisa a los admins del tenant con una
// notificación tipo 'report' (sin preferencia propia: es un aviso
// operativo de moderación, ver utils/notify.ts).
import { requireUser, resolveTenant } from '../utils/community'
import { nowIso, dbFor } from '../utils/db'
import { notifyAdmins } from '../utils/moderation'

const REASONS = ['spam', 'acoso', 'inapropiado', 'otro']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ targetType?: string, targetId?: number, reason?: string, note?: string }>(event)
  const targetType = body.targetType === 'comment' ? 'comment' : body.targetType === 'post' ? 'post' : null
  const targetId = Number(body.targetId || 0)
  if (!targetType || !targetId)
    throw createError({ statusCode: 400, message: 'Falta el contenido a reportar.' })
  const reason = REASONS.includes(body.reason || '') ? body.reason! : 'otro'
  const note = String(body.note || '').trim().slice(0, 500)
  const db = await dbFor(event)

  // El objetivo tiene que existir en este tenant y no ser propio.
  let authorId: number | undefined
  if (targetType === 'post') {
    const row = await db.prepare('SELECT author_id FROM posts WHERE id = ? AND tenant_id = ?').get(targetId, tenant.id) as { author_id: number } | undefined
    authorId = row?.author_id
  }
  else {
    const row = await db.prepare('SELECT author_id FROM comments WHERE id = ? AND tenant_id = ?').get(targetId, tenant.id) as { author_id: number } | undefined
    authorId = row?.author_id
  }
  if (authorId === undefined)
    throw createError({ statusCode: 404, message: 'El contenido ya no existe.' })
  if (authorId === user.id)
    throw createError({ statusCode: 400, message: 'No podés reportar tu propio contenido.' })

  const existing = await db.prepare("SELECT id FROM reports WHERE tenant_id = ? AND reporter_id = ? AND target_type = ? AND target_id = ? AND status = 'pending'")
    .get(tenant.id, user.id, targetType, targetId) as { id: number } | undefined
  if (existing) return { ok: true, alreadyReported: true }

  const id = Number((await db.prepare('INSERT INTO reports (tenant_id, reporter_id, target_type, target_id, reason, note, status, action, created_at) VALUES (?, ?, ?, ?, ?, ?, \'pending\', \'none\', ?)')
    .run(tenant.id, user.id, targetType, targetId, reason, note, nowIso())).lastInsertRowId)
  await notifyAdmins(event, tenant.id, user.id, 'Nuevo reporte de contenido', '/admin/moderation')
  setResponseStatus(event, 201)
  return { ok: true, id }
})
