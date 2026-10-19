// Biblioteca: metadatos de recursos con filtro por tipo.
// Los archivos reales vivirán en R2 (fase 2); aquí se listan metadatos.
import { resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const kind = String(getQuery(event).kind || 'all')
  const db = await dbFor(event)
  const rows = (kind === 'all'
    ? await db.prepare('SELECT * FROM library_items WHERE tenant_id = ? ORDER BY created_at DESC').all(tenant.id)
    : await db.prepare('SELECT * FROM library_items WHERE tenant_id = ? AND kind = ? ORDER BY created_at DESC').all(tenant.id, kind)) as Record<string, unknown>[]
  return {
    items: rows.map(i => ({
      id: i.id, title: i.title, kind: i.kind, category: i.category,
      sizeLabel: i.size_label, downloads: i.downloads, locked: !!i.locked, createdAt: i.created_at,
    })),
  }
})
