import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { channelAccess, tenantForHost } from '../shared/access'
import { sessionSecret, parseSessionCookie } from '../shared/session'
import { videoEmbedUrl } from '../shared/embeds'
import { memoryDatabase } from './helpers'
import { handleRtUpgrade } from '../realtime/upgrade.mjs'
import { RealtimeRoom } from '../realtime/room.mjs'

const secret = 'regression-session-secret-at-least-32-characters'
function cookie(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

test('sessions reject public fallback, malformed identity and invalid expiration', () => {
  assert.throws(() => sessionSecret(''))
  assert.throws(() => sessionSecret('dev-only-cambiar-en-produccion'))
  assert.equal(sessionSecret(secret), secret)
  assert.ok(sessionSecret('', true).length >= 32)
  for (const payload of [{ uid: 1 }, { uid: 1, exp: 'tomorrow' }, { uid: -1, exp: Date.now() + 10000 }, { uid: 1, exp: Date.now() - 1 }, { uid: 1, exp: Date.now() + 10000, v: '0' }])
    assert.equal(parseSessionCookie(cookie(payload), secret), null)
  assert.equal(parseSessionCookie(cookie({ uid: 1, exp: Date.now() + 10000 }), secret)?.uid, 1)
  assert.equal(parseSessionCookie('x.y.z', secret), null)
})

test('embeds require an exact trusted host', () => {
  assert.equal(videoEmbedUrl('https://evil.test/youtube.com/embed/abcdef'), null)
  assert.equal(videoEmbedUrl('javascript:youtube.com/embed/abcdef'), null)
  assert.equal(videoEmbedUrl('https://youtu.be/abcdefghijk'), 'https://www.youtube.com/embed/abcdefghijk')
  assert.equal(videoEmbedUrl('https://vimeo.com/123456'), 'https://player.vimeo.com/video/123456')
})

test('HTTP and WebSocket policies use memberships, custom domains, grants and expiry', async () => {
  const { db, close } = await memoryDatabase()
  try {
    await db.prepare("INSERT INTO tenants(id,slug,name,created_at) VALUES(1,'first','First',''),(2,'second','Second','')").run()
    await db.prepare("INSERT INTO tenant_domains(tenant_id,domain,created_at) VALUES(2,'custom.example','')").run()
    await db.prepare("INSERT INTO users(id,name,slug,email,password_hash,created_at) VALUES(1,'Member','member','m@test.invalid','unused','')").run()
    await db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(2,1,'member','active')").run()
    await db.prepare("INSERT INTO channels(id,tenant_id,slug,name,type,visibility) VALUES(1,2,'secret','Secret','free','secret'),(2,2,'paid','Paid','paid','public')").run()
    const get = (sql: string, ...params: unknown[]) => db.prepare(sql).get(...params)
    assert.equal((await tenantForHost(get, 'CUSTOM.EXAMPLE')).id, 2)
    assert.equal(await tenantForHost(get, 'unknown.example'), null)
    const env = {
      NUXT_SESSION_SECRET: secret,
      DB: { prepare: (sql: string) => ({ bind: (...params: unknown[]) => ({ first: () => get(sql, ...params), run: () => db.prepare(sql).run(...params) }) }) },
      REALTIME: { idFromName: (name: string) => name, get: (room: string) => ({ fetch: async () => new Response(room) }) },
    }
    const req = (path: string) => new Request(`https://custom.example/api/rt/${path}`, { headers: { cookie: `cm_session=${cookie({ uid: 1, v: 0, exp: Date.now() + 60000 })}`, upgrade: 'websocket' } })
    assert.equal((await handleRtUpgrade(req('channel/secret'), env, {})).status, 403)
    await db.prepare("INSERT INTO channel_access(tenant_id,user_id,channel_id,created_at) VALUES(2,1,1,'')").run()
    const allowed = await handleRtUpgrade(req('channel/secret'), env, {})
    assert.equal(await allowed.text(), 'chan:2:1')
    await db.prepare("UPDATE channels SET archived_at = '2026-01-01' WHERE id = 1").run()
    assert.equal((await handleRtUpgrade(req('channel/secret'), env, {})).status, 403)
    await db.prepare("INSERT INTO plans(id,tenant_id,name,created_at) VALUES(1,2,'Plan','')").run()
    await db.prepare("INSERT INTO member_subscriptions(tenant_id,user_id,plan_id,status,source,current_period_end,created_at,updated_at) VALUES(2,1,1,'active','manual','2000-01-01','','')").run()
    assert.equal(await channelAccess(get, 1, 'member', await get('SELECT * FROM channels WHERE id=2')), false)
    assert.equal((await handleRtUpgrade(req('channel/paid'), env, {})).status, 403)
    await db.prepare("UPDATE member_subscriptions SET current_period_end = '2999-01-01'").run()
    assert.equal((await handleRtUpgrade(req('channel/paid'), env, {})).status, 200)
    for (const status of ['pending', 'declined', 'suspended']) {
      await db.prepare('UPDATE memberships SET status = ?').run(status)
      assert.equal((await handleRtUpgrade(req('me'), env, {})).status, 403)
    }
    await db.prepare("UPDATE memberships SET status = 'active'").run()
    let sent = false, closed = false
    const socket = { deserializeAttachment: () => ({ userId: 1, tenantId: 2, sessionVersion: 0, expiresAt: Date.now() + 60000, room: 'user:2:1' }), send: () => { sent = true }, close: () => { closed = true } }
    const room = new RealtimeRoom({ getWebSockets: () => [socket] }, env)
    await db.prepare("UPDATE memberships SET status = 'suspended'").run()
    await room.broadcast({ type: 'message', text: 'protected' })
    assert.equal(sent, false)
    assert.equal(closed, true)
  }
  finally { close() }
})
