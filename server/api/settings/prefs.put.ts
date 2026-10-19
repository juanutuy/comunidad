// Guardar preferencias de cuenta (Fase 5): qué notificaciones recibir
// por tipo (respetadas por utils/notify.ts) y si aparecer en el
// directorio de miembros (respetado por /api/members/directory).
// Fase 9: show_in_search — aparecer en los resultados de búsqueda
// (respetado por /api/search, que deja de devolver el perfil).
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

const ALLOWED = ['notify_reaction', 'notify_comment', 'notify_mention', 'notify_new_post', 'notify_dm', 'notify_follow', 'directory_visible', 'show_in_search']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<Record<string, unknown>>(event)
  const db = await dbFor(event)
  for (const key of ALLOWED) {
    if (typeof body[key] !== 'boolean') continue
    await db.prepare(`INSERT INTO user_prefs (tenant_id, user_id, key, value) VALUES (?, ?, ?, ?)
      ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET value = excluded.value`)
      .run(tenant.id, user.id, key, body[key] ? '1' : '0')
  }
  return { ok: true }
})
