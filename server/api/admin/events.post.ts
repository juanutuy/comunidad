// Crear un evento (solo admin, Fase 5). Aparece en el calendario y
// en la lista pública reutilizando el RSVP existente.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { parseEventInput } from '../../utils/courseAdmin'
import { nowIso, dbFor, slugify } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const admin = await requireAdmin(event, tenant.id)
  const input = parseEventInput(await readBody(event))
  const db = await dbFor(event)
  let slug = slugify(input.title)
  if (await db.prepare('SELECT id FROM events WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const id = Number((await db.prepare('INSERT INTO events (tenant_id, slug, title, description, description_html, starts_at, ends_at, location, category, host_id, agenda, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, slug, input.title, input.description, input.descriptionHtml, input.startsAt, input.endsAt, input.location, input.category, admin.id, input.agenda, nowIso())).lastInsertRowId)
  return { id, slug }
})
