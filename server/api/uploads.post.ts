// Subida de archivos autenticada (Fase 2).
// kind=image  → imagen para adjuntar a una publicación (máx. 5 MB)
// kind=avatar → foto de perfil del usuario actual (máx. 2 MB); además de
//               devolver la URL, actualiza users.avatar_url.
// kind=cover  → foto de portada del perfil (Fase 6, máx. 2 MB); además
//               de devolver la URL, actualiza users.cover_url.
// kind=audio  → audio para insertar en un post o en una lección (Fase 8,
//               máx. 15 MB): MP3, M4A, OGG, WAV o WebM.
// kind=file   → archivo genérico (Fase 8, máx. 15 MB): adjunto de post,
//               PDF/Slides/Download de lecciones y recursos. Mismos
//               tipos que la biblioteca (sin ejecutables).
// kind=branding → imagen de marca del tenant (Fase 15, máx. 2 MB):
//               logos, icono y favicon que el administrador sube desde
//               Ajustes de la comunidad. La subida solo guarda el
//               archivo; asignarlo al tenant es del PUT de ajustes
//               (que exige rol admin y valida la URL).
// Los archivos van a R2 (binding FILES) en el Worker o a data/uploads/
// en desarrollo local (ver server/utils/storage.ts).
import { requireUser, resolveTenant } from '../utils/community'
import { nowIso, dbFor } from '../utils/db'
import { IMAGE_TYPES, LIBRARY_TYPES, saveFile } from '../utils/storage'
import { randomBytes } from 'node:crypto'

const LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024, avatar: 2 * 1024 * 1024, cover: 2 * 1024 * 1024,
  audio: 15 * 1024 * 1024, file: 15 * 1024 * 1024, branding: 2 * 1024 * 1024,
}
const AUDIO_TYPES: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm',
}
const TYPE_SETS: Record<string, Record<string, string>> = {
  image: IMAGE_TYPES, avatar: IMAGE_TYPES, cover: IMAGE_TYPES, branding: IMAGE_TYPES,
  audio: AUDIO_TYPES, file: { ...LIBRARY_TYPES, ...AUDIO_TYPES },
}
const TYPE_MESSAGES: Record<string, string> = {
  image: 'Solo se permiten imágenes PNG, JPG, WebP o GIF.',
  branding: 'Solo se permiten imágenes PNG, JPG, WebP o GIF.',
  audio: 'Solo se permiten audios MP3, M4A, OGG, WAV o WebM.',
  file: 'Tipo de archivo no permitido.',
}

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const form = await readMultipartFormData(event)
  const filePart = form?.find(p => p.name === 'file')
  const kindPart = form?.find(p => p.name === 'kind')
  const kind = kindPart ? new TextDecoder().decode(kindPart.data) : 'image'
  if (!filePart || !filePart.data?.length)
    throw createError({ statusCode: 400, message: 'Falta el archivo.' })
  const limit = LIMITS[kind]
  if (!limit) throw createError({ statusCode: 400, message: 'Tipo de subida inválido.' })
  const contentType = filePart.type || ''
  const ext = TYPE_SETS[kind]![contentType]
  if (!ext) throw createError({ statusCode: 415, message: TYPE_MESSAGES[kind] || TYPE_MESSAGES.file! })
  if (filePart.data.length > limit)
    throw createError({ statusCode: 413, message: `El archivo supera el máximo de ${Math.round(limit / 1024 / 1024)} MB.` })
  const folder = kind === 'avatar' ? 'avatars' : kind === 'cover' ? 'covers' : kind === 'branding' ? 'branding' : 'posts'
  const key = `${folder}/${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`
  const stored = await saveFile(event, key, new Uint8Array(filePart.data), contentType)
  const db = await dbFor(event)
  await db.prepare('INSERT INTO uploads (tenant_id, user_id, key, filename, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, user.id, key, filePart.filename || key, contentType, filePart.data.length, nowIso())
  if (kind === 'avatar') {
    await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(stored.url, user.id)
  }
  if (kind === 'cover') {
    await db.prepare('UPDATE users SET cover_url = ? WHERE id = ?').run(stored.url, user.id)
  }
  // `name` (Fase 8): nombre original, para mostrar el adjunto sin tener
  // que adivinarlo desde la clave interna.
  return { url: stored.url, key, name: filePart.filename || key }
})
