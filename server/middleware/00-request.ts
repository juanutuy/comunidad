import { readLimitedBody, validateRequestObject } from '../utils/request'

export default defineEventHandler(async (event) => {
  if (!getRequestURL(event).pathname.startsWith('/api/') || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)) return
  const origin = getHeader(event, 'origin')
  if (origin && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, message: 'Origen de solicitud no permitido.' })
  const type = getHeader(event, 'content-type') || ''
  if (type.includes('multipart/form-data')) {
    await readLimitedBody(event, 32 * 1024 * 1024)
    return
  }
  const raw = await readLimitedBody(event, 512 * 1024)
  if (!raw.length) {
    ;(event as typeof event & { _requestBody?: Buffer })._requestBody = Buffer.from('{}')
    return
  }
  if (!type.includes('application/json')) throw createError({ statusCode: 415, message: 'Se requiere application/json.' })
  let body: unknown
  try { body = JSON.parse(raw.toString('utf8')) }
  catch { throw createError({ statusCode: 400, message: 'JSON inválido.' }) }
  validateRequestObject(body)
})
