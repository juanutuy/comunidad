// Agregar un miembro manualmente (solo admin, Fase 14): el
// administrador crea la cuenta con nombre y correo. La contraseña es
// TEMPORAL, generada acá, y se devuelve UNA sola vez en esta
// respuesta para que el admin se la pase a la persona (no se guarda
// en claro ni se finge un envío). Si el correo ya tiene cuenta en la
// plataforma, solo se suma la membresía activa a esta comunidad.
import { randomBytes } from 'node:crypto'
import { hashPassword } from '../../../utils/auth'
import { requireAdmin, resolveTenant } from '../../../utils/community'
import { dbFor, nowIso, slugify } from '../../../utils/db'
import { applyAutoJoin } from '../../../utils/members'

function tempPassword(): string {
  // Legible para dictarla/pasarla: bloques de 4 sin caracteres ambiguos.
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  const chars = [...bytes].map(b => alphabet[b % alphabet.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`
}

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<{ name?: string, email?: string }>(event)
  const name = (body.name || '').trim()
  const email = (body.email || '').trim().toLowerCase()
  if (!name || !email.includes('@'))
    throw createError({ statusCode: 400, message: 'Completá el nombre y un correo válido.' })
  const db = await dbFor(event)
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined
  if (existing) {
    const m = await db.prepare('SELECT id FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, existing.id)
    if (m) throw createError({ statusCode: 409, message: 'Esa persona ya es miembro de esta comunidad.' })
    await db.prepare("INSERT INTO memberships (tenant_id, user_id, role, status) VALUES (?, ?, 'member', 'active')").run(tenant.id, existing.id)
    await applyAutoJoin(event, tenant.id, existing.id)
    return { ok: true, created: false, tempPassword: null as string | null }
  }
  let slug = slugify(name)
  if (await db.prepare('SELECT id FROM users WHERE slug = ?').get(slug)) slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const password = tempPassword()
  const id = Number((await db.prepare('INSERT INTO users (name, slug, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, slug, email, hashPassword(password), nowIso())).lastInsertRowId)
  await db.prepare("INSERT INTO memberships (tenant_id, user_id, role, status) VALUES (?, ?, 'member', 'active')").run(tenant.id, id)
  await applyAutoJoin(event, tenant.id, id)
  return { ok: true, created: true, tempPassword: password }
})
