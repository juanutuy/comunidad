import { randomBytes, scryptSync } from 'node:crypto'
import { scriptDatabase } from './database'
import { SCHEMA_VERSION } from '../database/schema'

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || ''
const password = process.env.ADMIN_PASSWORD || ''
const slug = process.env.COMMUNITY_SLUG || ''
const name = process.env.COMMUNITY_NAME || slug
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 12 || !/^[a-z0-9-]{1,60}$/.test(slug))
  throw new Error('Set ADMIN_EMAIL, ADMIN_PASSWORD (12+ characters), COMMUNITY_SLUG and COMMUNITY_NAME. Never commit credentials.')
const salt = randomBytes(16)
const hash = `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`
const { db, close } = scriptDatabase()
try {
  const version = await db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()
  if (version?.value !== SCHEMA_VERSION) throw new Error('Run npm run db:migrate first')
  if (await db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw new Error('Admin email already exists. Use the existing account management flow.')
  await db.batch([
    { sql: 'INSERT INTO tenants (slug, name, created_at) VALUES (?, ?, ?)', params: [slug, name, new Date().toISOString()] },
    { sql: 'INSERT INTO users (slug, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', params: [`admin-${randomBytes(8).toString('hex')}`, 'Administrador', email, hash, new Date().toISOString()] },
    { sql: "INSERT INTO memberships (tenant_id, user_id, role, status) SELECT t.id, u.id, 'admin', 'active' FROM tenants t, users u WHERE t.slug = ? AND u.email = ?", params: [slug, email] },
    { sql: "INSERT INTO channel_groups (tenant_id, name, sort) SELECT id, 'General', 0 FROM tenants WHERE slug = ?", params: [slug] },
  ])
  console.log('Community and administrator created. Credentials were not printed.')
}
finally { close() }
