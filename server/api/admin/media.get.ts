// Gestor de medios — Contenido → Archivos (Fase 16): TODAS las
// subidas del tenant (tabla `uploads`) con tipo derivado del MIME,
// quién subió, tamaño y ubicación de uso. El «total usado» es la
// SUMA REAL de tamaños: no se muestra ninguna cuota (la referencia
// muestra «de 500 GB»; acá no hay un límite contratado que mostrar).
// Acceso: solo admin.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { findFileLocations, formatBytes, mediaKind, mediaUrls } from '../../utils/media'
import type { UploadRow } from '../../utils/media'

const KINDS = ['image', 'video', 'audio', 'file'] as const

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const query = getQuery(event)
  const kind = KINDS.includes(String(query.type) as typeof KINDS[number]) ? String(query.type) : 'all'
  const limit = Math.min(100, Math.max(1, Number(query.limit || 50) || 50))
  const offset = Math.max(0, Number(query.offset || 0) || 0)
  const db = await dbFor(event)

  const totals = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN content_type LIKE \'image/%\' THEN 1 ELSE 0 END), 0) AS images, COALESCE(SUM(CASE WHEN content_type LIKE \'video/%\' THEN 1 ELSE 0 END), 0) AS videos, COALESCE(SUM(CASE WHEN content_type LIKE \'audio/%\' THEN 1 ELSE 0 END), 0) AS audios, COALESCE(SUM(size), 0) AS bytes FROM uploads WHERE tenant_id = ?')
    .get(tenant.id) as { n: number, images: number, videos: number, audios: number, bytes: number }
  const counts = {
    all: Number(totals.n),
    image: Number(totals.images),
    video: Number(totals.videos),
    audio: Number(totals.audios),
    file: Number(totals.n) - Number(totals.images) - Number(totals.videos) - Number(totals.audios),
  }
  const typeFilter = kind === 'image' ? " AND u.content_type LIKE 'image/%'"
    : kind === 'video' ? " AND u.content_type LIKE 'video/%'"
      : kind === 'audio' ? " AND u.content_type LIKE 'audio/%'"
        : kind === 'file' ? " AND u.content_type NOT LIKE 'image/%' AND u.content_type NOT LIKE 'video/%' AND u.content_type NOT LIKE 'audio/%'"
          : ''
  const total = kind === 'all' ? counts.all : counts[kind as keyof typeof counts]
  const rows = await db.prepare(`SELECT u.*, usr.name AS uploader_name, usr.slug AS uploader_slug
    FROM uploads u LEFT JOIN users usr ON usr.id = u.user_id
    WHERE u.tenant_id = ?${typeFilter} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`)
    .all(tenant.id, limit, offset) as (UploadRow & { uploader_name: string | null, uploader_slug: string | null })[]
  const files = []
  for (const r of rows) {
    const locations = await findFileLocations(db, tenant.id, r)
    const urls = mediaUrls(r, locations.libraryItemId)
    files.push({
      id: r.id, filename: r.filename || r.key, key: r.key,
      contentType: r.content_type || '', kind: mediaKind(r.content_type || ''),
      size: Number(r.size || 0), sizeLabel: formatBytes(Number(r.size || 0)),
      createdAt: r.created_at,
      uploader: { name: r.uploader_name || '—', slug: r.uploader_slug || '' },
      locations: locations.labels,
      url: urls.url, downloadUrl: urls.downloadUrl,
    })
  }
  return {
    totalBytes: Number(totals.bytes), totalLabel: formatBytes(Number(totals.bytes)),
    counts, total, limit, offset, files,
  }
})
