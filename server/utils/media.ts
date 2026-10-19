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

export async function findFileLocations(db: AsyncDb, tenantId: number, upload: UploadRow): Promise<FileLocations> {
  const url = `/api/files/${upload.key}`
  const labels: string[] = []
  let libraryItemId: number | null = null
  const add = async (sql: string, params: unknown[], label: (row: Record<string, unknown>) => string) => {
    try {
      const rows = await db.prepare(sql).all(...params) as Record<string, unknown>[]
      for (const r of rows) labels.push(label(r))
    }
    catch { /* tabla/columna ausente en bases muy viejas: se omite */ }
  }
  await add('SELECT name FROM users WHERE avatar_url = ?', [url], r => `Foto de perfil de ${r.name}`)
  await add('SELECT name FROM users WHERE cover_url = ?', [url], r => `Portada de perfil de ${r.name}`)
  await add('SELECT title FROM posts WHERE tenant_id = ? AND media_url = ?', [tenantId, url], r => `Adjunto de la publicación «${r.title}»`)
  // El cuerpo rico incrusta la URL tal cual; el LIKE va escapado
  // para que % y _ de la clave no actúen como comodines.
  const likeUrl = `%${url.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
  await add("SELECT title FROM posts WHERE tenant_id = ? AND body_html LIKE ? ESCAPE '\\'", [tenantId, likeUrl], r => `Contenido de la publicación «${r.title}»`)
  await add('SELECT title FROM courses WHERE tenant_id = ? AND image_url = ?', [tenantId, url], r => `Miniatura del curso «${r.title}»`)
  await add('SELECT title FROM courses WHERE tenant_id = ? AND banner_url = ?', [tenantId, url], r => `Banner del curso «${r.title}»`)
  await add('SELECT title FROM lessons WHERE tenant_id = ? AND (file_url = ? OR resource_url = ? OR video_url = ?)', [tenantId, url, url, url], r => `Archivo de la lección «${r.title}»`)
  const items = await db.prepare('SELECT id, title FROM library_items WHERE tenant_id = ? AND file_key = ?').all(tenantId, upload.key) as Record<string, unknown>[]
  for (const r of items) {
    labels.push(`Ítem de la biblioteca «${r.title}»`)
    if (libraryItemId === null) libraryItemId = Number(r.id)
  }
  await add('SELECT id FROM tenants WHERE id = ? AND (logo_url = ? OR logo_dark_url = ? OR icon_url = ? OR favicon_url = ?)', [tenantId, url, url, url, url], () => 'Marca de la comunidad (logo, icono o favicon)')
  return { labels, libraryItemId }
}

// La URL pública solo existe para archivos fuera de `library/` (la
// ruta /api/files los sirve; los de biblioteca bajan por su ruta con
// control de acceso). La descarga del admin: pública si existe; si
// es de biblioteca con ítem, la ruta de descarga del ítem; si es un
// archivo de biblioteca sin ítem (huérfano), la ruta cruda del admin.
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
