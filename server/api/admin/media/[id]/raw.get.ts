// Descarga cruda de una subida para el admin (Fase 16): cubre los
// archivos de `library/` sin ítem asociado, que la ruta pública
// /api/files no sirve a propósito (la biblioteca controla el acceso
// por su propia ruta). Solo admin, y solo por id de la tabla
// `uploads` del tenant.
import { requireAdmin, resolveTenant } from '../../../../utils/community'
import { dbFor } from '../../../../utils/db'
import { readFile } from '../../../../utils/storage'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const uploadId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const upload = await db.prepare('SELECT * FROM uploads WHERE id = ? AND tenant_id = ?').get(uploadId, tenant.id) as { id: number, key: string, filename: string } | undefined
  if (!upload) throw createError({ statusCode: 404, message: 'Archivo no encontrado.' })
  const file = await readFile(event, upload.key)
  if (!file) throw createError({ statusCode: 404, message: 'El archivo ya no está en el almacenamiento.' })
  const safeName = (upload.filename || 'archivo').replace(/[^\w.\- ]+/g, '_')
  return new Response(file.data as BodyInit, {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `attachment; filename="${safeName}"`,
    },
  })
})
