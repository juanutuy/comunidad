import type { H3Event } from 'h3'
export function pagination(event: H3Event) {
  const query = getQuery(event)
  const limit = Number(query.limit ?? 30)
  const offset = Number(query.offset ?? 0)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
    throw createError({ statusCode: 400, message: 'Paginación inválida.' })
  return { limit, offset }
}
