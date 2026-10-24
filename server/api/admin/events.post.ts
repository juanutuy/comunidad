// Crear un evento (solo admin, Fase 5). Aparece en el calendario y
// en la lista pública reutilizando el RSVP existente.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { parseEventInput } from '../../utils/courseAdmin'
import { nowIso, dbFor, slugify } from '../../utils/db'
import { randomUUID } from 'node:crypto'
import { eventOccurrences } from '../../utils/eventSeries'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const admin = await requireAdmin(event, tenant.id)
  const body = await readBody<Record<string, unknown>>(event)
  const input = parseEventInput(body)
  const { dates, timezone } = eventOccurrences(input.startsAt, input.endsAt, body)
  const db = await dbFor(event)
  let slug = slugify(input.title)
  if (await db.prepare('SELECT id FROM events WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  // Random suffix makes the whole batch safe against simultaneous series creation.
  slug = `${slug}-${randomUUID().slice(0, 8)}`
  const seriesId = dates.length > 1 ? randomUUID() : ''
  await db.batch(dates.map((date, index) => ({
    sql: 'INSERT INTO events (tenant_id, slug, title, description, description_html, starts_at, ends_at, location, category, host_id, agenda, created_at, series_id, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [tenant.id, index ? `${slug}-${index + 1}` : slug, input.title, input.description, input.descriptionHtml, date.startsAt, date.endsAt, input.location, input.category, admin.id, input.agenda, nowIso(), seriesId, timezone],
  })))
  const created = await db.prepare('SELECT id FROM events WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug)
  return { id: Number(created.id), slug, occurrences: dates.length }
})
