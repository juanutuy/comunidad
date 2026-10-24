import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const id = Number(getRouterParam(event, 'id'))
  const db = await dbFor(event)
  const item = await db.prepare('SELECT * FROM library_items WHERE tenant_id = ? AND id = ?').get(tenant.id, id)
  if (!item) throw createError({ statusCode: 404, message: 'Recurso no encontrado. / Resource not found.' })
  const body = await readBody<{ folderId?: unknown, archived?: unknown, category?: unknown }>(event)
  let folderId = item.folder_id ?? null
  if (body.folderId !== undefined) {
    folderId = body.folderId === null ? null : Number(body.folderId)
    if (folderId !== null && (!Number.isInteger(folderId) || !await db.prepare('SELECT id FROM library_folders WHERE tenant_id = ? AND id = ?').get(tenant.id, folderId)))
      throw createError({ statusCode: 400, message: 'Carpeta inválida. / Invalid folder.' })
  }
  const category = typeof body.category === 'string' ? body.category.trim() : item.category
  if (!category || category.length > 100) throw createError({ statusCode: 400, message: 'Categoría inválida. / Invalid category.' })
  await db.prepare('UPDATE library_items SET folder_id = ?, category = ?, archived_at = ? WHERE tenant_id = ? AND id = ?')
    .run(folderId, category, typeof body.archived === 'boolean' ? (body.archived ? nowIso() : '') : item.archived_at, tenant.id, id)
  return { ok: true }
})
