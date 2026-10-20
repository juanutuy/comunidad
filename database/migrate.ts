import type { AsyncDb, DbCommand } from '../server/utils/db'
import { CREATE_SQL, MIGRATIONS, SCHEMA_VERSION } from './schema'

/** Explicit migration entrypoint; production requests only check schema_version. */
export async function migrateDb(db: AsyncDb): Promise<void> {
  await db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')")
  const version = await db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()
  if (version?.value === SCHEMA_VERSION) return
  const commands: DbCommand[] = CREATE_SQL.split(/;\s*\n/).map(sql => ({ sql: sql.trim() })).filter(c => c.sql)
  const tables = new Map<string, Set<string>>()
  for (const sql of MIGRATIONS) {
    const alter = sql.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+)/)
    if (alter) {
      const [, table, column] = alter as [string, string, string]
      if (!tables.has(table)) {
        const rows = await db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
        tables.set(table, new Set(rows.map(r => r.name)))
      }
      const columns = tables.get(table)!
      if (columns.has(column)) continue
      columns.add(column)
    }
    commands.push({ sql })
  }
  commands.push(
    { sql: "UPDATE lessons SET kind = 'video' WHERE kind = 'text' AND video_url != '' AND content = '' AND content_html = ''" },
    { sql: 'UPDATE plans SET display_order = sort WHERE display_order = 0 AND sort <> 0' },
    { sql: "UPDATE channels SET visibility = 'private' WHERE type = 'private' AND visibility = 'public' AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'fase16f_backfill')" },
    { sql: `INSERT OR IGNORE INTO follows (tenant_id, user_id, channel_id) SELECT m.tenant_id, m.user_id, c.id FROM memberships m
      JOIN channels c ON c.tenant_id = m.tenant_id WHERE c.archived_at = '' AND c.visibility <> 'secret'
      AND NOT EXISTS (SELECT 1 FROM app_meta WHERE key = 'fase16f_backfill')` },
    { sql: "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('fase16f_backfill', '1')" },
    { sql: "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)", params: [SCHEMA_VERSION] },
  )
  await db.batch(commands)
}
