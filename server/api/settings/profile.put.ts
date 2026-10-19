// Editar el perfil propio desde Ajustes de cuenta (Fase 5): nombre,
// bio y ubicación. El slug no cambia (los enlaces al perfil y las
// menciones @slug quedan estables). La foto se cambia con la subida
// de avatar ya existente (/api/uploads, kind 'avatar').
// Fase 6: se suma el sitio web del miembro — se guarda tal cual lo
// escribió si ya trae protocolo; al mostrarlo se normaliza (ver perfil).
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

// Validación básica de URL: acepta con o sin protocolo; lo que no
// parsea como URL con un host con punto no se guarda.
function normalizeWebsite(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`
  let url: URL
  try { url = new URL(candidate) }
  catch { throw createError({ statusCode: 400, message: 'El sitio web no parece una dirección válida.' }) }
  if (!url.hostname.includes('.')) throw createError({ statusCode: 400, message: 'El sitio web no parece una dirección válida.' })
  return value.slice(0, 200)
}

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ name?: string, bio?: string, location?: string, website?: string, coverUrl?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'Tu nombre no puede quedar vacío.' })
  const website = normalizeWebsite(body.website || '')
  const db = await dbFor(event)
  await db.prepare('UPDATE users SET name = ?, bio = ?, location = ?, website = ? WHERE id = ?')
    .run(name, (body.bio || '').trim().slice(0, 500), (body.location || '').trim().slice(0, 80), website, user.id)
  // Quitar la portada (Fase 6): si viene coverUrl en el cuerpo, se aplica
  // tal cual — la UI manda '' para volver al degradado por defecto. La
  // subida normal pasa por /api/uploads con kind 'cover'.
  if (typeof body.coverUrl === 'string') {
    await db.prepare('UPDATE users SET cover_url = ? WHERE id = ?').run(body.coverUrl.trim().slice(0, 500), user.id)
  }
  return { ok: true }
})
