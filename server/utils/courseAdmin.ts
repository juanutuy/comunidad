// Validación compartida del editor de cursos/eventos del admin.
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

export interface EventInput {
  title: string
  description: string
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
  return {
    title,
    description: String(body.description || '').trim(),
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString(),
    location: String(body.location || '').trim() || 'En línea',
    category: String(body.category || '').trim() || 'General',
    agenda: String(body.agenda || '').slice(0, 5000),
  }
}
