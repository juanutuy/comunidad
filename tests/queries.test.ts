import test from 'node:test'
import assert from 'node:assert/strict'
import { memoryDatabase } from './helpers'
import { postMetadata } from '../server/utils/postMetadata'
import { findFilesLocations } from '../server/utils/media'
import type { H3Event } from 'h3'

test('post metadata uses bounded query count for fifty posts', async () => {
  const { db, close } = await memoryDatabase()
  let queries = 0
  try {
    const d1 = { prepare: (sql: string) => ({ bind: (...params: unknown[]) => ({
      first: async () => { queries++; return await db.prepare(sql).get(...params) || null },
      all: async () => { queries++; return { results: await db.prepare(sql).all(...params) } },
      run: async () => { queries++; const result = await db.prepare(sql).run(...params); return { meta: { changes: result.changes, last_row_id: result.lastInsertRowId } } },
    }) }) }
    const event = { context: { cloudflare: { env: { DB: d1 } } } } as unknown as H3Event
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, kind: 'post' }))
    const result = await postMetadata(event, rows, 1)
    assert.equal(result.size, 50)
    assert.ok(queries <= 5, `expected <=5 queries, received ${queries}`)
  }
  finally { close() }
})

test('media locations resolve a whole page in three bounded queries', async () => {
  const { db, close } = await memoryDatabase()
  let queries = 0
  try {
    for (let id = 1; id <= 50; id++) await db.prepare("INSERT INTO uploads(id,tenant_id,user_id,key,created_at) VALUES(?,1,1,?,'')").run(id, `posts/${id}.txt`)
    const uploads = await db.prepare('SELECT * FROM uploads').all()
    const wrapped = { ...db, prepare: (sql: string) => { queries++; return db.prepare(sql) } }
    const result = await findFilesLocations(wrapped, 1, uploads)
    assert.equal(result.size, 50)
    assert.equal(queries, 3)
  }
  finally { close() }
})
