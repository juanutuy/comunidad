// Genera scripts/d1-init.sql (esquema + seed) desde la base local ya
// sembrada (data/comunidad.db), para aplicarlo en producción con:
//   wrangler d1 execute comunidad-db --remote --file=scripts/d1-init.sql
//
// Uso:  node scripts/gen-d1-init.mjs
// Si la base local tiene datos de prueba, borrá data/comunidad.db*,
// levantá `npm run dev` una vez (se siembra sola) y volvé a generar.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const TABLES = [
  'tenants', 'users', 'memberships', 'channel_groups', 'channels', 'follows',
  'channel_access', 'posts', 'reactions', 'comments', 'bookmarks', 'courses',
  'chapters', 'lessons', 'enrollments', 'events', 'rsvps', 'library_items',
]

const db = new Database(join(process.cwd(), 'data', 'comunidad.db'), { readonly: true })

const esc = (v) => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

let out = `-- Comunidad MVP — esquema + seed inicial para Cloudflare D1.\n-- Generado con scripts/gen-d1-init.mjs desde la base local sembrada.\n-- Aplicar: wrangler d1 execute comunidad-db --remote --file=scripts/d1-init.sql\n-- Es idempotente en tablas (IF NOT EXISTS); los INSERT asumen base vacía.\n\n`

for (const t of TABLES) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(t)
  if (!row) continue
  out += `${row.sql.replace(/^CREATE TABLE/, 'CREATE TABLE IF NOT EXISTS')};\n`
}
const indexes = db.prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name`).all()
for (const ix of indexes) out += `${ix.sql.replace(/^CREATE UNIQUE INDEX/, 'CREATE UNIQUE INDEX IF NOT EXISTS').replace(/^CREATE INDEX(?! IF)/, 'CREATE INDEX IF NOT EXISTS')};\n`
out += '\n'
for (const t of TABLES) {
  const rows = db.prepare(`SELECT * FROM ${t}`).all()
  for (const r of rows) {
    const cols = Object.keys(r)
    out += `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(c => esc(r[c])).join(', ')});\n`
  }
}
db.close()
writeFileSync(join(process.cwd(), 'scripts', 'd1-init.sql'), out)
console.log(`scripts/d1-init.sql generado (${out.split('\n').length} líneas).`)
