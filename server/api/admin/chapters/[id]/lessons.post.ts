// Agregar una lección a un capítulo (solo admin, Fase 5).
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const chapterId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ title?: string, content?: string, videoUrl?: string, durationMin?: number, isFree?: boolean, sort?: number }>(event)
  const title = (body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, message: 'La lección necesita un título.' })
  const db = await dbFor(event)
  const chapter = await db.prepare('SELECT id FROM chapters WHERE id = ? AND tenant_id = ?').get(chapterId, tenant.id)
  if (!chapter) throw createError({ statusCode: 404, message: 'Capítulo no encontrado.' })
  const sort = body.sort !== undefined && Number.isFinite(Number(body.sort))
    ? Number(body.sort)
    : ((await db.prepare('SELECT COALESCE(MAX(sort), 0) AS n FROM lessons WHERE chapter_id = ?').get(chapterId) as { n: number }).n + 1)
  const id = Number((await db.prepare('INSERT INTO lessons (tenant_id, chapter_id, title, duration_min, is_free, sort, content, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, chapterId, title, Math.max(0, Math.round(Number(body.durationMin || 0))), body.isFree ? 1 : 0, sort, String(body.content || ''), String(body.videoUrl || '').trim())).lastInsertRowId)
  return { id }
})
