import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { openSQLite } from '../database/local'
import { migrateDb } from '../database/migrate'
import { seedIfEmpty } from '../server/utils/seed'

const temp = mkdtempSync(join(tmpdir(), 'comunidad-regression-'))
const path = join(temp, 'test.db')
const connection = openSQLite(path)
await migrateDb(connection.db)
await seedIfEmpty(connection.db)
connection.close()
const db = new Database(path)
const secret = randomBytes(32).toString('hex')
const webhookSecret = randomBytes(32).toString('hex')
const port = Number(process.env.TEST_PORT || 3100)
let logs = ''
const server = spawn(process.execPath, ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
  detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DB_PATH: path, NUXT_UPLOADS_PATH: join(temp, 'uploads'), NUXT_SESSION_SECRET: secret, NUXT_STRIPE_WEBHOOK_SECRET: webhookSecret, NUXT_DEMO_SEED: 'false' },
})
const exited = new Promise(resolve => server.once('exit', resolve))
server.stdout.on('data', chunk => { logs += chunk })
server.stderr.on('data', chunk => { logs += chunk })
interface Reply { status: number, body: any, text: string, headers: Record<string, any> }
function client() {
  let cookie = ''
  return async (path: string, body?: unknown, options: { host?: string, method?: string, headers?: Record<string, string>, raw?: string } = {}): Promise<Reply> => new Promise((resolve, reject) => {
    const data = options.raw ?? (body === undefined ? undefined : JSON.stringify(body))
    const req = request({ hostname: '127.0.0.1', port, path, method: options.method || (data === undefined ? 'GET' : 'POST'), headers: {
      host: options.host || 'localhost', ...(data === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(data)) }), ...(cookie ? { cookie } : {}), ...options.headers,
    } }, res => {
      const session = res.headers['set-cookie']?.find(s => s.startsWith('cm_session='))
      if (session) cookie = session.split(';')[0]!
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => { let parsed; try { parsed = JSON.parse(text) } catch { parsed = null }; resolve({ status: res.statusCode!, body: parsed, text, headers: res.headers }) })
    })
    req.on('error', reject)
    req.end(data)
  })
}
const admin = client(), member = client(), anon = client()
const one = (sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as any
const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params)
const tenant = one('SELECT id FROM tenants ORDER BY id LIMIT 1').id
const memberId = one("SELECT id FROM users WHERE email='member@demo.local'").id
const adminId = one("SELECT id FROM users WHERE email='admin@demo.local'").id
const now = () => new Date().toISOString()
const paid = one("SELECT * FROM channels WHERE tenant_id=? AND type='paid' LIMIT 1", tenant)
const sign = (payload: string) => {
  const stamp = String(Math.floor(Date.now() / 1000))
  return `t=${stamp},v1=${createHmac('sha256', webhookSecret).update(`${stamp}.${payload}`).digest('hex')}`
}

