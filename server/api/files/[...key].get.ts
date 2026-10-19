// Sirve archivos públicos subidos (imágenes de publicaciones y avatares).
// Los de la biblioteca (`library/…`) NO se sirven aquí: su descarga pasa
// por /api/library/:id/download, que verifica el acceso premium.
import { readFile } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  const key = String(getRouterParam(event, 'key') || '')
  if (!key || key.startsWith('library/') || key.includes('..'))
    throw createError({ statusCode: 404, message: 'Archivo no encontrado.' })
  const file = await readFile(event, key)
  if (!file) throw createError({ statusCode: 404, message: 'Archivo no encontrado.' })
  return new Response(file.data as BodyInit, {
    headers: {
      'content-type': file.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
})
