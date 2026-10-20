import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSQLite } from '../database/local'
import type { AsyncDb, DbCommand } from '../server/utils/db'

const literal = (v: unknown) => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`
const sqlFor = (c: DbCommand) => { let i = 0; return c.sql.replace(/\?/g, () => literal(c.params?.[i++])) }

export function scriptDatabase(): { db: AsyncDb, close: () => void } {
  const remote = process.argv.includes('--remote')
  if (!remote && !process.argv.includes('--d1')) return openSQLite(process.env.DB_PATH || 'data/comunidad.db')
  const database = process.env.DB_NAME || 'comunidad-db'
  const location = remote ? '--remote' : '--local'
  const query = (sql: string) => {
    const output = execFileSync('npx', ['wrangler', 'd1', 'execute', database, location, '--json', '--command', sql], { encoding: 'utf8' })
    const result = JSON.parse(output)
    if (!result[0]?.success) throw new Error('D1 query failed')
    return result[0].results || []
  }
  const db: AsyncDb = {
    kind: 'd1',
    prepare: sql => ({ all: async () => query(sql), get: async (...params) => query(sqlFor({ sql, params }))[0], run: async (...params) => { query(sqlFor({ sql, params })); return { changes: 0, lastInsertRowId: null } } }),
    exec: async sql => { query(sql) },
    batch: async commands => {
      const dir = mkdtempSync(join(tmpdir(), 'comunidad-database-'))
      try {
        const file = join(dir, 'commands.sql')
        writeFileSync(file, commands.map(sqlFor).join(';\n') + ';\n', { mode: 0o600 })
        execFileSync('npx', ['wrangler', 'd1', 'execute', database, location, '--file', file, '--yes'], { stdio: 'inherit' })
        return []
      }
      finally { rmSync(dir, { recursive: true, force: true }) }
    },
  }
  return { db, close: () => {} }
}
