// Biblioteca: recursos con filtro por tipo.
// Desde la Fase 2 un item puede tener archivo real (file_key en R2 o en
// disco local): la descarga pasa por /api/library/:id/download, que
// verifica el candado. Los items semilla sin archivo quedan como
// metadatos/enlaces de referencia (hasFile = false).
import { currentAuth, resolveTenant } from '../utils/community'
import { hasPremiumAccess } from '../utils/levels'
import { dbFor } from '../utils/db'
import { getPrivacySettings } from '../utils/privacy'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  // Fase 15: en el modo público, la biblioteca se abre a visitantes
  // solo si su audiencia es 'everyone'; con 'members' pide sesión
  // (las descargas con candado ya exigían acceso premium aparte).
  const { user: earlyUser } = await currentAuth(event, tenant.id)
  if (!earlyUser) {
    const priv = await getPrivacySettings(event, tenant.id)
    if (priv.visibility === 'public' && priv.libraryAudience !== 'everyone')
      throw createError({ statusCode: 401, message: 'Iniciá sesión para ver la biblioteca.' })
  }
  const kind = String(getQuery(event).kind || 'all')
  const db = await dbFor(event)
  const rows = (kind === 'all'
    ? await db.prepare('SELECT * FROM library_items WHERE tenant_id = ? ORDER BY created_at DESC').all(tenant.id)
    : await db.prepare('SELECT * FROM library_items WHERE tenant_id = ? AND kind = ? ORDER BY created_at DESC').all(tenant.id, kind)) as Record<string, unknown>[]
  const { user, role } = await currentAuth(event, tenant.id)
  const premium = user ? await hasPremiumAccess(event, tenant.id, user.id, role) : false
  return {
    items: rows.map(i => ({
      id: i.id, title: i.title, kind: i.kind, category: i.category,
      sizeLabel: i.size_label, downloads: i.downloads, locked: !!i.locked, createdAt: i.created_at,
      hasFile: !!i.file_key,
      canDownload: !!i.file_key && (!i.locked || premium),
    })),
  }
})
