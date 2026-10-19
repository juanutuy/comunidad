// Editar el perfil propio desde Ajustes de cuenta (Fase 5): nombre,
// bio y ubicación. El slug no cambia (los enlaces al perfil y las
// menciones @slug quedan estables). La foto se cambia con la subida
// de avatar ya existente (/api/uploads, kind 'avatar').
import { requireUser, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const user = await requireUser(event, tenant.id)
  const body = await readBody<{ name?: string, bio?: string, location?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'Tu nombre no puede quedar vacío.' })
  const db = await dbFor(event)
  await db.prepare('UPDATE users SET name = ?, bio = ?, location = ? WHERE id = ?')
    .run(name, (body.bio || '').trim().slice(0, 500), (body.location || '').trim().slice(0, 80), user.id)
  return { ok: true }
})
