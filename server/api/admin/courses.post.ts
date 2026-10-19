// Crear un curso (solo admin, Fase 5). El precio reutiliza el flujo
// de la Fase 4: un curso pago no se inscribe directo, lo concede el
// pago confirmado (webhook de Stripe) o un pago ya registrado.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { parseCourseInput } from '../../utils/courseAdmin'
import { nowIso, dbFor, slugify } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const input = parseCourseInput(await readBody(event))
  const db = await dbFor(event)
  let slug = slugify(input.title)
  if (await db.prepare('SELECT id FROM courses WHERE tenant_id = ? AND slug = ?').get(tenant.id, slug))
    slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const id = Number((await db.prepare('INSERT INTO courses (tenant_id, slug, title, description, level, price_cents, status, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(tenant.id, slug, input.title, input.description, input.level, input.priceCents, input.status, input.imageUrl, nowIso())).lastInsertRowId)
  return { id, slug }
})
