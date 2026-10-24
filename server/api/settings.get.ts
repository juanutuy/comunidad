// Ajustes de cuenta del usuario actual (Fase 5): datos de perfil y
// preferencias guardadas en user_prefs (sin fila = valor por defecto).
import { requireUser, resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

const NOTIFY_PREF_KEYS = ['notify_reaction', 'notify_comment', 'notify_mention', 'notify_new_post', 'notify_dm', 'notify_follow']

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare('SELECT key, value FROM user_prefs WHERE tenant_id = ? AND user_id = ?').all(tenant.id, user.id) as { key: string, value: string }[]
  const prefs: Record<string, boolean> = {}
  for (const k of NOTIFY_PREF_KEYS) prefs[k] = true
  prefs.directory_visible = true
  prefs.show_in_search = true
  prefs.feed_following = false
  for (const r of rows) prefs[r.key] = r.value !== '0'
  return {
    profile: { name: user.name, bio: user.bio, location: user.location, email: user.email, avatarUrl: user.avatar_url || '', coverUrl: user.cover_url || '', website: user.website || '' },
    prefs,
  }
})
