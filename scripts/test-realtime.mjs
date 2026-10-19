// Prueba de tiempo real de la Fase 3 contra un servidor ya levantado
// (pensada para `npx wrangler dev` con D1 + Durable Objects locales).
//
// Uso:
//   npm run build && npx wrangler dev --port 8787   (en otra terminal)
//   node scripts/test-realtime.mjs [baseUrl]        (default http://127.0.0.1:8787)
//
// Verifica, con dos sesiones demo distintas y mensajes únicos (QA-RT-*):
//   1. Un visitante sin sesión es rechazado en el upgrade WebSocket.
//   2. Presencia: dos usuarios en la sala del canal se ven entre sí.
//   3. Chat: un mensaje enviado por REST llega en vivo a AMBOS sockets.
//   4. DM: un mensaje directo llega en vivo al destinatario conectado.
//   5. Notificación en vivo: comentar el post de otro empuja su sala
//      personal (`me`) sin esperar el polling de la campana.
// Los mensajes QA quedan en la base LOCAL usada para la prueba; con
// wrangler dev esa base es la de .wrangler (descartable). En el SQLite
// de `npm run dev` se pueden borrar por el prefijo QA-RT- del cuerpo.
import WebSocket from 'ws'

const base = process.argv[2] || 'http://127.0.0.1:8787'
const wsBase = base.replace(/^http/, 'ws')
const marker = `QA-RT-${Date.now()}`
let failures = 0

function report(cond, label, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`)
  if (!cond) failures++
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function login(email) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234' }),
  })
  const setCookie = res.headers.get('set-cookie') || ''
  if (!res.ok || !setCookie) throw new Error(`login falló para ${email} (HTTP ${res.status})`)
  return setCookie.split(';')[0]
}

async function api(cookie, path, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie, ...(init.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → HTTP ${res.status}: ${data.message || ''}`)
  return data
}

function connect(path, cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsBase + path, cookie ? { headers: { Cookie: cookie } } : {})
    const messages = []
    ws.on('message', (d) => { try { messages.push(JSON.parse(d.toString())) } catch { /* no JSON: se ignora */ } })
    ws.on('open', () => resolve({ ws, messages }))
    ws.on('error', err => reject(err))
    ws.on('unexpected-response', (_req, res) => reject(new Error(`upgrade rechazado con HTTP ${res.statusCode}`)))
  })
}

async function waitFor(fn, label, ms = 9000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = fn()
    if (v) return v
    await sleep(150)
  }
  throw new Error(`timeout esperando: ${label}`)
}

const sockets = []
try {
  // 1) Visitante sin sesión: el upgrade debe ser rechazado.
  let visitorRejected = false
  try { const v = await connect('/api/rt/channel/general'); sockets.push(v.ws) }
  catch { visitorRejected = true }
  report(visitorRejected, 'visitante sin sesión rechazado en el upgrade')

  const memberCookie = await login('member@demo.local')
  const adminCookie = await login('admin@demo.local')

  // 2) Presencia en la sala del canal general.
  const memberChan = await connect('/api/rt/channel/general', memberCookie); sockets.push(memberChan.ws)
  const adminChan = await connect('/api/rt/channel/general', adminCookie); sockets.push(adminChan.ws)
  const presence = await waitFor(
    () => adminChan.messages.find(m => m.type === 'presence' && m.users?.length >= 2),
    'presencia con 2 usuarios en la sala',
  ).catch(() => null)
  report(!!presence, 'presencia: la sala lista a los dos conectados',
    presence ? presence.users.map(u => u.slug).join(', ') : 'sin evento de presencia')

  // 3) Chat por REST → llega en vivo a ambos.
  await api(memberCookie, '/api/channels/general/chat', { method: 'POST', body: JSON.stringify({ body: `${marker} hola desde la prueba` }) })
  const chatHitMember = await waitFor(() => memberChan.messages.find(m => m.type === 'chat' && m.message?.body?.includes(marker)), 'chat en vivo (emisor)').catch(() => null)
  const chatHitAdmin = await waitFor(() => adminChan.messages.find(m => m.type === 'chat' && m.message?.body?.includes(marker)), 'chat en vivo (otro miembro)').catch(() => null)
  report(!!chatHitMember && !!chatHitAdmin, 'chat: el mensaje REST llega en vivo a ambos sockets')

  // 4) DM en vivo al destinatario.
  const adminDm = await connect('/api/rt/dm/marco-solis', adminCookie); sockets.push(adminDm.ws)
  await api(memberCookie, '/api/dms/valeria-rios', { method: 'POST', body: JSON.stringify({ body: `${marker} dm en vivo` }) })
  const dmHit = await waitFor(() => adminDm.messages.find(m => m.type === 'dm' && m.message?.body?.includes(marker)), 'DM en vivo').catch(() => null)
  report(!!dmHit, 'DM: el destinatario conectado lo recibe en vivo')

  // 5) Notificación en vivo en la sala personal.
  const adminMe = await connect('/api/rt/me', adminCookie); sockets.push(adminMe.ws)
  const feed = await api(memberCookie, '/api/feed')
  const welcome = (feed.posts || []).find(p => p.title?.includes('Bienvenidas'))
  if (!welcome) throw new Error('no se encontró el post de bienvenida en el feed')
  await api(memberCookie, `/api/posts/${welcome.id}/comments`, { method: 'POST', body: JSON.stringify({ body: `${marker} comentario que notifica` }) })
  const notifHit = await waitFor(() => adminMe.messages.find(m => m.type === 'notification'), 'notificación en vivo').catch(() => null)
  report(!!notifHit, 'notificación: la sala personal recibe el aviso en vivo', notifHit ? notifHit.title : '')
}
catch (err) {
  report(false, 'la prueba se interrumpió', err.message)
}
finally {
  for (const ws of sockets) { try { ws.close() } catch { /* nada */ } }
  await sleep(300)
}
console.log(failures === 0 ? '\nRESULTADO: todo PASS' : `\nRESULTADO: ${failures} fallo(s)`)
process.exit(failures === 0 ? 0 : 1)
