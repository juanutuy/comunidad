// Eliminar un archivo del gestor de medios (Fase 16, solo admin):
// borra el objeto físico (R2 o disco local) Y la fila de `uploads`.
// Si el archivo está referenciado, la interfaz lo advierte ANTES con
// la ubicación exacta y pide una confirmación extra — el servidor
// no vuelve a preguntar: la decisión informada es del admin.
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor } from '../../../utils/db'
import { deleteFile } from '../../../utils/storage'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const uploadId = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const upload = await db.prepare('SELECT * FROM uploads WHERE id = ? AND tenant_id = ?').get(uploadId, tenant.id) as { id: number, key: string } | undefined
  if (!upload) throw createError({ statusCode: 404, message: 'Archivo no encontrado.' })
  await deleteFile(event, upload.key)
  await db.prepare('DELETE FROM uploads WHERE id = ?').run(uploadId)
  return { ok: true, id: uploadId }
})
