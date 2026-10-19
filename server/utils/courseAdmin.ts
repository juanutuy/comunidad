// Validación compartida del editor de cursos/eventos del admin.
import { htmlToText, sanitizeHtml } from './sanitize'

export interface CourseInput {
  title: string
  description: string
  level: string
  priceCents: number
  status: 'published' | 'draft'
  imageUrl: string
}

export function parseCourseInput(body: Record<string, unknown>): CourseInput {
  const title = String(body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, message: 'El curso necesita un título.' })
  const priceCents = Math.max(0, Math.round(Number(body.priceCents || 0)))
  return {
    title,
    description: String(body.description || '').trim(),
    level: String(body.level || 'Principiante').trim() || 'Principiante',
    priceCents,
    status: body.status === 'draft' ? 'draft' : 'published',
    imageUrl: String(body.imageUrl || '').trim(),
  }
}

// Campos opcionales de la Fase 8 (página-estudio). Solo se devuelven
// las claves PRESENTES en el body: el PUT las aplica sin pisar el
// resto, así el formulario anterior sigue funcionando igual.
export interface CourseStudioFields {
  shortDescription?: string
  descriptionHtml?: string
  description?: string
  bannerUrl?: string
  visibility?: string
  enrollLimit?: number
  dripMode?: string
  certificateEnabled?: number
  // Fase 16: diseño de certificado elegido (id de blueprint);
  // null = diseño por defecto del sistema.
  certificateBlueprintId?: number | null
}

export function parseCourseStudioFields(body: Record<string, unknown>): CourseStudioFields {
  const out: CourseStudioFields = {}
  if (typeof body.shortDescription === 'string') out.shortDescription = body.shortDescription.slice(0, 280)
  if (typeof body.descriptionHtml === 'string') {
    out.descriptionHtml = sanitizeHtml(body.descriptionHtml)
    out.description = htmlToText(out.descriptionHtml)
  }
  if (typeof body.bannerUrl === 'string') out.bannerUrl = body.bannerUrl.trim()
  if (typeof body.visibility === 'string' && ['public', 'private', 'secret'].includes(body.visibility)) out.visibility = body.visibility
  if (body.enrollLimit !== undefined) out.enrollLimit = Math.max(0, Math.round(Number(body.enrollLimit || 0)))
  if (typeof body.dripMode === 'string' && ['none', 'enrollment', 'dates'].includes(body.dripMode)) out.dripMode = body.dripMode
  if (body.certificateEnabled !== undefined) out.certificateEnabled = body.certificateEnabled ? 1 : 0
  if (body.certificateBlueprintId !== undefined) {
    const n = Number(body.certificateBlueprintId)
    out.certificateBlueprintId = Number.isFinite(n) && n > 0 ? Math.round(n) : null
  }
  return out
}

// Tipos de lección de la Fase 8 (los 7 de la referencia; NO hay quiz).
export const LESSON_KINDS = ['video', 'text', 'audio', 'pdf', 'slides', 'download', 'embedded'] as const
export type LessonKind = typeof LESSON_KINDS[number]

export interface LessonInput {
  title: string
  kind: LessonKind
  content: string
  contentHtml: string
  videoUrl: string
  fileUrl: string
  fileName: string
  embedUrl: string
  durationMin: number
  isFree: boolean
  allowDownload: boolean
  prerequisite: boolean
  resourceUrl: string
  resourceName: string
  unlockOffsetDays: number | null
  unlockAt: string
  status: 'published' | 'draft'
}

// Normaliza el body de una lección. Con `partial` (PUT del estudio)
// solo se exigen los campos que vengan; el llamador fusiona con lo
// guardado. El contentHtml se sanitiza y el texto plano se deriva.
export function parseLessonInput(body: Record<string, unknown>): LessonInput {
  const kind = LESSON_KINDS.includes(body.kind as LessonKind) ? (body.kind as LessonKind) : 'text'
  const contentHtml = typeof body.contentHtml === 'string' ? sanitizeHtml(body.contentHtml) : ''
  let unlockAt = ''
  if (typeof body.unlockAt === 'string' && body.unlockAt) {
    const d = new Date(body.unlockAt)
    if (!Number.isNaN(d.getTime())) unlockAt = d.toISOString()
  }
  return {
    title: String(body.title || '').trim() || 'Sin título',
    kind,
    contentHtml,
    content: contentHtml ? htmlToText(contentHtml) : String(body.content || ''),
    videoUrl: String(body.videoUrl || '').trim(),
    fileUrl: String(body.fileUrl || '').trim(),
    fileName: String(body.fileName || '').slice(0, 160),
    embedUrl: String(body.embedUrl || '').trim(),
    durationMin: Math.max(0, Math.round(Number(body.durationMin || 0))),
    isFree: !!body.isFree,
    allowDownload: !!body.allowDownload,
    prerequisite: !!body.prerequisite,
    resourceUrl: String(body.resourceUrl || '').trim(),
    resourceName: String(body.resourceName || '').slice(0, 160),
    unlockOffsetDays: body.unlockOffsetDays === null || body.unlockOffsetDays === undefined || body.unlockOffsetDays === ''
      ? null
      : Math.max(0, Math.round(Number(body.unlockOffsetDays))),
    unlockAt,
    status: body.status === 'draft' ? 'draft' : 'published',
  }
}

// ¿La lección tiene algún contenido cargado? Decide si su tipo ya no
// se puede cambiar (en la referencia el tipo de una lección con
// contenido es inmutable; una recién creada, vacía, sí puede elegir).
export function lessonHasContent(l: { content?: string, content_html?: string, video_url?: string, file_url?: string, embed_url?: string }): boolean {
  return !!((l.content || '').trim() || (l.content_html || '').trim() || (l.video_url || '').trim() || (l.file_url || '').trim() || (l.embed_url || '').trim())
}

export interface EventInput {
  title: string
  description: string
  descriptionHtml: string
  startsAt: string
  endsAt: string
  location: string
  category: string
  agenda: string
}

export function parseEventInput(body: Record<string, unknown>): EventInput {
  const title = String(body.title || '').trim()
  if (!title) throw createError({ statusCode: 400, message: 'El evento necesita un título.' })
  const starts = new Date(String(body.startsAt || ''))
  if (Number.isNaN(starts.getTime())) throw createError({ statusCode: 400, message: 'La fecha de inicio no es válida.' })
  let ends = new Date(String(body.endsAt || ''))
  if (Number.isNaN(ends.getTime()) || ends.getTime() <= starts.getTime()) {
    ends = new Date(starts.getTime() + 60 * 60 * 1000) // por defecto: 1 hora
  }
  // Fase 8 (Parte D): la descripción puede venir con formato del
  // editor clásico; se sanitiza y el texto plano se deriva. Sin HTML
  // vale la descripción plana de siempre (y no queda HTML viejo).
  let description = String(body.description || '').trim()
  let descriptionHtml = ''
  if (typeof body.descriptionHtml === 'string' && body.descriptionHtml.trim()) {
    descriptionHtml = sanitizeHtml(body.descriptionHtml)
    description = htmlToText(descriptionHtml)
  }
  return {
    title,
    description,
    descriptionHtml,
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    location: String(body.location || '').trim() || 'En línea',
    category: String(body.category || '').trim() || 'General',
    agenda: String(body.agenda || '').slice(0, 5000),
  }
}
