// Digest de actividad (Fase 4). Endpoint protegido por el secreto de
// cron (header `x-cron-secret` o `Authorization: Bearer <secreto>`,
// variable NUXT_CRON_SECRET). Genera, para CADA tenant, un resumen de
// los últimos 7 días (publicaciones nuevas y eventos próximos) y lo
// envía a sus miembros con la capa de correo: sin proveedor configurado
// cada envío queda en email_log como 'skipped_no_provider' — el digest
// se genera y se registra, nunca se finge el envío.
//
// Disparo sugerido: un Cron Trigger de Cloudflare que haga POST a esta
// URL, o cualquier programador externo (cron del servidor, n8n) con el
// header del secreto. Sin NUXT_CRON_SECRET el endpoint responde 503.
import { dbFor } from '../../utils/db'
import { publishDuePosts } from '../../utils/community'
import { sendEmail } from '../../utils/email'

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig()
  const cronSecret = (cfg.cronSecret as string) || ''
  if (!cronSecret)
    throw createError({ statusCode: 503, message: 'El digest no está activado: falta configurar NUXT_CRON_SECRET en el servidor.' })
  const provided = getHeader(event, 'x-cron-secret') || (getHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '')
  if (provided !== cronSecret)
    throw createError({ statusCode: 401, message: 'Secreto de cron inválido.' })

  const db = await dbFor(event)
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const now = new Date().toISOString()
  const tenants = await db.prepare('SELECT * FROM tenants ORDER BY id').all() as Record<string, unknown>[]
  let recipients = 0
  let sent = 0
  let skipped = 0

  for (const tenant of tenants) {
    const tenantId = Number(tenant.id)
    await publishDuePosts(event, tenantId)
    const newPosts = await db.prepare("SELECT p.title, c.name AS channel_name FROM posts p JOIN channels c ON c.id = p.channel_id WHERE p.tenant_id = ? AND p.status = 'published' AND p.created_at >= ? ORDER BY p.created_at DESC LIMIT 8").all(tenantId, weekAgo) as Record<string, unknown>[]
    const upcoming = await db.prepare('SELECT title, starts_at FROM events WHERE tenant_id = ? AND starts_at >= ? ORDER BY starts_at LIMIT 5').all(tenantId, now) as Record<string, unknown>[]
    const postCount = (await db.prepare("SELECT COUNT(*) AS n FROM posts WHERE tenant_id = ? AND status = 'published' AND created_at >= ?").get(tenantId, weekAgo) as { n: number }).n
    const lines = [
      `Hola, esto pasó esta semana en ${tenant.name}:`,
      '',
      postCount
        ? `• ${postCount} publicación(es) nueva(s). Destacadas:`
        : '• Sin publicaciones nuevas esta semana: ¡es un buen momento para compartir algo!',
      ...newPosts.map(p => `  - ${p.title} (en ${p.channel_name})`),
      '',
      upcoming.length ? 'Próximos eventos:' : 'Sin eventos próximos por ahora.',
      ...upcoming.map(e => `  - ${e.title} · ${String(e.starts_at).slice(0, 10)}`),
      '',
      'Entrá a la comunidad para participar.',
    ]
    const members = await db.prepare('SELECT u.id, u.email, u.name FROM users u JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?').all(tenantId) as Record<string, unknown>[]
    for (const m of members) {
      recipients++
      const status = await sendEmail(event, {
        tenantId, userId: Number(m.id), to: String(m.email), kind: 'digest',
        subject: `Tu resumen semanal de ${tenant.name}`,
        text: lines.join('\n'),
      })
      if (status === 'sent') sent++
      else skipped++
    }
  }
  return { ok: true, tenants: tenants.length, recipients, sent, skipped }
})
