// Subida de archivos autenticada (Fase 2).
// kind=image  → imagen para adjuntar a una publicación (máx. 5 MB)
// kind=avatar → foto de perfil del usuario actual (máx. 2 MB); además de
//               devolver la URL, actualiza users.avatar_url.
// Los archivos van a R2 (binding FILES) en el Worker o a data/uploads/
// en desarrollo local (ver server/utils/storage.ts).
import { requireUser, resolveTenant } from '../utils/community'
import { nowIso, dbFor } from '../utils/db'
import { IMAGE_TYPES, saveFile } from '../utils/storage'
import { randomBytes } from 'node:crypto'

const LIMITS: Record<string, number> = { image: 5 * 1024 * 1024, avatar: 2 * 1024 * 1024 }

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
  const ext = IMAGE_TYPES[contentType]
  if (!ext) throw createError({ statusCode: 415, message: 'Solo se permiten imágenes PNG, JPG, WebP o GIF.' })
  if (filePart.data.length > limit)
    throw createError({ statusCode: 413, message: `La imagen supera el máximo de ${Math.round(limit / 1024 / 1024)} MB.` })
  const folder = kind === 'avatar' ? 'avatars' : 'posts'
  const key = `${folder}/${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`
  const stored = await saveFile(event, key, new Uint8Array(filePart.data), contentType)
  const db = await dbFor(event)
  await db.prepare('INSERT INTO uploads (tenant_id, user_id, key, filename, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, user.id, key, filePart.filename || key, contentType, filePart.data.length, nowIso())
  if (kind === 'avatar') {
    await db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(stored.url, user.id)
  }
  return { url: stored.url, key }
})
