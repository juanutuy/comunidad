import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AsyncDb } from '../server/utils/db'

export function openSQLite(path: string): { db: AsyncDb, close: () => void } {
  mkdirSync(dirname(path), { recursive: true })
  const raw = new Database(path)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  const db: AsyncDb = {
    kind: 'sqlite',
    prepare: sql => ({
      all: async (...p) => raw.prepare(sql).all(...p),
      get: async (...p) => raw.prepare(sql).get(...p),
      run: async (...p) => { const r = raw.prepare(sql).run(...p); return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) } },
    }),
    exec: async sql => { raw.exec(sql) },
    batch: async commands => raw.transaction(() => commands.map(c => {
      const r = raw.prepare(c.sql).run(...(c.params || []))
      return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) }
    }))(),
  }
  return { db, close: () => raw.close() }
}
