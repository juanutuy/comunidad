// Mis borradores y programados (Fase 5): solo los del autor actual.
// Incluye las opciones si el borrador es una encuesta.
import { requireUser, resolveTenant } from '../utils/community'
import { dbFor } from '../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const db = await dbFor(event)
  const rows = await db.prepare(`SELECT p.id, p.slug, p.title, p.body, p.body_html, p.anonymous, p.kind, p.status, p.scheduled_at, p.created_at,
      p.allow_comments, p.pinned, p.media_type, p.media_url, p.attachment_name, p.album,
      c.slug AS channel_slug, c.name AS channel_name
    FROM posts p JOIN channels c ON c.id = p.channel_id
    WHERE p.tenant_id = ? AND p.author_id = ? AND p.status IN ('draft', 'scheduled')
    ORDER BY p.created_at DESC`).all(tenant.id, user.id) as Record<string, unknown>[]
  const drafts = []
  for (const r of rows) {
    const options = r.kind === 'poll'
      ? (await db.prepare('SELECT label FROM poll_options WHERE post_id = ? ORDER BY sort, id').all(r.id) as { label: string }[]).map(o => o.label)
      : []
    drafts.push({
      id: r.id, slug: r.slug, title: r.title, body: r.body, bodyHtml: r.body_html || '', anonymous: !!r.anonymous, kind: r.kind, status: r.status,
      scheduledAt: r.scheduled_at || '', createdAt: r.created_at,
      // Fase 16-C: la edición abre el compositor del feed en modo
      // edit: necesita el estado completo para precargar (comentarios,
      // fijado y adjunto principal).
      allowComments: r.allow_comments === undefined || r.allow_comments === null ? true : !!r.allow_comments,
      pinned: !!r.pinned,
      mediaType: (r.media_type as string) || 'none', mediaUrl: (r.media_url as string) || '', attachmentName: (r.attachment_name as string) || '',
      // Fase 16-F: álbum del borrador (canales de imagen).
      album: (r.album as string) || '',
      channel: { slug: r.channel_slug, name: r.channel_name }, options,
    })
  }
  return { drafts }
})
