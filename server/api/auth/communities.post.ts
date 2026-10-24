import { communityPlatform, platformUser, validCommunitySlug } from '../../utils/provisioning'
import { dbFor, nowIso } from '../../utils/db'
import { limitAuthAttempts } from '../../utils/authLimits'

/** Atomic creation. Unique owner slot bounds abuse and makes retries safe. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  const platform = communityPlatform()
  if (!platform.enabled) throw createError({ statusCode: 503, message: 'La creación de comunidades aún no está habilitada. / Community creation is not enabled yet.' })
  const user = await platformUser(event)
  await limitAuthAttempts(event, `community-owner:${user.id}`)
  const body = await readBody<{ name?: unknown, nameEn?: unknown, slug?: unknown, locale?: unknown, requestKey?: unknown }>(event)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const nameEn = typeof body.nameEn === 'string' ? body.nameEn.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey : ''
  if (!name || name.length > 100 || nameEn.length > 100 || !validCommunitySlug(slug) || !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey))
    throw createError({ statusCode: 400, message: 'Revisá el nombre y subdominio (4–40 caracteres). / Check the name and subdomain (4–40 characters).' })
  const db = await dbFor(event)
  const existing = await db.prepare('SELECT t.slug, o.request_key FROM community_owners o JOIN tenants t ON t.id = o.tenant_id WHERE o.user_id = ?').get(user.id)
  if (existing) {
    if (existing.request_key === requestKey && existing.slug === slug) return { url: `https://${slug}.${platform.domain}/login`, created: false }
    throw createError({ statusCode: 409, message: 'Ya tenés una comunidad creada. / You already own a community.' })
  }
  const host = `${slug}.${platform.domain}`
  if (await db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug) || await db.prepare('SELECT id FROM tenant_domains WHERE domain = ?').get(host))
    throw createError({ statusCode: 409, message: 'Ese subdominio no está disponible. / That subdomain is unavailable.' })
  const now = nowIso()
  try {
    await db.batch([
      { sql: 'INSERT INTO tenants (slug, name, name_en, default_locale, brand_color, created_at) VALUES (?, ?, ?, ?, ?, ?)', params: [slug, name, nameEn, body.locale === 'en' ? 'en' : 'es', '#2563eb', now] },
      { sql: 'INSERT INTO community_owners (tenant_id, user_id, request_key, created_at) SELECT id, ?, ?, ? FROM tenants WHERE slug = ?', params: [user.id, requestKey, now, slug] },
      { sql: "INSERT INTO memberships (tenant_id, user_id, role, status) SELECT id, ?, 'admin', 'active' FROM tenants WHERE slug = ?", params: [user.id, slug] },
      { sql: 'INSERT INTO tenant_domains (tenant_id, domain, created_at) SELECT id, ?, ? FROM tenants WHERE slug = ?', params: [host, now, slug] },
    ])
  }
  catch (error) {
    if (String(error).includes('UNIQUE')) throw createError({ statusCode: 409, message: 'La comunidad o el propietario ya fueron registrados. / Community or owner already registered.' })
    throw error
  }
  return { url: `https://${host}/login`, created: true }
})
