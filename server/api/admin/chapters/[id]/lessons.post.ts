// Agregar una lección a un capítulo (solo admin, Fase 5).
// Fase 8: acepta el conjunto completo del estudio (tipo y campos por
// tipo). Sin título se crea como «Sin título», al instante, igual que
// en la referencia («Add lesson» no pide datos antes de crearla).
import { requireCourseManager, resolveTenant } from '../../../../utils/community'
import { parseLessonInput } from '../../../../utils/courseAdmin'
import { dbFor } from '../../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const chapterId = Number(getRouterParam(event, 'id'))
  const body = await readBody<Record<string, unknown>>(event)
  const input = parseLessonInput(body)
  const db = await dbFor(event)
  const chapter = await db.prepare('SELECT id FROM chapters WHERE id = ? AND tenant_id = ?').get(chapterId, tenant.id)
  if (!chapter) throw createError({ statusCode: 404, message: 'Capítulo no encontrado.' })
  const sort = body.sort !== undefined && Number.isFinite(Number(body.sort))
    ? Number(body.sort)
    : ((await db.prepare('SELECT COALESCE(MAX(sort), 0) AS n FROM lessons WHERE chapter_id = ?').get(chapterId) as { n: number }).n + 1)
  const id = Number((await db.prepare(`INSERT INTO lessons (tenant_id, chapter_id, title, kind, content, content_html, video_url,
      file_url, file_name, embed_url, duration_min, is_free, allow_download, prerequisite,
      resource_url, resource_name, unlock_offset_days, unlock_at, status, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(tenant.id, chapterId, input.title, input.kind, input.content, input.contentHtml, input.videoUrl,
      input.fileUrl, input.fileName, input.embedUrl, input.durationMin, input.isFree ? 1 : 0,
      input.allowDownload ? 1 : 0, input.prerequisite ? 1 : 0, input.resourceUrl, input.resourceName,
      input.unlockOffsetDays, input.unlockAt, input.status, sort)).lastInsertRowId)
  return { id }
})
