import { postMetadata } from '../utils/postMetadata'
// Agregador de videos: publicaciones con media_type='video'.
import { POST_SELECT, canAccessChannel, channelBySlug, channelVisibility, currentAuth, resolveTenant, serializePost } from '../utils/community'
import { dbFor } from '../utils/db'
import { getPrivacySettings, requireSessionUnlessPublic } from '../utils/privacy'
import { hiddenFilterSql } from '../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role } = await currentAuth(event, tenant.id)
  // Endurecimiento Fase 15: comunidad privada = los videos no se leen sin sesión.
  await requireSessionUnlessPublic(event, tenant.id, user)
  const db = await dbFor(event)
  const hf = hiddenFilterSql(user?.id ?? null)
  const rows = await db.prepare(`${POST_SELECT} WHERE p.tenant_id = ? AND p.media_type = 'video' AND p.status = 'published'${hf.sql} ORDER BY p.created_at DESC`).all(tenant.id, ...hf.params) as Record<string, unknown>[]
  const priv = await getPrivacySettings(event, tenant.id)
  const metadata = await postMetadata(event, rows, user?.id ?? null)
  const posts = []
  for (const r of rows) {
    const ch = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
    const access = await canAccessChannel(event, user?.id ?? null, role, ch)
    // Fase 15: la página de videos es una superficie tipo feed — los
    // canales privados sin acceso no existen acá, y las tarjetas
    // bloqueadas de canales pagos siguen la misma regla «dónde
    // aparecen» del feed.
    if (ch.type === 'private' && !access) continue
    // Fase 16-F: visibilidad privada/secreta sin acceso = el video
    // no existe en esta superficie (igual que en el feed).
    if (channelVisibility(ch) !== 'public' && !access) continue
    if (ch.type === 'paid' && !access) {
      if (priv.paidLockedWhere !== 'feed') continue
      if (!user && priv.visibility !== 'public') continue
    }
    posts.push(await serializePost(event, r, user?.id ?? null, access, role, { metadata: metadata.get(Number(r.id)) }))
  }
  return { posts }
})