try {
  for (let i = 0; i < 100; i++) {
    try { if ((await anon('/api/join-info')).status === 200) break } catch { /* server starting */ }
    if (server.exitCode !== null || i === 99) throw Error('Server startup failed\n' + logs.slice(-4000))
    await new Promise(r => setTimeout(r, 250))
  }
  assert.equal((await admin('/api/auth/login', { email: 'admin@demo.local', password: 'demo1234' })).status, 200)
  assert.equal((await member('/api/auth/login', { email: 'member@demo.local', password: 'demo1234' })).status, 200)

  await test('localized tenant branding is shared by tenant API, SSR and install manifest', async () => {
    const original = one('SELECT name,name_en,icon_url,favicon_url FROM tenants WHERE id=?', tenant)
    run("UPDATE tenants SET name='ServGT Comunidad',name_en='ServGT Community',icon_url='/branding/servgt/symbol.svg',favicon_url='/branding/servgt/favicon.ico' WHERE id=?", tenant)
    try {
      const spanish = await anon('/api/tenant', undefined, { headers: { cookie: 'cm_locale=es' } })
      const english = await anon('/api/tenant', undefined, { headers: { cookie: 'cm_locale=en' } })
      assert.equal(spanish.body.tenant.name, 'ServGT Comunidad')
      assert.equal(english.body.tenant.name, 'ServGT Community')
      assert.equal(english.body.tenant.nameEs, 'ServGT Comunidad')
      const page = await anon('/login', undefined, { headers: { cookie: 'cm_locale=en' } })
      assert.ok(page.text.includes('ServGT Community'))
      assert.ok(page.text.includes('/branding/servgt/symbol.svg'))
      const manifest = await anon('/api/manifest?locale=en')
      assert.equal(manifest.body.name, 'ServGT Community')
      assert.ok(manifest.body.icons.some((i: any) => i.src === '/branding/servgt/icon-512.png'))
    }
    finally { run('UPDATE tenants SET name=?,name_en=?,icon_url=?,favicon_url=? WHERE id=?', original.name, original.name_en, original.icon_url, original.favicon_url, tenant) }
  })
  await test('direct guest profile requests render an access prompt instead of an empty page', async () => {
    const slug = one('SELECT slug FROM users WHERE id=?', adminId).slug
    const response = await anon(`/profile/${slug}`)
    assert.equal(response.status, 200)
    assert.ok(response.text.includes('Inicia sesión para ver el perfil'))
    assert.ok(!response.text.includes('data-frame="admin"'))
  })
  await test('admin HTML redirects guests before rendering any console markup', async () => {
    for (const path of ['/admin', '/admin/channels', '/admin/members', '/admin/settings']) {
      const response = await anon(path)
      assert.equal(response.status, 302, `${path}: ${response.text.slice(0, 200)}`)
      assert.equal(response.headers.location, '/login')
      assert.ok(!response.text.includes('data-frame="admin"'))
      assert.ok(!response.text.includes('Iniciá sesión con una cuenta administradora'))
    }
    const response = await member('/admin')
    assert.equal(response.status, 302)
    assert.equal(response.headers.location, '/feeds')
    const allowed = await admin('/admin')
    assert.equal(allowed.status, 200, allowed.text.slice(0, 200))
    assert.ok(allowed.text.includes('data-frame="admin"'))
  })
  await test('admin SSR checks the requested tenant rather than the default tenant', async () => {
    const tid = Number(run("INSERT INTO tenants(slug,name,created_at) VALUES('audit-ssr','SSR Community',?)", now()).lastInsertRowid)
    run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'member','active')", tid, adminId)
    const response = await admin('/admin', undefined, { host: 'audit-ssr.localhost' })
    assert.equal(response.status, 302, response.text.slice(0, 200))
    assert.equal(response.headers.location, '/feeds')
    assert.ok(!response.text.includes('data-frame="admin"'))
  })
  await test('closed communities cannot be joined by login or an existing cookie', async () => {
    const tid = Number(run("INSERT INTO tenants(slug,name,created_at,anyone_can_register,join_approval) VALUES('audit-closed','Closed',?,0,1)", now()).lastInsertRowid)
    const host = 'audit-closed.localhost'
    assert.equal((await anon('/api/auth/login', { email: 'member@demo.local', password: 'demo1234' }, { host })).status, 403)
    assert.equal(one('SELECT id FROM memberships WHERE tenant_id=? AND user_id=?', tid, memberId), undefined)
    assert.equal((await member('/api/feed', undefined, { host })).status, 403)
  })
  await test('reapplication verifies ownership and preserves global identity', async () => {
    const tid = Number(run("INSERT INTO tenants(slug,name,created_at,join_approval) VALUES('audit-reapply','Reapply',?,1)", now()).lastInsertRowid)
    run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'member','declined')", tid, memberId)
    const original = one('SELECT password_hash,name,token_version FROM users WHERE id=?', memberId)
    const host = 'audit-reapply.localhost'
    assert.equal((await anon('/api/auth/register', { name: 'Attacker', email: 'member@demo.local', password: 'AttackerPassword' }, { host })).status, 409)
    assert.deepEqual(one('SELECT password_hash,name,token_version FROM users WHERE id=?', memberId), original)
    assert.equal((await anon('/api/auth/register', { name: 'Changed', email: 'member@demo.local', password: 'demo1234' }, { host })).status, 200)
    assert.deepEqual(one('SELECT password_hash,name,token_version FROM users WHERE id=?', memberId), original)
    assert.equal(one('SELECT status FROM memberships WHERE tenant_id=? AND user_id=?', tid, memberId).status, 'pending')
  })
  await test('malformed requests and cross-origin writes fail predictably', async () => {
    assert.equal((await anon('/api/auth/login', { email: 42, password: 'x' })).status, 400)
    assert.equal((await anon('/api/auth/register', [])).status, 400)
    assert.equal((await admin('/api/posts', { title: 'Title' }, { headers: { origin: 'https://attacker.invalid' } })).status, 403)
    assert.equal((await admin('/api/admin/channels/1', undefined, { method: 'DELETE', headers: { origin: 'https://attacker.localhost' } })).status, 403)
    assert.ok(one('SELECT id FROM channels WHERE id=1'), 'cross-origin DELETE must preserve the channel')
  })
  const boundary = 'audit-boundary'
  const uploadBody = `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nfile\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audit.txt"\r\nContent-Type: text/plain\r\n\r\nprotected audit fixture\r\n--${boundary}--\r\n`
  const uploadOptions = { raw: uploadBody, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
  await test('restricted members cannot upload or edit posts', async () => {
    run("UPDATE memberships SET status='restricted' WHERE tenant_id=? AND user_id=?", tenant, memberId)
    try {
      assert.equal((await member('/api/uploads', undefined, uploadOptions)).status, 403)
      const post = one('SELECT id FROM posts WHERE author_id=? LIMIT 1', memberId)
      assert.equal((await member(`/api/posts/${post.id}`, { title: 'Changed', body: 'Changed' }, { method: 'PUT' })).status, 403)
    }
    finally { run("UPDATE memberships SET status='active' WHERE tenant_id=? AND user_id=?", tenant, memberId) }
  })
  await test('expired subscriptions lose access; current subscribers can use library', async () => {
    const plan = one('SELECT id FROM plans WHERE tenant_id=? LIMIT 1', tenant)
    run("INSERT INTO member_subscriptions(tenant_id,user_id,plan_id,status,source,current_period_end,created_at,updated_at) VALUES(?,?,?,'active','manual','2000-01-01',?,?)", tenant, memberId, plan.id, now(), now())
    assert.equal((await member(`/api/channels/${paid.slug}`)).body.channel.hasAccess, false)
    run("UPDATE member_subscriptions SET current_period_end='2999-01-01' WHERE user_id=?", memberId)
    assert.equal((await member(`/api/channels/${paid.slug}`)).body.channel.hasAccess, true)
    run("UPDATE library_items SET file_key='library/fixture.txt' WHERE tenant_id=? AND locked=1", tenant)
    const library = await member('/api/library')
    assert.ok(library.body.items.filter((i: any) => i.locked).every((i: any) => i.canDownload))
    run('DELETE FROM member_subscriptions WHERE user_id=?', memberId)
  })
  let uploaded: { key: string, url: string }
  await test('private attachments require current resource access and are not publicly cached', async () => {
    const upload = await admin('/api/uploads', undefined, uploadOptions)
    assert.equal(upload.status, 200, upload.text)
    uploaded = upload.body
    const post = one('SELECT id FROM posts WHERE channel_id=? LIMIT 1', paid.id)
    run("UPDATE posts SET media_type='file',media_url=? WHERE id=?", uploaded.url, post.id)
    assert.notEqual((await client()(uploaded.url)).status, 200)
    assert.equal((await member(uploaded.url)).status, 404)
    const file = await admin(uploaded.url)
    assert.equal(file.status, 200)
    assert.equal(file.headers['cache-control'], 'private, no-store')
    assert.ok(file.text.includes('protected audit fixture'))
  })
  await test('media locations include comments, channels and lesson references', async () => {
    const free = one("SELECT * FROM channels WHERE tenant_id=? AND type='free' LIMIT 1", tenant)
    run('UPDATE channels SET cover_url=? WHERE id=?', uploaded.url, free.id)
    const post = one('SELECT id FROM posts WHERE channel_id=? LIMIT 1', free.id)
    run("INSERT INTO comments(tenant_id,post_id,author_id,body,media_type,media_url,created_at) VALUES(?,?,?,'Fixture','file',?,?)", tenant, post.id, adminId, uploaded.url, now())
    const lesson = one('SELECT id FROM lessons LIMIT 1')
    run('UPDATE lessons SET file_url=? WHERE id=?', uploaded.url, lesson.id)
    const response = await admin('/api/admin/media')
    assert.equal(response.status, 200, response.text)
    const locations = response.body.files.find((f: any) => f.key === uploaded.key).locations.join(' ')
    assert.match(locations, /Comentario/)
    assert.match(locations, /canal/)
    assert.match(locations, /lección/)
  })
  await test('feed applies visibility before LIMIT and supports subsequent pages', async () => {
    const cid = Number(run("INSERT INTO channels(tenant_id,slug,name,type,visibility) VALUES(?,'audit-secret','Secret','free','secret')", tenant).lastInsertRowid)
    const insert = db.prepare("INSERT INTO posts(tenant_id,channel_id,author_id,slug,title,body,created_at) VALUES(?,?,?,?,'Fixture','Fixture',?)")
    for (let i = 0; i < 55; i++) insert.run(tenant, cid, adminId, `fixture-${i}`, new Date(Date.now() + i * 1000).toISOString())
    const feed = await member('/api/feed?limit=2')
    assert.equal(feed.status, 200, feed.text)
    assert.equal(feed.body.posts.length, 2)
    assert.ok(feed.body.posts.every((p: any) => p.channel.slug !== 'audit-secret'))
    assert.equal(feed.body.nextOffset, 2)
    const second = await member('/api/feed?limit=2&offset=2')
    assert.ok(second.body.posts.every((p: any) => !feed.body.posts.find((a: any) => a.id === p.id)))
  })
  await test('channel deletion removes comment reactions, polls and chat', async () => {
    const cid = Number(run("INSERT INTO channels(tenant_id,slug,name,type) VALUES(?,'audit-delete','Delete','free')", tenant).lastInsertRowid)
    const pid = Number(run("INSERT INTO posts(tenant_id,channel_id,author_id,slug,title,body,created_at) VALUES(?,?,?,'audit','Audit','Audit',?)", tenant, cid, adminId, now()).lastInsertRowid)
    const cm = Number(run("INSERT INTO comments(tenant_id,post_id,author_id,body,created_at) VALUES(?,?,?,'Fixture',?)", tenant, pid, adminId, now()).lastInsertRowid)
    run("INSERT INTO comment_reactions(tenant_id,comment_id,user_id,type,created_at) VALUES(?,?,?,'👍',?)", tenant, cm, memberId, now())
    const option = Number(run("INSERT INTO poll_options(tenant_id,post_id,label) VALUES(?,?,'Yes')", tenant, pid).lastInsertRowid)
    run('INSERT INTO poll_votes(tenant_id,post_id,option_id,user_id,created_at) VALUES(?,?,?,?,?)', tenant, pid, option, memberId, now())
    run("INSERT INTO chat_messages(tenant_id,channel_id,author_id,body,created_at) VALUES(?,?,?,'Message',?)", tenant, cid, memberId, now())
    const response = await admin(`/api/admin/channels/${cid}`, undefined, { method: 'DELETE' })
    assert.equal(response.status, 200, response.text)
    for (const [table, column, id] of [['comment_reactions', 'comment_id', cm], ['poll_options', 'post_id', pid], ['poll_votes', 'post_id', pid], ['chat_messages', 'channel_id', cid]] as const)
      assert.equal(one(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`, id).n, 0)
  })
  await test('webhook failures rollback, then retry grants exactly once', async () => {
    const pid = Number(run("INSERT INTO payments(tenant_id,user_id,kind,item_id,amount_cents,currency,stripe_session_id,created_at,updated_at) VALUES(?,?,'channel',?,2200,'usd','cs_audit',?,?)", tenant, memberId, paid.id, now(), now()).lastInsertRowid)
    const event = { id: 'evt_audit', created: Math.floor(Date.now() / 1000), type: 'checkout.session.completed', data: { object: { id: 'cs_audit', payment_status: 'paid', amount_total: 2200, currency: 'usd' } } }
    const send = async (evt = event) => { const raw = JSON.stringify(evt); return anon('/api/stripe/webhook', undefined, { raw, headers: { 'stripe-signature': sign(raw) } }) }
    db.exec("CREATE TRIGGER fail_grant BEFORE INSERT ON channel_access BEGIN SELECT RAISE(ABORT,'injected grant failure'); END;")
    assert.equal((await send()).status, 500)
    assert.equal(one('SELECT status FROM payments WHERE id=?', pid).status, 'pending')
    assert.equal(one("SELECT id FROM stripe_events WHERE id='evt_audit'"), undefined)
    db.exec('DROP TRIGGER fail_grant')
    assert.equal((await send()).status, 200)
    assert.equal(one('SELECT status FROM payments WHERE id=?', pid).status, 'paid')
    assert.equal((await send()).body.duplicate, true)
    assert.equal(one('SELECT COUNT(*) n FROM channel_access WHERE tenant_id=? AND user_id=? AND channel_id=?', tenant, memberId, paid.id).n, 1)
    const missing = { ...event, id: 'evt_missing', data: { object: { ...event.data.object, id: 'cs_missing' } } }
    assert.equal((await send(missing)).status, 503)
    assert.equal(one("SELECT id FROM stripe_events WHERE id='evt_missing'"), undefined)
  })
  await test('manual approval failure remains retryable and grant is atomic', async () => {
    run('DELETE FROM channel_access WHERE tenant_id=? AND user_id=? AND channel_id=?', tenant, memberId, paid.id)
    const pid = Number(run("INSERT INTO payments(tenant_id,user_id,kind,item_id,gateway,created_at,updated_at) VALUES(?,?,'channel',?,'manual',?,?)", tenant, memberId, paid.id, now(), now()).lastInsertRowid)
    db.exec("CREATE TRIGGER fail_grant BEFORE INSERT ON channel_access BEGIN SELECT RAISE(ABORT,'injected grant failure'); END;")
    assert.equal((await admin(`/api/admin/earnings/${pid}/approve`, {})).status, 500)
    assert.equal(one('SELECT status FROM payments WHERE id=?', pid).status, 'pending')
    db.exec('DROP TRIGGER fail_grant')
    assert.equal((await admin(`/api/admin/earnings/${pid}/approve`, {})).status, 200)
  })
  await test('access links are consumed once under concurrent requests', async () => {
    run('INSERT INTO access_links(tenant_id,user_id,token,expires_at,created_at) VALUES(?,?,?,?,?)', tenant, memberId, 'owner-aabbccddeeff', new Date(Date.now() + 60000).toISOString(), now())
    const responses = await Promise.all(Array.from({ length: 6 }, () => client()('/api/auth/access', { token: 'owner-aabbccddeeff' })))
    assert.equal(responses.filter(r => r.status === 200).length, 1)
  })
  await test('login attempts are limited', async () => {
    let response: Reply | undefined
    for (let i = 0; i < 22; i++) response = await client()('/api/auth/login', { email: 'rate-limit@example.invalid', password: 'incorrect' })
    assert.equal(response!.status, 429)
  })
}
finally {
  if (server.pid) { try { process.kill(-server.pid, 'SIGTERM') } catch { /* already exited */ } }
  await exited
  db.close()
  if (process.exitCode) { writeFileSync('/tmp/comunidad-integration-failure.log', logs); console.error('Server diagnostics: /tmp/comunidad-integration-failure.log') }
  rmSync(temp, { recursive: true, force: true })
}
