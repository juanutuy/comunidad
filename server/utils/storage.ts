// Almacenamiento de archivos subidos (Fase 2).
//
// - En el Worker (producción y `wrangler dev`): se usa el binding R2
//   `FILES`, ya declarado en wrangler.jsonc.
// - En `npm run dev` (Node, sin binding): los archivos se guardan en
//   `data/uploads/<key>` y se sirven por la misma ruta /api/files/<key>.
//   Nada de esto corre en el Worker: los imports de node:fs son perezosos
//   y solo se ejecutan en el camino local.
//
// Las claves son internas y con prefijo por uso: `posts/…`, `avatars/…`,
// `library/…`. Los archivos bajo `library/` NUNCA se sirven por la ruta
// pública: la descarga pasa por /api/library/:id/download, que verifica
// el candado premium antes de entregar el archivo.

interface R2ObjectLike { body: unknown, httpMetadata?: { contentType?: string } }
interface R2BucketLike {
  put: (key: string, value: unknown, options?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>
  get: (key: string) => Promise<R2ObjectLike | null>
  delete?: (key: string) => Promise<unknown>
}

export function r2Bucket(event?: any): R2BucketLike | undefined {
  const files = (event?.context?.cloudflare?.env?.FILES
    ?? event?.context?._platform?.cloudflare?.env?.FILES
    ?? (globalThis as any).__env__?.FILES) as R2BucketLike | undefined
  return files && typeof files.put === 'function' ? files : undefined
}

export interface StoredFile { key: string, url: string }

export async function saveFile(event: any, key: string, data: Uint8Array, contentType: string): Promise<StoredFile> {
  const r2 = r2Bucket(event)
  if (r2) {
    await r2.put(key, data, { httpMetadata: { contentType } })
  }
  else {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const full = join(process.cwd(), 'data', 'uploads', key)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, data)
  }
  return { key, url: `/api/files/${key}` }
}

// Borrado físico (Fase 16, gestor de medios del admin): R2 en el
// Worker, unlink en desarrollo local. No lanza si el objeto ya no
// está: el llamador borra la fila de `uploads` igual.
export async function deleteFile(event: any, key: string): Promise<void> {
  const r2 = r2Bucket(event)
  if (r2) {
    if (typeof r2.delete === 'function') await r2.delete(key)
    return
  }
  const { existsSync, unlinkSync } = await import('node:fs')
  const { join } = await import('node:path')
  const safe = key.split('/').filter(p => p && p !== '..' && p !== '.').join('/')
  const full = join(process.cwd(), 'data', 'uploads', safe)
  if (existsSync(full)) unlinkSync(full)
}

export interface ReadFile { data: Uint8Array, contentType: string }

const TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip', mp3: 'audio/mpeg', mp4: 'video/mp4',
}

export function contentTypeFor(filename: string, fallback = 'application/octet-stream'): string {
  const ext = filename.toLowerCase().split('.').pop() || ''
  return TYPE_BY_EXT[ext] || fallback
}

export async function readFile(event: any, key: string): Promise<ReadFile | null> {
  const r2 = r2Bucket(event)
  if (r2) {
    const obj = await r2.get(key)
    if (!obj) return null
    const buf = new Uint8Array(await new Response(obj.body as BodyInit).arrayBuffer())
    return { data: buf, contentType: obj.httpMetadata?.contentType || contentTypeFor(key) }
  }
  const { existsSync, readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  // Clave interna generada por la app; aun así se normaliza la ruta.
  const safe = key.split('/').filter(p => p && p !== '..' && p !== '.').join('/')
  const full = join(process.cwd(), 'data', 'uploads', safe)
  if (!existsSync(full)) return null
  return { data: new Uint8Array(readFileSync(full)), contentType: contentTypeFor(safe) }
}

// Validación de subidas: tipos y tamaños (Fase 2).
export const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
}
export const LIBRARY_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4',
}

export function kindForFile(contentType: string, filename: string): string {
  if (contentType === 'application/pdf') return 'pdf'
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType === 'application/zip') return 'doc'
  if (filename) return 'doc'
  return 'doc'
}
