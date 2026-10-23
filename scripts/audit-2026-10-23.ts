// Security regression checks: each previously reported abuse must be blocked.
// Never point this script at an existing database or a remote environment.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { request, createServer } from 'node:http'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { openSQLite } from '../database/local'
import { migrateDb } from '../database/migrate'
import { seedIfEmpty } from '../server/utils/seed'

const mail: { to: string, text: string }[] = []
let failMail = false
const mailer = createServer((req, res) => {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => { mail.push(JSON.parse(body)); res.writeHead(failMail ? 500 : 200); res.end('{}') })
})
await new Promise<void>(resolve => mailer.listen(0, '127.0.0.1', resolve))
const mailPort = (mailer.address() as { port: number }).port
const temp = mkdtempSync(join(tmpdir(), 'comunidad-regression-'))
const path = join(temp, 'test.db')
const connection = openSQLite(path)
await migrateDb(connection.db)
await seedIfEmpty(connection.db)
connection.close()
const db = new Database(path)
const secret = randomBytes(32).toString('hex')
const webhookSecret = randomBytes(32).toString('hex')
const port = Number(process.env.TEST_PORT || 3107)
let logs = ''
const server = spawn(process.execPath, ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
  detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DB_PATH: path, NUXT_UPLOADS_PATH: join(temp, 'uploads'), NUXT_SESSION_SECRET: secret, NUXT_STRIPE_WEBHOOK_SECRET: webhookSecret, NUXT_DEMO_SEED: 'false', NUXT_CRON_SECRET: 'local-audit-cron', NUXT_EMAIL_PROVIDER_URL: `http://127.0.0.1:${mailPort}`, EMAIL_PROVIDER_URL: '', NUXT_EMAIL_PROVIDER_TOKEN: '', EMAIL_PROVIDER_TOKEN: '' },
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



  await test('N03: demo endpoint cannot grant paid or secret channel access', async () => {
    run('DELETE FROM channel_access WHERE user_id=? AND channel_id=?', memberId, paid.id)
    run('DELETE FROM member_subscriptions WHERE user_id=?', memberId)
    assert.equal((await member(`/api/channels/${paid.slug}`)).body.channel.hasAccess, false)
    assert.equal((await member(`/api/channels/${paid.slug}/access`, {})).status, 410)
    assert.equal((await member(`/api/channels/${paid.slug}`)).body.channel.hasAccess, false)
    assert.equal(one('SELECT id FROM channel_access WHERE channel_id=? AND user_id=?', paid.id, memberId), undefined)
  })
  const otherTenant = Number(run("INSERT INTO tenants(slug,name,created_at) VALUES('audit-other','Other',?)", now()).lastInsertRowid)
  run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'admin','active')", otherTenant, memberId)
  await test('N01: staff receives no login secret; owner delivery works and legacy tokens fail', async () => {
    const link = await admin(`/api/admin/members/${memberId}/access-link`, {})
    assert.equal(link.status, 200, link.text)
    assert.equal(link.body.url, undefined)
    assert.equal(link.body.token, undefined)
    const delivered = mail.at(-1)!
    assert.equal(delivered.to, 'member@demo.local')
    const token = delivered.text.match(/\/access\/(owner-[a-f0-9]+)/)![1]
    assert.ok(!link.text.includes(token))
    const owner = client()
    assert.equal((await owner('/api/auth/access', { token })).status, 200)
    assert.equal((await client()('/api/auth/access', { token })).status, 400)
    run('INSERT INTO access_links(tenant_id,user_id,token,expires_at,created_at) VALUES(?,?,?,?,?)', tenant, memberId, 'legacy-token', '2999-01-01', now())
    assert.equal((await client()('/api/auth/access', { token: 'legacy-token' })).status, 400)
    failMail = true
    const failed = await admin(`/api/admin/members/${memberId}/access-link`, {})
    assert.equal(failed.status, 502)
    const failedToken = mail.at(-1)!.text.match(/\/access\/(owner-[a-f0-9]+)/)![1]
    assert.equal((await client()('/api/auth/access', { token: failedToken })).status, 400)
    failMail = false
  })
  const unrelatedId = Number(run("INSERT INTO users(name,slug,email,password_hash,created_at,website) VALUES('Unrelated','audit-unrelated','unrelated@example.invalid','fixture',?,'https://private-example.invalid')", now()).lastInsertRowid)
  run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'member','active')", otherTenant, unrelatedId)
  await test('N05: profiles cannot cross tenant membership boundaries', async () => {
    assert.equal((await admin('/api/profiles/audit-unrelated')).status, 404)
    assert.equal((await member('/api/profiles/audit-unrelated', undefined, { host: 'audit-other.localhost' })).status, 200)
  })
  await test('N02: an unrelated global account cannot be deleted', async () => {
    const response = await admin(`/api/admin/members/${unrelatedId}/delete-account`, { content: 'anonymize', confirmation: 'ELIMINAR' })
    assert.equal(response.status, 404, response.text)
    assert.equal(one('SELECT name FROM users WHERE id=?', unrelatedId).name, 'Unrelated')
    assert.ok(one('SELECT id FROM memberships WHERE tenant_id=? AND user_id=?', otherTenant, unrelatedId))
  })
  const authorId = Number(run("INSERT INTO users(name,slug,email,password_hash,created_at,website) VALUES('Author','audit-author','author@example.invalid','fixture',?,'https://identifying.invalid')", now()).lastInsertRowid)
  for (const tid of [tenant, otherTenant]) run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'member','active')", tid, authorId)
  const channel = one("SELECT id FROM channels WHERE tenant_id=? AND type='free' LIMIT 1", tenant).id
  const postId = Number(run("INSERT INTO posts(tenant_id,channel_id,author_id,slug,title,body,body_html,created_at) VALUES(?,?,?,'audit-retain','Retain','Useful content','<p>Useful content</p>',?)", tenant, channel, authorId, now()).lastInsertRowid)
  const commentId = Number(run("INSERT INTO comments(tenant_id,post_id,author_id,body,created_at) VALUES(?,?,?,'Useful comment',?)", tenant, postId, authorId, now()).lastInsertRowid)
  const otherChannel = Number(run("INSERT INTO channels(tenant_id,slug,name,type) VALUES(?,'other','Other','free')", otherTenant).lastInsertRowid)
  const otherPost = Number(run("INSERT INTO posts(tenant_id,channel_id,author_id,slug,title,body,created_at) VALUES(?,?,?,'other','Other','Other tenant content',?)", otherTenant, otherChannel, authorId, now()).lastInsertRowid)
  const boundary = 'audit-files'
  const uploadBody = `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nfile\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="retained.txt"\r\nContent-Type: text/plain\r\n\r\nretained attachment\r\n--${boundary}--\r\n`
  const uploadOptions = { raw: uploadBody, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
  const uploaded = await admin('/api/uploads', undefined, uploadOptions)
  assert.equal(uploaded.status, 200, uploaded.text)
  run('UPDATE uploads SET user_id=? WHERE key=?', authorId, uploaded.body.key)
  run("UPDATE posts SET media_url=?,media_type='file' WHERE id=?", uploaded.body.url, postId)

  await test('N02/N04/N06: preserve content using an empty local identity; retain global identity and other tenant content', async () => {
    const original = one('SELECT * FROM users WHERE id=?', authorId)
    const response = await admin(`/api/admin/members/${authorId}/delete-account`, { content: 'anonymize', confirmation: 'ELIMINAR' })
    assert.equal(response.status, 200, response.text)
    const post = one('SELECT * FROM posts WHERE id=?', postId)
    assert.equal(post.body, 'Useful content')
    assert.equal(post.media_url, uploaded.body.url)
    assert.equal((await admin(uploaded.body.url)).status, 200)
    assert.equal(post.body_html, '<p>Useful content</p>')
    assert.notEqual(post.author_id, authorId)
    assert.equal(one('SELECT body FROM comments WHERE id=?', commentId).body, 'Useful comment')
    const tombstone = one('SELECT * FROM users WHERE id=?', post.author_id)
    assert.equal(tombstone.website, '')
    assert.equal(tombstone.bio, '')
    assert.equal(tombstone.name, 'Cuenta eliminada')
    assert.equal(one('SELECT id FROM memberships WHERE user_id=?', tombstone.id), undefined)
    assert.deepEqual(one('SELECT * FROM users WHERE id=?', authorId), original)
    assert.ok(one('SELECT id FROM memberships WHERE tenant_id=? AND user_id=?', otherTenant, authorId))
    assert.equal(one('SELECT author_id FROM posts WHERE id=?', otherPost).author_id, authorId)
    assert.equal((await admin('/api/profiles/audit-author')).status, 404)
  })
  await test('deletion policy removes only local authored content and rollback is atomic', async () => {
    run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'member','active')", tenant, authorId)
    const localId = Number(run("INSERT INTO posts(tenant_id,channel_id,author_id,slug,title,body,created_at) VALUES(?,?,?,'audit-delete-own','Delete','Local content',?)", tenant, channel, authorId, now()).lastInsertRowid)
    const deletedFile = await admin('/api/uploads', undefined, uploadOptions)
    run('UPDATE uploads SET user_id=? WHERE key=?', authorId, deletedFile.body.key)
    run("UPDATE posts SET media_url=?,media_type='file' WHERE id=?", deletedFile.body.url, localId)
    db.exec("CREATE TRIGGER fail_removal BEFORE DELETE ON memberships BEGIN SELECT RAISE(ABORT,'injected'); END;")
    const attempt = () => admin(`/api/admin/members/${authorId}/delete-account`, { content: 'delete', confirmation: 'ELIMINAR' })
    assert.equal((await attempt()).status, 500)
    assert.ok(one('SELECT id FROM posts WHERE id=?', localId))
    assert.equal((await admin(deletedFile.body.url)).status, 200)
    assert.ok(one('SELECT id FROM memberships WHERE tenant_id=? AND user_id=?', tenant, authorId))
    db.exec('DROP TRIGGER fail_removal')
    assert.equal((await attempt()).status, 200)
    assert.equal(one('SELECT id FROM posts WHERE id=?', localId), undefined)
    assert.equal(one('SELECT id FROM uploads WHERE key=?', deletedFile.body.key), undefined)
    assert.equal((await admin(deletedFile.body.url)).status, 404)
    assert.equal(one('SELECT body FROM posts WHERE id=?', otherPost).body, 'Other tenant content')
  })
  await test('N07: digest omits unauthorized channel titles and recipients with revoked membership', async () => {
    const secret = Number(run("INSERT INTO channels(tenant_id,slug,name,type,visibility) VALUES(?,'audit-secret','Secret name','free','secret')", tenant).lastInsertRowid)
    run("INSERT INTO posts(tenant_id,channel_id,author_id,slug,title,body,created_at) VALUES(?,?,?,'audit-secret','SECRET TITLE','secret',?)", tenant, secret, adminId, now())
    const uid = Number(run("INSERT INTO users(name,slug,email,password_hash,created_at) VALUES('Banned','audit-banned','banned@example.invalid','fixture',?)", now()).lastInsertRowid)
    run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'member','banned')", tenant, uid)
    const start = mail.length
    const response = await anon('/api/cron/digest', {}, { headers: { 'x-cron-secret': 'local-audit-cron' } })
    assert.equal(response.status, 200, response.text)
    const messages = mail.slice(start)
    assert.equal(messages.some(m => m.to === 'banned@example.invalid'), false)
    const memberMail = messages.find(m => m.to === 'member@demo.local')!
    assert.ok(memberMail)
    assert.ok(!memberMail.text.includes('SECRET TITLE'))
    assert.ok(!memberMail.text.includes('Secret name'))
    assert.ok(messages.find(m => m.to === 'admin@demo.local')!.text.includes('SECRET TITLE'))
  })

}
finally {
  if (server.pid) { try { process.kill(-server.pid, 'SIGTERM') } catch { /* already exited */ } }
  await exited
  await new Promise<void>(resolve => mailer.close(() => resolve()))
  db.close()
  if (process.exitCode) { writeFileSync('/tmp/comunidad-integration-failure.log', logs); console.error('Server diagnostics: /tmp/comunidad-integration-failure.log') }
  rmSync(temp, { recursive: true, force: true })
}
