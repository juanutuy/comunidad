// Editar un capítulo (solo admin, Fase 5): título y orden.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const chapterId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, sort?: number }>(event)
  const title = (body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, message: 'El capítulo necesita un título.' })
  const db = await dbFor(event)
  const chapter = await db.prepare('SELECT id FROM chapters WHERE id = ? AND tenant_id = ?').get(chapterId, tenant.id)
  if (!chapter) throw createError({ statusCode: 404, message: 'Capítulo no encontrado.' })
  const sort = body.sort !== undefined && Number.isFinite(Number(body.sort)) ? Number(body.sort) : undefined
  if (sort !== undefined)
    await db.prepare('UPDATE chapters SET title = ?, sort = ? WHERE id = ?').run(title, sort, chapterId)
  else
    await db.prepare('UPDATE chapters SET title = ? WHERE id = ?').run(title, chapterId)
  return { ok: true }
})
