import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: unknown }>(event)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 100) throw createError({ statusCode: 400, message: 'Nombre inválido. / Invalid name.' })
  const db = await dbFor(event)
  await db.prepare('INSERT OR IGNORE INTO library_folders (tenant_id, name, created_at) VALUES (?, ?, ?)').run(tenant.id, name, nowIso())
  return { folder: await db.prepare('SELECT id, name FROM library_folders WHERE tenant_id = ? AND name = ? COLLATE NOCASE').get(tenant.id, name) }
})
