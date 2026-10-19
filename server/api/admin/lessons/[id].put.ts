// Editar una lección (solo admin). Fase 8: acepta el conjunto
// completo del estudio (tipo, campos por tipo, ajustes, drip) con
// actualización parcial — lo que no viene en el body se conserva.
// El TIPO solo se puede fijar mientras la lección no tenga contenido
// (recién creada): con contenido cargado es inmutable, como en la
// referencia. El HTML se sanitiza en el servidor y el texto plano se
// deriva de él (utils/courseAdmin.parseLessonInput).
import { requireCourseManager, resolveTenant } from '../../../utils/community'
import { lessonHasContent, parseLessonInput } from '../../../utils/courseAdmin'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireCourseManager(event, tenant.id)
  const lessonId = Number(getRouterParam(event, 'id'))
  const body = await readBody<Record<string, unknown>>(event)
  const db = await dbFor(event)
  const lesson = await db.prepare('SELECT * FROM lessons WHERE id = ? AND tenant_id = ?').get(lessonId, tenant.id) as Record<string, unknown> | undefined
  if (!lesson) throw createError({ statusCode: 404, message: 'Lección no encontrada.' })

  if (body.kind !== undefined && String(body.kind) !== String(lesson.kind || 'text') && lessonHasContent(lesson)) {
    throw createError({ statusCode: 400, message: 'El tipo de una lección con contenido no se puede cambiar. Creá una lección nueva con el tipo que necesitás.' })
  }

  // Fusión parcial: el body pisa solo las claves presentes.
  const merged: Record<string, unknown> = {
    title: lesson.title, kind: lesson.kind || 'text',
    content: lesson.content || '', contentHtml: lesson.content_html || '',
    videoUrl: lesson.video_url || '', fileUrl: lesson.file_url || '', fileName: lesson.file_name || '',
    embedUrl: lesson.embed_url || '', durationMin: lesson.duration_min,
    isFree: !!lesson.is_free, allowDownload: !!lesson.allow_download, prerequisite: !!lesson.prerequisite,
    resourceUrl: lesson.resource_url || '', resourceName: lesson.resource_name || '',
    unlockOffsetDays: lesson.unlock_offset_days ?? null, unlockAt: lesson.unlock_at || '',
    status: lesson.status || 'published',
    ...body,
  }
  const input = parseLessonInput(merged)
  const sort = body.sort !== undefined && Number.isFinite(Number(body.sort)) ? Number(body.sort) : Number(lesson.sort)
  await db.prepare(`UPDATE lessons SET title = ?, kind = ?, content = ?, content_html = ?, video_url = ?,
      file_url = ?, file_name = ?, embed_url = ?, duration_min = ?, is_free = ?, allow_download = ?,
      prerequisite = ?, resource_url = ?, resource_name = ?, unlock_offset_days = ?, unlock_at = ?,
      status = ?, sort = ? WHERE id = ?`)
    .run(input.title, input.kind, input.content, input.contentHtml, input.videoUrl,
      input.fileUrl, input.fileName, input.embedUrl, input.durationMin, input.isFree ? 1 : 0,
      input.allowDownload ? 1 : 0, input.prerequisite ? 1 : 0, input.resourceUrl, input.resourceName,
      input.unlockOffsetDays, input.unlockAt, input.status, sort, lessonId)
  return { ok: true }
})
