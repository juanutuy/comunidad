import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes, createHmac } from 'node:crypto'
import WebSocket from 'ws'
import { memoryDatabase } from './helpers'
import { seedIfEmpty } from '../server/utils/seed'

const temp = mkdtempSync(join(tmpdir(), 'comunidad-worker-'))
const configPath = join(temp, 'wrangler.json')
const state = join(temp, 'state')
const secret = randomBytes(32).toString('hex')
const webhookSecret = randomBytes(32).toString('hex')
const port = Number(process.env.WORKER_TEST_PORT || 8788)
const base = `http://127.0.0.1:${port}`
const quote = (value: unknown) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`
const connection = await memoryDatabase()
await seedIfEmpty(connection.db)
await connection.db.prepare("INSERT INTO channels(id,tenant_id,slug,name,type,visibility) VALUES(100,1,'worker-secret','Secret','free','secret')").run()
await connection.db.prepare("INSERT INTO member_subscriptions(tenant_id,user_id,plan_id,status,source,current_period_end,created_at,updated_at) VALUES(1,2,1,'active','manual','2000-01-01','','')").run()
await connection.db.prepare("INSERT INTO uploads(tenant_id,user_id,key,created_at) VALUES(1,1,'posts/worker-fixture.txt','')").run()
await connection.db.prepare("UPDATE channels SET cover_url='/api/files/posts/worker-fixture.txt' WHERE id=1").run()
await connection.db.prepare("INSERT INTO library_items(tenant_id,title,kind,file_key,created_at) VALUES(1,'Worker media reference','doc','posts/worker-fixture.txt','')").run()
const tables = await connection.db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
const statements = tables.map(t => t.sql)
for (const table of tables) {
  const rows = await connection.db.prepare(`SELECT * FROM ${table.name}`).all()
  for (const row of rows) statements.push(`INSERT INTO ${table.name} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(quote).join(',')})`)
}
for (const index of await connection.db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all()) statements.push(index.sql)
connection.close()
const fixture = join(temp, 'fixture.sql')
writeFileSync(fixture, statements.join(';\n') + ';\n', { mode: 0o600 })
writeFileSync(configPath, JSON.stringify({ name: 'comunidad-regression', main: resolve('worker-entry.mjs'), compatibility_date: '2025-07-15', compatibility_flags: ['nodejs_compat'],
  assets: { directory: resolve('.output/public'), binding: 'ASSETS' }, d1_databases: [{ binding: 'DB', database_name: 'worker-test', database_id: '00000000-0000-0000-0000-000000000001' }],
  r2_buckets: [{ binding: 'FILES', bucket_name: 'worker-test' }], durable_objects: { bindings: [{ name: 'REALTIME', class_name: 'RealtimeRoom' }] },
  migrations: [{ tag: 'v1', new_sqlite_classes: ['RealtimeRoom'] }], vars: { NUXT_SESSION_SECRET: secret, NUXT_STRIPE_WEBHOOK_SECRET: webhookSecret },
}))
const cliArgs = ['wrangler', 'd1', 'execute', 'DB', '--config', configPath, '--local', '--persist-to', state]
const sql = (command: string) => {
  const result = JSON.parse(execFileSync('npx', [...cliArgs, '--json', '--command', command], { encoding: 'utf8' }))
  return result[0].results
}
let logs = ''
let child: ReturnType<typeof spawn> | undefined
let exited: Promise<unknown> | undefined
function ws(path: string, cookie: string): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const socket = new WebSocket(base.replace('http:', 'ws:') + path, { headers: { cookie } })
    socket.once('open', () => res(socket))
    socket.once('unexpected-response', (_, response) => { response.resume(); rej(Error(`HTTP ${response.statusCode}`)) })
    socket.once('error', rej)
  })
}
try {
  execFileSync('npx', [...cliArgs, '--file', fixture, '--yes'], { stdio: 'pipe' })
  child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', configPath, '--local', '--persist-to', state, '--port', String(port)], { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  exited = new Promise(r => child!.once('exit', r))
  child.stdout!.on('data', x => { logs += x })
  child.stderr!.on('data', x => { logs += x })
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(base + '/api/join-info')).status === 200) break } catch { /* starting */ }
    if (child.exitCode !== null || i === 159) throw Error('Worker did not start\n' + logs.slice(-3500))
    await new Promise(r => setTimeout(r, 250))
  }
  let cookie = ''
  await test('compiled Worker authenticates and reads D1 using the migrated schema', async () => {
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'member@demo.local', password: 'demo1234' }) })
    assert.equal(login.status, 200, await login.text())
    cookie = login.headers.get('set-cookie')!.split(';')[0]!
    const response = await fetch(base + '/api/feed', { headers: { cookie } })
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal((await response.json() as any).posts.length, 7)
  })
  await test('Worker redirects admin HTML before rendering for guests and non-staff', async () => {
    for (const path of ['/admin', '/admin/channels', '/admin/settings']) {
      const response = await fetch(base + path, { redirect: 'manual' })
      assert.equal(response.status, 302, path)
      assert.equal(response.headers.get('location'), '/login')
      assert.ok(!(await response.text()).includes('data-frame="admin"'))
    }
    const member = await fetch(base + '/admin', { redirect: 'manual', headers: { cookie } })
    assert.equal(member.status, 302)
    assert.equal(member.headers.get('location'), '/feeds')
  })
  await test('Worker media page handles existing uploads within D1 query limits', async () => {
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'demo1234' }) })
    assert.equal(login.status, 200)
    const adminCookie = login.headers.get('set-cookie')!.split(';')[0]!
    const response = await fetch(base + '/api/admin/media', { headers: { cookie: adminCookie } })
    assert.equal(response.status, 200, await response.clone().text())
    const media = await response.json() as any
    assert.equal(media.files.length, 1)
    assert.match(media.files[0].locations.join(' '), /canal/)
    assert.match(media.files[0].locations.join(' '), /biblioteca/)
  })
  await test('real Durable Object rejects secret channels and expired subscriptions', async () => {
    await assert.rejects(ws('/api/rt/channel/worker-secret', cookie), /HTTP 403/)
    const paid = sql("SELECT slug FROM channels WHERE type='paid' LIMIT 1")[0].slug
    await assert.rejects(ws('/api/rt/channel/' + paid, cookie), /HTTP 403/)
    sql("UPDATE member_subscriptions SET current_period_end='2999-01-01' WHERE user_id=2")
    const socket = await ws('/api/rt/channel/' + paid, cookie)
    socket.close()
  })
  await test('real open socket loses access after suspension', async () => {
    const socket = await ws('/api/rt/me', cookie)
    sql("UPDATE memberships SET status='suspended' WHERE tenant_id=1 AND user_id=2")
    await assert.rejects(ws('/api/rt/me', cookie), /HTTP 403/)
    const closed = new Promise<number>(resolve => socket.once('close', code => resolve(code)))
    socket.send(JSON.stringify({ type: 'ping' }))
    assert.equal(await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(Error('revoked socket stayed open')), 5000).unref())]), 1008)
    sql("UPDATE memberships SET status='active' WHERE tenant_id=1 AND user_id=2")
  })
  await test('D1 batch rolls back payment and event receipt on grant failure', async () => {
    sql("INSERT INTO payments(tenant_id,user_id,kind,item_id,amount_cents,currency,stripe_session_id,created_at,updated_at) SELECT 1,2,'channel',id,2200,'usd','cs_worker','','' FROM channels WHERE type='paid' LIMIT 1")
    sql("CREATE TRIGGER fail_grant BEFORE INSERT ON channel_access BEGIN SELECT RAISE(ABORT,'worker regression failure'); END")
    const payload = JSON.stringify({ id: 'evt_worker', created: Math.floor(Date.now() / 1000), type: 'checkout.session.completed', data: { object: { id: 'cs_worker', amount_total: 2200, currency: 'usd', payment_status: 'paid' } } })
    const stamp = Math.floor(Date.now() / 1000)
    const signature = `t=${stamp},v1=${createHmac('sha256', webhookSecret).update(`${stamp}.${payload}`).digest('hex')}`
    const send = () => fetch(base + '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload })
    assert.equal((await send()).status, 500)
    assert.equal(sql("SELECT status FROM payments WHERE stripe_session_id='cs_worker'")[0].status, 'pending')
    assert.equal(sql("SELECT id FROM stripe_events WHERE id='evt_worker'").length, 0)
    sql('DROP TRIGGER fail_grant')
    const retried = await send()
    assert.equal(retried.status, 200, await retried.text())
    assert.equal(sql("SELECT status FROM payments WHERE stripe_session_id='cs_worker'")[0].status, 'paid')
  })
  await test('D1 executes scoped anonymization without erasing retained content or global profile', async () => {
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@demo.local', password: 'demo1234' }) })
    const adminCookie = login.headers.get('set-cookie')!.split(';')[0]!
    sql("INSERT INTO users(id,name,slug,email,password_hash,created_at,website) VALUES(200,'Scoped','scoped','scoped@example.invalid','fixture','','https://owner.invalid')")
    sql("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(1,200,'member','active')")
    sql("INSERT INTO posts(tenant_id,channel_id,author_id,slug,title,body,body_html,created_at) VALUES(1,1,200,'scoped-retain','Scoped','Kept','<p>Kept</p>','')")
    const response = await fetch(base + '/api/admin/members/200/delete-account', { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ content: 'anonymize', confirmation: 'ELIMINAR' }) })
    assert.equal(response.status, 200, await response.text())
    const row = sql("SELECT body,author_id FROM posts WHERE slug='scoped-retain'")[0]
    assert.equal(row.body, 'Kept')
    assert.notEqual(row.author_id, 200)
    assert.equal(sql('SELECT website FROM users WHERE id=' + row.author_id)[0].website, '')
    assert.equal(sql('SELECT website FROM users WHERE id=200')[0].website, 'https://owner.invalid')
    assert.equal(sql('SELECT id FROM memberships WHERE tenant_id=1 AND user_id=200').length, 0)
  })

}
finally {
  if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch { /* exited */ } }
  await exited
  if (process.exitCode) { writeFileSync('/tmp/comunidad-worker-failure.log', logs); console.error('Worker diagnostics: /tmp/comunidad-worker-failure.log') }
  rmSync(temp, { recursive: true, force: true })
}
