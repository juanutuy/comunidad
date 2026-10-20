// Gestor de medios (Fase 16): clasificación de las subidas y
// resolución de «Ubicación» — dónde se está usando cada archivo —
// en el mejor esfuerzo con las referencias REALES del esquema. Un
// archivo puede estar referenciado desde varios lugares a la vez
// (p. ej. la misma imagen como miniatura de un curso y dentro de un
// post); se devuelven todas las ubicaciones encontradas. Si ninguna
// referencia coincide, la ubicación es [] y la UI muestra «—».
//
// Las referencias posibles hoy:
//   - users.avatar_url / cover_url         → la URL pública del archivo
//   - posts.media_url                      → adjunto del post
//   - posts.body_html (LIKE)               → imagen/audio incrustado
//   - courses.image_url / banner_url       → miniatura / banner
//   - lessons.file_url / resource_url / video_url → archivo de lección
//   - library_items.file_key               → la CLAVE interna (no URL)
//   - tenants.logo_url / logo_dark_url / icon_url / favicon_url → marca
import type { AsyncDb } from './db'

export type MediaKind = 'image' | 'video' | 'audio' | 'file'

export function mediaKind(contentType: string): MediaKind {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/')) return 'audio'
  return 'file'
}

export interface UploadRow {
  id: number, tenant_id: number, user_id: number, key: string, filename: string
  content_type: string, size: number, created_at: string
}

export interface FileLocations { labels: string[], libraryItemId: number | null }

/** Resolve every reference for a page in one SQL statement, without a query per file. */
export async function findFilesLocations(db: AsyncDb, tenantId: number, uploads: UploadRow[]): Promise<Map<number, FileLocations>> {
  const out = new Map(uploads.map(u => [u.id, { labels: [] as string[], libraryItemId: null as number | null }]))
  if (!uploads.length) return out
  const rows = await db.prepare(`WITH selected AS (
    SELECT id, key, '/api/files/' || key AS url FROM uploads WHERE tenant_id = ? AND id IN (SELECT value FROM json_each(?))
  )
  SELECT s.id AS upload_id, 'Foto de perfil de ' || u.name AS label, NULL AS library_id FROM selected s JOIN users u ON u.avatar_url = s.url JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
  UNION ALL SELECT s.id, 'Portada de perfil de ' || u.name, NULL FROM selected s JOIN users u ON u.cover_url = s.url JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ?
  UNION ALL SELECT s.id, 'Publicación «' || p.title || '»', NULL FROM selected s JOIN posts p ON p.media_url = s.url OR instr(p.body_html, s.url) > 0 WHERE p.tenant_id = ?
  UNION ALL SELECT s.id, 'Comentario en «' || p.title || '»', NULL FROM selected s JOIN comments cm ON cm.media_url = s.url JOIN posts p ON p.id = cm.post_id WHERE p.tenant_id = ?
  UNION ALL SELECT s.id, 'Portada del canal «' || c.name || '»', NULL FROM selected s JOIN channels c ON c.cover_url = s.url WHERE c.tenant_id = ?
  UNION ALL SELECT s.id, 'Imagen del curso «' || c.title || '»', NULL FROM selected s JOIN courses c ON c.image_url = s.url OR c.banner_url = s.url WHERE c.tenant_id = ?
  UNION ALL SELECT s.id, 'Archivo de la lección «' || l.title || '»', NULL FROM selected s JOIN lessons l ON l.file_url = s.url OR l.resource_url = s.url OR l.video_url = s.url OR instr(l.content_html, s.url) > 0 JOIN chapters ch ON ch.id = l.chapter_id JOIN courses c ON c.id = ch.course_id WHERE c.tenant_id = ?
  UNION ALL SELECT s.id, 'Ítem de biblioteca «' || l.title || '»', l.id FROM selected s JOIN library_items l ON l.file_key = s.key WHERE l.tenant_id = ?
  UNION ALL SELECT s.id, 'Marca de la comunidad', NULL FROM selected s JOIN tenants t ON t.logo_url = s.url OR t.logo_dark_url = s.url OR t.icon_url = s.url OR t.favicon_url = s.url WHERE t.id = ?`)
    .all(tenantId, JSON.stringify(uploads.map(u => u.id)), tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, tenantId) as { upload_id: number, label: string, library_id: number | null }[]
  for (const row of rows) {
    const entry = out.get(row.upload_id)!
    if (!entry.labels.includes(row.label)) entry.labels.push(row.label)
    if (row.library_id !== null) entry.libraryItemId ??= row.library_id
  }
  return out
}

// Resource URLs retain their authorization checks. Library files use their download route.
export function mediaUrls(upload: UploadRow, libraryItemId: number | null): { url: string | null, downloadUrl: string } {
  const publicUrl = upload.key.startsWith('library/') ? null : `/api/files/${upload.key}`
  const downloadUrl = publicUrl
    ?? (libraryItemId ? `/api/library/${libraryItemId}/download` : `/api/admin/media/${upload.id}/raw`)
  return { url: publicUrl, downloadUrl }
}

export function formatBytes(size: number): string {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}
