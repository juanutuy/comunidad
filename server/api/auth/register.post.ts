// Registro: crea el usuario, su membresía como miembro y abre sesión.
import { hashPassword, setSession } from '../../utils/auth'
import { ensureMembership, publicUser, resolveTenant } from '../../utils/community'
import { nowIso, rawDb, slugify } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string, email?: string, password?: string }>(event)
  const name = (body.name || '').trim()
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!name || !email.includes('@') || password.length < 8)
    throw createError({ statusCode: 400, message: 'Completá nombre, un correo válido y una contraseña de al menos 8 caracteres.' })
  const db = rawDb()
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
    throw createError({ statusCode: 409, message: 'Ya existe una cuenta con ese correo.' })
  let slug = slugify(name)
  if (db.prepare('SELECT id FROM users WHERE slug = ?').get(slug)) slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
  const id = Number(db.prepare('INSERT INTO users (name, slug, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, slug, email, hashPassword(password), nowIso()).lastInsertRowid)
  const tenant = resolveTenant(event)
  ensureMembership(tenant.id, id, 'member')
  setSession(event, id)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as import('../../utils/community').UserRow
  return { user: { ...publicUser(user), role: 'member' } }
})
