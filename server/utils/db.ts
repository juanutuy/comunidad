// Capa de datos asíncrona unificada.
//
// Interfaz única tipo `prepare(sql).get/all/run` (todo devuelve Promesas)
// con dos adaptadores por debajo:
//   - Cloudflare D1 (producción): si el request trae el binding
//     `event.context.cloudflare.env.DB`, se usa D1
//     (`prepare(sql).bind(...).first()/all()/run()`).
//   - better-sqlite3 (desarrollo local con `npm run dev` en Node):
//     mismo SQL, llamadas síncronas envueltas en la interfaz asíncrona.
//     El binario nativo se importa de forma perezosa SOLO en este camino:
//     en el Worker nunca se carga.
//
// Canonical schema: database/schema.ts. Production requires an explicit migration;
// request handlers check its version without changing schema or creating demo users.

export interface RunResult { changes: number, lastInsertRowId: number | null }

export interface DbStatement {
  // get/all devuelven `any` a propósito (como hacía better-sqlite3 sin
  // genéricos): cada handler castea al tipo de fila que espera.
  get: (...params: unknown[]) => Promise<any>
  all: (...params: unknown[]) => Promise<any[]>
  run: (...params: unknown[]) => Promise<RunResult>
}

export interface DbCommand { sql: string, params?: unknown[] }

export interface AsyncDb {
  batch: (commands: DbCommand[]) => Promise<RunResult[]>
  kind: 'd1' | 'sqlite'
  prepare: (sql: string) => DbStatement
  exec: (sql: string) => Promise<void>
}

// --- Tipos mínimos del binding D1 (estructurales; sin depender de
// @cloudflare/workers-types) ---
interface D1PreparedLike {
  bind: (...values: unknown[]) => D1PreparedLike
  first: () => Promise<Record<string, unknown> | null>
  all: () => Promise<{ results: Record<string, unknown>[] }>
  run: () => Promise<{ meta?: { last_row_id?: number, changes?: number } }>
}
interface D1DatabaseLike { prepare: (sql: string) => D1PreparedLike, batch: (statements: D1PreparedLike[]) => Promise<{ meta?: { last_row_id?: number, changes?: number } }[]> }

export { CREATE_SQL } from '../../database/schema'

async function initDb(db: AsyncDb): Promise<void> {
  if (import.meta.dev) {
    const { migrateDb } = await import('../../database/migrate')
    await migrateDb(db)
    const { seedIfEmpty, backfillLessonContent, backfillPlans } = await import('./seed')
    if (useRuntimeConfig().demoSeed) {
      await seedIfEmpty(db)
      await backfillLessonContent(db)
      await backfillPlans(db)
    }
    return
  }
  const { SCHEMA_VERSION } = await import('../../database/schema')
  let version
  try { version = await db.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get() }
  catch { /* missing schema is reported with actionable instructions below */ }
  if (version?.value !== SCHEMA_VERSION) throw new Error('Database migration required. Run npm run db:migrate before starting production.')
}

function splitSql(sql: string): string[] {
  return sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)
}

// --- Adaptador D1 ---
function wrapD1(d1: D1DatabaseLike): AsyncDb {
  return {
    kind: 'd1',
    async batch(commands) {
      const results = await d1.batch(commands.map(c => d1.prepare(c.sql).bind(...(c.params || []))))
      return results.map(r => ({ changes: r.meta?.changes ?? 0, lastInsertRowId: r.meta?.last_row_id ?? null }))
    },
    prepare(sql: string): DbStatement {
      return {
        async get(...params) {
          const row = await d1.prepare(sql).bind(...params).first()
          return row ?? undefined
        },
        async all(...params) {
          const res = await d1.prepare(sql).bind(...params).all()
          return res.results ?? []
        },
        async run(...params) {
          const res = await d1.prepare(sql).bind(...params).run()
          return { changes: res.meta?.changes ?? 0, lastInsertRowId: res.meta?.last_row_id ?? null }
        },
      }
    },
    async exec(sql: string) {
      for (const stmt of splitSql(sql)) await d1.prepare(stmt).run()
    },
  }
}

// --- Adaptador SQLite local (better-sqlite3, import perezoso) ---
async function createLocalDb(): Promise<AsyncDb> {
  const { join } = await import('node:path')
  const { openSQLite } = await import('../../database/local')
  const config = useRuntimeConfig()
  const { db, close } = openSQLite((config.dbPath as string) || join(process.cwd(), 'data', 'comunidad.db'))
  try { await initDb(db); return db }
  catch (error) { close(); throw error }
}

let _localInit: Promise<AsyncDb> | null = null
const _d1Init = new WeakMap<object, Promise<AsyncDb>>()

/**
 * Devuelve la base del request actual: D1 si el binding está presente
 * (Worker / wrangler dev), SQLite local en `npm run dev` de Node.
 * Inicializa esquema+seed una sola vez por base/proceso.
 * El evento se tipa como `any` a propósito: el binding D1 llega en
 * `event.context.cloudflare.env` (runtime de Nitro/Cloudflare), que los
 * tipos de H3 no declaran.
 */
export async function dbFor(event?: any): Promise<AsyncDb> {
  // El binding D1 puede venir por tres caminos según el tipo de request:
  // 1) event.context.cloudflare.env — requests HTTP reales (preset Nitro).
  // 2) event.context._platform.cloudflare.env — contexto de plataforma Nitro.
  // 3) globalThis.__env__ — lo setea el entry de Nitro/Cloudflare en cada
  //    fetch; es el ÚNICO que sobrevive a los subrequests internos del SSR
  //    (localFetch crea eventos nuevos sin contexto de plataforma).
  const d1 = (event?.context?.cloudflare?.env?.DB
    ?? event?.context?._platform?.cloudflare?.env?.DB
    ?? (globalThis as any).__env__?.DB) as D1DatabaseLike | undefined
  if (d1 && typeof d1.prepare === 'function') {
    let pending = _d1Init.get(d1 as object)
    if (!pending) {
      pending = (async () => {
        const db = wrapD1(d1)
        await initDb(db)
        return db
      })()
      _d1Init.set(d1 as object, pending)
    }
    try { return await pending }
    catch (error) { _d1Init.delete(d1 as object); throw error }
  }
  if (!_localInit) _localInit = createLocalDb()
  try { return await _localInit }
  catch (error) { _localInit = null; throw error }
}

export function slugify(input: string): string {
  return input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'item'
}

export function nowIso(): string {
  return new Date().toISOString()
}
