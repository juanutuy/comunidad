// Descarga real de un recurso de la biblioteca.
// - Items de solo metadatos (semilla, sin file_key): 404 claro.
// - Items con candado (locked): solo admin o miembros con acceso a un
//   canal pago del tenant (misma regla que el contenido premium).
// Cuenta la descarga en la base antes de entregar el archivo.
import { currentAuth, resolveTenant } from '../../../utils/community'
import { hasPremiumAccess } from '../../../utils/levels'
import { readFile } from '../../../utils/storage'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const item = await db.prepare('SELECT * FROM library_items WHERE id = ? AND tenant_id = ?').get(id, tenant.id) as Record<string, unknown> | undefined
  if (!item) throw createError({ statusCode: 404, message: 'Recurso no encontrado.' })
  if (!item.file_key) throw createError({ statusCode: 404, message: 'Este recurso es un registro de referencia y no tiene archivo descargable.' })
  if (item.locked) {
    const { user, role } = await currentAuth(event, tenant.id)
    if (!user) throw createError({ statusCode: 401, message: 'Iniciá sesión para descargar este recurso.' })
    if (!(await hasPremiumAccess(event, tenant.id, user.id, role)))
      throw createError({ statusCode: 403, message: 'Este recurso es solo para miembros con acceso premium.' })
  }
  const file = await readFile(event, String(item.file_key))
  if (!file) throw createError({ statusCode: 404, message: 'El archivo ya no está disponible.' })
  await db.prepare('UPDATE library_items SET downloads = downloads + 1 WHERE id = ?').run(id)
  const filename = String(item.file_name || item.title || 'archivo')
  return new Response(file.data as BodyInit, {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
})
