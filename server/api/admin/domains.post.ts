// Agregar un dominio personalizado al tenant (solo admin, Fase 4).
// La app resuelve el tenant por ese host exacto; la activación del
// dominio en Cloudflare for Platforms es un paso de cuenta aparte
// (documentado en la UI y en el README).
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor, nowIso } from '../../utils/db'

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ domain?: string }>(event)
  const domain = (body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!DOMAIN_RE.test(domain)) throw createError({ statusCode: 400, message: 'Escribí un dominio válido, sin http:// ni rutas (ej.: comunidad.tudominio.com).' })
  const db = await dbFor(event)
  if (await db.prepare('SELECT id FROM tenant_domains WHERE domain = ?').get(domain))
    throw createError({ statusCode: 409, message: 'Ese dominio ya está asignado a una comunidad.' })
  const r = await db.prepare('INSERT INTO tenant_domains (tenant_id, domain, created_at) VALUES (?, ?, ?)').run(tenant.id, domain, nowIso())
  return { domain: { id: Number(r.lastInsertRowId), domain } }
})
