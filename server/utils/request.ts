import { createError, getHeader, getRequestWebStream } from 'h3'
import type { H3Event } from 'h3'

/** Bound bytes while streaming, then cache them for H3's JSON/multipart readers. */
export async function readLimitedBody(event: H3Event, limit: number): Promise<Buffer> {
  if (event.context.boundedBody) return event.context.boundedBody as Buffer
  const declared = Number(getHeader(event, 'content-length') || 0)
  if (declared > limit) throw createError({ statusCode: 413, message: 'El cuerpo de la solicitud supera el máximo permitido.' })
  const stream = getRequestWebStream(event)
  const chunks: Uint8Array[] = []
  let total = 0
  if (stream) {
    const reader = stream.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > limit) {
          await reader.cancel()
          throw createError({ statusCode: 413, message: 'El cuerpo de la solicitud supera el máximo permitido.' })
        }
        chunks.push(value)
      }
    }
    finally { reader.releaseLock() }
  }
  const body = Buffer.concat(chunks)
  ;(event as H3Event & { _requestBody?: Buffer })._requestBody = body
  event.context.boundedBody = body
  return body
}

const STRING_FIELDS = new Set(['name', 'title', 'email', 'password', 'current', 'next', 'body', 'bodyHtml', 'slug', 'bio', 'location', 'website', 'token', 'inviteToken', 'channelSlug', 'mediaType', 'mediaUrl', 'mediaName', 'attachmentName', 'scheduledAt', 'album', 'description', 'descriptionHtml', 'coverUrl', 'imageUrl', 'fileUrl', 'resourceUrl', 'videoUrl', 'embedUrl'])
export function validateRequestObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw createError({ statusCode: 400, message: 'Se esperaba un objeto JSON.' })
  for (const [key, item] of Object.entries(value)) {
    if (STRING_FIELDS.has(key) && item !== undefined && item !== null && typeof item !== 'string')
      throw createError({ statusCode: 400, message: `Campo ${key}: se esperaba texto.` })
  }
}
