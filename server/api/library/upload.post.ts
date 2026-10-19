// Subir un recurso real a la biblioteca (solo admin).
// Multipart: file + title + category + locked (0/1).
// El archivo va a R2 / data/uploads bajo la clave `library/…` y NO es
// público: la descarga pasa por /api/library/:id/download.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { nowIso, dbFor } from '../../utils/db'
import { LIBRARY_TYPES, kindForFile, saveFile } from '../../utils/storage'
import { randomBytes } from 'node:crypto'

const MAX = 10 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireAdmin(event, tenant.id)
  const form = await readMultipartFormData(event)
  const part = (name: string) => form?.find(p => p.name === name)
  const text = (name: string) => { const p = part(name); return p ? new TextDecoder().decode(p.data).trim() : '' }
  const filePart = part('file')
  if (!filePart || !filePart.data?.length)
    throw createError({ statusCode: 400, message: 'Falta el archivo.' })
  const title = text('title') || (filePart.filename || 'Recurso sin título')
  const contentType = filePart.type || 'application/octet-stream'
  const ext = LIBRARY_TYPES[contentType]
  if (!ext) throw createError({ statusCode: 415, message: 'Tipo de archivo no permitido en la biblioteca.' })
  if (filePart.data.length > MAX)
    throw createError({ statusCode: 413, message: 'El archivo supera el máximo de 10 MB.' })
  const key = `library/${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${ext}`
  await saveFile(event, key, new Uint8Array(filePart.data), contentType)
  const sizeLabel = filePart.data.length >= 1024 * 1024
    ? `${(filePart.data.length / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(filePart.data.length / 1024))} KB`
  const db = await dbFor(event)
  const id = Number((await db.prepare('INSERT INTO library_items (tenant_id, title, kind, category, size_label, downloads, locked, file_key, file_name, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)')
    .run(tenant.id, title, kindForFile(contentType, filePart.filename || ''), text('category') || 'General', sizeLabel, text('locked') === '1' ? 1 : 0, key, filePart.filename || title, nowIso())).lastInsertRowId)
  // Registro de auditoría de subidas (el autor es el admin que sube).
  await db.prepare('INSERT INTO uploads (tenant_id, user_id, key, filename, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, user.id, key, filePart.filename || title, contentType, filePart.data.length, nowIso())
  return { id, title }
})
