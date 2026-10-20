// Verificación local de la Fase 16-G (comentarios y reacciones
// como el original): catálogo de 21 emojis con UNA reacción por
// usuario (migración legada like/love/fire/clap → emoji con
// colapso de filas múltiples), reacciones en comentarios con su
// punto 'comment_reaction', hilos de un nivel (responder a una
// respuesta cuelga de la raíz), adjuntos en comentarios, cascada
// al borrar, allow_comments bloqueando también respuestas, la
// tarjeta y el detalle compartiendo el componente de comentarios
// y paridad de claves i18n intacta.
// Corre contra wrangler dev (D1 local). CREA datos de prueba y los
// BORRA al final (la semilla local queda intacta: 4 usuarios,
// 7 posts, 5 canales).
//   node scripts/test-fase16g.mjs http://127.0.0.1:8787
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || 'http://127.0.0.1:8787'
let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}
function sql(command) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'comunidad-db', '--local', '--json', '--command', command], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const parsed = JSON.parse(out.slice(out.indexOf('[')))
  return parsed[0]?.results || []
}
function sqlVal(command) {
  const rows = sql(command)
  return rows[0] ? Object.values(rows[0])[0] : undefined
}
async function client() {
  const jar = new Map()
  return {
    async req(path, opts = {}) {
      const headers = { ...(opts.headers || {}) }
      if (opts.body !== undefined && !opts.raw) headers['content-type'] = 'application/json'
      const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
      if (cookie) headers.cookie = cookie
      const res = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.raw ? opts.body : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), redirect: 'manual' })
      for (const sc of res.headers.getSetCookie?.() || []) {
        const [pair] = sc.split(';')
        const i = pair.indexOf('=')
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
      }
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* html */ }
      return { status: res.status, text, json }
    },
    async login(email, password) {
      const r = await this.req('/api/auth/login', { method: 'POST', body: { email, password } })
      if (r.status !== 200) throw new Error(`login ${email} → ${r.status}`)
      return r.json.user
    },
  }
}

// ---------- 0. Migración legada: las sentencias EXACTAS de db.ts ----------
const dbSource = readFileSync(join(process.cwd(), 'server/utils/db.ts'), 'utf8')
const migrationSql = [...dbSource.matchAll(/`((?:UPDATE reactions SET type|DELETE FROM reactions|DROP INDEX IF EXISTS reactions_unique|CREATE UNIQUE INDEX reactions_unique)[^`]*)`/g)].map(m => m[1])
check('db.ts trae las 7 sentencias de migración de reacciones', migrationSql.length === 7, `${migrationSql.length}`)
{
  const Database = (await import('better-sqlite3')).default
  const dir = mkdtempSync(join(tmpdir(), 'fase16g-'))
  const legacy = new Database(join(dir, 'legacy.db'))
  legacy.exec(`CREATE TABLE reactions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, type TEXT NOT NULL);
    CREATE UNIQUE INDEX reactions_unique ON reactions (post_id, user_id, type);`)
  const ins = legacy.prepare('INSERT INTO reactions (tenant_id, post_id, user_id, type) VALUES (1, ?, ?, ?)')
  ins.run(1, 2, 'love'); ins.run(1, 2, 'fire') // el mismo usuario con DOS: queda la reciente (fire → 🔥)
  ins.run(1, 3, 'like'); ins.run(1, 3, 'love') // idem: queda love → ❤️
  ins.run(1, 4, 'clap')
  ins.run(2, 2, 'like')
  for (const stmt of migrationSql) legacy.exec(stmt)
  const rows = legacy.prepare('SELECT post_id, user_id, type FROM reactions ORDER BY post_id, user_id').all()
  check('migración: 6 filas legadas colapsan a 4 (una por usuario y post)',
    rows.length === 4, JSON.stringify(rows))
  const kept = Object.fromEntries(rows.map(r => [`${r.post_id}:${r.user_id}`, r.type]))
  check('migración: mapeo like→👍 love→❤️ fire→🔥 clap→👏',
    kept['1:2'] === '🔥' && kept['1:3'] === '❤️' && kept['1:4'] === '👏' && kept['2:2'] === '👍', JSON.stringify(kept))
  let dupFailed = false
  try { ins.run(1, 2, '👍') } catch { dupFailed = true }
  check('migración: el índice único nuevo es (post_id, user_id)', dupFailed)
  legacy.close()
}

// ---------- Sesiones y base ----------
const admin = await client(); const member = await client(); const lucia = await client(); const diego = await client()
await admin.login('admin@demo.local', 'demo1234')
const meMember = await member.login('member@demo.local', 'demo1234')
await lucia.login('lucia@demo.local', 'demo1234')
await diego.login('diego@demo.local', 'demo1234')
check('base: semilla limpia (4 usuarios, 7 posts, 5 canales)',
  sqlVal('SELECT COUNT(*) FROM users') === 4 && sqlVal('SELECT COUNT(*) FROM posts') === 7 && sqlVal('SELECT COUNT(*) FROM channels') === 5,
  `${sqlVal('SELECT COUNT(*) FROM users')}u/${sqlVal('SELECT COUNT(*) FROM posts')}p/${sqlVal('SELECT COUNT(*) FROM channels')}c`)
check('base: reacciones locales ya son emojis (sin palabras legadas)',
  sqlVal("SELECT COUNT(*) FROM reactions WHERE type IN ('love','like','fire','clap')") === 0)
check('base: índice único de reacciones es (post_id, user_id)',
  JSON.stringify(sql("SELECT sql FROM sqlite_master WHERE type='index' AND name='reactions_unique'")[0]?.sql || '').includes('(post_id, user_id)'))
check('base: comments tiene parent_id y media_*; existe comment_reactions',
  sql("SELECT name FROM pragma_table_info('comments')").some(r => r.name === 'parent_id')
  && sql("SELECT name FROM pragma_table_info('comments')").some(r => r.name === 'media_url')
  && sqlVal("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='comment_reactions'") === 1)

const feed = await member.req('/api/feed')
const welcome = feed.json.posts.find(p => p.slug === 'bienvenida-a-la-comunidad')
const video = feed.json.posts.find(p => p.slug === 'asi-grabe-mi-primer-video')
// Post de anuncios: autor admin y SIN reacciones semilla — el
// lienzo limpio para el ciclo crear/reemplazar/quitar de Diego
// (en bienvenida Diego ya trae su 👏 de la semilla).
const anuncios = feed.json.posts.find(p => p.slug === 'calendario-de-octubre')
check('serializador: conteos por emoji, top y total (bienvenida ❤️2 👏1)',
  welcome.reactions['❤️'] === 2 && welcome.reactions['👏'] === 1 && welcome.reactionTotal === 3 && welcome.reactionTop[0] === '❤️' && welcome.myReaction === '❤️',
  JSON.stringify(welcome.reactions))

async function leaderboardPoints(c, slugName) {
  const lb = await c.req('/api/leaderboard')
  return lb.json.ranking.find(r => r.slug === slugName)?.points
}

// ---------- 1. Reacciones de post: catálogo y semántica única ----------
const bad = await member.req(`/api/posts/${video.id}/reactions`, { method: 'POST', body: { type: '🦄' } })
check('emoji fuera de catálogo = 400', bad.status === 400, `${bad.status}`)
const badWord = await member.req(`/api/posts/${video.id}/reactions`, { method: 'POST', body: { type: 'love' } })
check('la palabra legada ya no es un tipo válido = 400', badWord.status === 400, `${badWord.status}`)

const adminPoints0 = await leaderboardPoints(admin, 'valeria-rios')
const r1 = await diego.req(`/api/posts/${anuncios.id}/reactions`, { method: 'POST', body: { type: '🚀' } })
check('crear reacción: myReaction y total +1', r1.json.myReaction === '🚀' && r1.json.reactionTotal === 1, JSON.stringify(r1.json))
const adminPoints1 = await leaderboardPoints(admin, 'valeria-rios')
check('crear reacción suma reaction_received (2) al autor', adminPoints1 === adminPoints0 + 2, `${adminPoints0} → ${adminPoints1}`)
const r2 = await diego.req(`/api/posts/${anuncios.id}/reactions`, { method: 'POST', body: { type: '😂' } })
check('reemplazar: total igual, el emoji viejo desaparece', r2.json.myReaction === '😂' && r2.json.reactionTotal === 1 && !r2.json.reactions['🚀'], JSON.stringify(r2.json))
const adminPoints2 = await leaderboardPoints(admin, 'valeria-rios')
check('reemplazar NO duplica ni re-premia puntos', adminPoints2 === adminPoints1, `${adminPoints1} → ${adminPoints2}`)
const r3 = await diego.req(`/api/posts/${anuncios.id}/reactions`, { method: 'POST', body: { type: '😂' } })
check('elegir el mismo emoji quita la reacción', r3.json.myReaction === null && r3.json.reactionTotal === 0, JSON.stringify(r3.json))
const adminPoints3 = await leaderboardPoints(admin, 'valeria-rios')
check('quitar la reacción resta los puntos', adminPoints3 === adminPoints0, `${adminPoints0} → ${adminPoints3}`)

// ---------- 2. Hilos: responder, y responder a una respuesta ----------
const rootRes = await member.req(`/api/posts/${video.id}/comments`, { method: 'POST', body: { body: 'Comentario raíz de la batería 16-G.' } })
const root = rootRes.json.comment
check('comentar crea la raíz (parentId null)', rootRes.status === 200 && root && root.parentId === null, `${rootRes.status}`)
const replyRes = await lucia.req(`/api/posts/${video.id}/comments`, { method: 'POST', body: { body: 'Respuesta de Lucía.', parentId: root.id } })
const reply = replyRes.json.comment
check('responder cuelga del comentario raíz', replyRes.status === 200 && reply.parentId === root.id, JSON.stringify(reply))
const deepRes = await diego.req(`/api/posts/${video.id}/comments`, { method: 'POST', body: { body: 'Respuesta a la respuesta.', parentId: reply.id } })
check('responder a una RESPUESTA cuelga de la raíz (un nivel)', deepRes.status === 200 && deepRes.json.comment.parentId === root.id, JSON.stringify(deepRes.json.comment))
const tree = await member.req(`/api/posts/${video.id}/comments`)
const treeRoot = tree.json.comments.find(c => c.id === root.id)
check('el árbol trae la raíz con sus 2 respuestas cronológicas y el total cuenta todas',
  !!treeRoot && treeRoot.replies.length === 2 && treeRoot.replies[0].id === reply.id && tree.json.total >= 3, JSON.stringify(tree.json.total))

// Avisos: la respuesta notifica al autor del comentario padre.
const notifs = await member.req('/api/notifications')
check('responder notifica al autor del comentario padre',
  (notifs.json.notifications || []).some(n => n.title.includes('respondió a tu comentario')), JSON.stringify((notifs.json.notifications || []).map(n => n.title).slice(0, 4)))

// ---------- 3. Reacciones en comentarios + punto comment_reaction ----------
const gam = await admin.req('/api/admin/gamification')
const cra = gam.json.points?.find(p => p.action === 'comment_reaction')
check("gamificación: la acción 'comment_reaction' existe y vale 1 por defecto", !!cra && cra.points === 1, JSON.stringify(cra))
const memberPoints0 = await leaderboardPoints(member, 'marco-solis')
const crBad = await diego.req(`/api/comments/${root.id}/reactions`, { method: 'POST', body: { type: '🦄' } })
check('comentario: emoji fuera de catálogo = 400', crBad.status === 400, `${crBad.status}`)
const cr1 = await diego.req(`/api/comments/${root.id}/reactions`, { method: 'POST', body: { type: '💯' } })
check('reaccionar a un comentario: resumen y mi reacción', cr1.json.myReaction === '💯' && cr1.json.reactionTotal === 1 && cr1.json.reactions['💯'] === 1, JSON.stringify(cr1.json))
const memberPoints1 = await leaderboardPoints(member, 'marco-solis')
check('reaccionar a un comentario suma su punto (comment_reaction) al autor', memberPoints1 === memberPoints0 + 1, `${memberPoints0} → ${memberPoints1}`)
const cr2 = await diego.req(`/api/comments/${root.id}/reactions`, { method: 'POST', body: { type: '😂' } })
const memberPoints2 = await leaderboardPoints(member, 'marco-solis')
check('reemplazar en comentario no re-premia', cr2.json.reactionTotal === 1 && memberPoints2 === memberPoints1, `${memberPoints1} → ${memberPoints2}`)
const notifs2 = await member.req('/api/notifications')
check('reaccionar a un comentario notifica a su autor (comment_reaction)',
  (notifs2.json.notifications || []).some(n => n.type === 'comment_reaction'), JSON.stringify((notifs2.json.notifications || []).map(n => n.type).slice(0, 5)))

// ---------- 4. Adjunto de imagen en un comentario ----------
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const fd = new FormData()
fd.append('file', new Blob([png], { type: 'image/png' }), 'bateria16g.png')
fd.append('kind', 'image')
const up = await member.req('/api/uploads', { method: 'POST', body: fd, raw: true })
check('subida de la imagen del comentario', up.status === 200 && !!up.json.url, `${up.status}`)
const attRes = await member.req(`/api/posts/${video.id}/comments`, { method: 'POST', body: { body: 'Comentario con imagen de la batería.', mediaType: 'image', mediaUrl: up.json.url, mediaName: up.json.name } })
check('el adjunto viaja en la respuesta de creación', attRes.status === 200 && attRes.json.comment.mediaType === 'image' && attRes.json.comment.mediaUrl === up.json.url, JSON.stringify(attRes.json.comment))
const tree2 = await diego.req(`/api/posts/${video.id}/comments`)
const attNode = tree2.json.comments.find(c => c.id === attRes.json.comment.id)
check('el adjunto viaja en el árbol de comentarios', !!attNode && attNode.mediaType === 'image' && attNode.mediaUrl === up.json.url)
const detail = await member.req(`/p/general/asi-grabe-mi-primer-video`)
// El payload SSR escapa las barras como \u002F: se busca la clave
// del archivo, que viaja literal.
check('el detalle recibe la imagen del comentario en sus datos (SSR)', detail.status === 200 && detail.text.includes(up.json.url.split('/').pop()), `${detail.status}`)
check('el detalle sirve la sección de comentarios (compositor en el HTML)', detail.text.includes('Añade un comentario'))

// ---------- 5. Editar comentario: solo el autor ----------
const editOther = await lucia.req(`/api/comments/${root.id}`, { method: 'PUT', body: { body: 'Editado por otra.' } })
check('editar comentario ajeno = 403', editOther.status === 403, `${editOther.status}`)
const editOwn = await member.req(`/api/comments/${root.id}`, { method: 'PUT', body: { body: 'Comentario raíz EDITADO por la batería.' } })
check('editar el propio comentario actualiza el cuerpo', editOwn.status === 200 && editOwn.json.comment.body.includes('EDITADO'), `${editOwn.status}`)

// ---------- 6. allow_comments apagado bloquea comentar Y responder ----------
const noComments = await member.req('/api/posts', { method: 'POST', body: { title: 'Post sin comentarios (batería 16-G)', body: 'Contenido de prueba.', channelSlug: 'general', allowComments: false } })
check('post de prueba sin comentarios creado', noComments.status === 200 && !!noComments.json.id, `${noComments.status} ${JSON.stringify(noComments.json).slice(0, 120)}`)
const ncPostId = noComments.json.id
const blockedComment = await lucia.req(`/api/posts/${ncPostId}/comments`, { method: 'POST', body: { body: 'No debería pasar.' } })
check('allow_comments apagado: comentar = 403', blockedComment.status === 403, `${blockedComment.status}`)
const toggle = await member.req(`/api/posts/${ncPostId}/comments-toggle`, { method: 'POST' })
check('el autor puede reactivar los comentarios', toggle.status === 200 && toggle.json.allowComments === true, `${toggle.status}`)
const okComment = await lucia.req(`/api/posts/${ncPostId}/comments`, { method: 'POST', body: { body: 'Comentario válido ya con comentarios activos.' } })
const toggleOff = await member.req(`/api/posts/${ncPostId}/comments-toggle`, { method: 'POST' })
const blockedReply = await diego.req(`/api/posts/${ncPostId}/comments`, { method: 'POST', body: { body: 'Respuesta bloqueada.', parentId: okComment.json.comment.id } })
check('allow_comments apagado: RESPONDER también = 403', toggleOff.json.allowComments === false && blockedReply.status === 403, `${blockedReply.status}`)
await member.req(`/api/posts/${ncPostId}`, { method: 'DELETE' })

// ---------- 7. Borrar la raíz borra respuestas y reacciones ----------
await member.req(`/api/comments/${root.id}`, { method: 'DELETE' })
const tree3 = await member.req(`/api/posts/${video.id}/comments`)
const gone = !tree3.json.comments.some(c => c.id === root.id) && !tree3.json.comments.some(c => c.replies?.some(r => r.id === reply.id))
check('borrar la raíz elimina también sus respuestas del árbol', gone)
check('borrar la raíz elimina las reacciones de todo el hilo (SQL)',
  sqlVal(`SELECT COUNT(*) FROM comment_reactions WHERE comment_id IN (${root.id}, ${reply.id}, ${deepRes.json.comment.id})`) === 0
  && sqlVal(`SELECT COUNT(*) FROM comments WHERE id IN (${root.id}, ${reply.id}, ${deepRes.json.comment.id})`) === 0)
const reactGone = await diego.req(`/api/comments/${reply.id}/reactions`, { method: 'POST', body: { type: '👍' } })
check('reaccionar a una respuesta borrada = 404', reactGone.status === 404, `${reactGone.status}`)
// El comentario con adjunto sigue vivo: se borra también (limpieza).
await member.req(`/api/comments/${attRes.json.comment.id}`, { method: 'DELETE' })

// ---------- 8. Un solo componente: tarjeta y detalle ----------
const postCardSrc = readFileSync(join(process.cwd(), 'app/components/PostCard.vue'), 'utf8')
const detailSrc = readFileSync(join(process.cwd(), 'app/pages/p/[channelSlug]/[postSlug].vue'), 'utf8')
check('la tarjeta monta PostComments (expansión en la tarjeta)', postCardSrc.includes('<PostComments'))
check('el detalle usa el MISMO PostComments', detailSrc.includes('<PostComments'))
check('la tarjeta ya no tiene los 4 botones toggle de palabras', !postCardSrc.includes('reactionMeta') && !postCardSrc.includes('myReactions'))

// ---------- 9. Paridad i18n ----------
{
  const parityScript = `
    const flat = (o, p = '', out = []) => { for (const [k, v] of Object.entries(o)) { const key = p ? p + '.' + k : k; if (typeof v === 'string') out.push(key); else flat(v, key, out) } return out }
    const { es } = await import('./app/i18n/es.ts')
    const { en } = await import('./app/i18n/en.ts')
    console.log(JSON.stringify({ es: flat(es).sort(), en: flat(en).sort() }))
  `
  const out = execFileSync('node', ['--experimental-strip-types', '--input-type=module', '-e', parityScript], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const parity = JSON.parse(out.trim().split('\n').pop())
  const onlyEs = parity.es.filter(k => !parity.en.includes(k))
  const onlyEn = parity.en.filter(k => !parity.es.includes(k))
  check(`paridad de claves i18n intacta (${parity.es.length} claves)`, onlyEs.length === 0 && onlyEn.length === 0, `solo-es: ${onlyEs.slice(0, 5)} solo-en: ${onlyEn.slice(0, 5)}`)
  check('las claves comments.* existen en ambos catálogos', parity.es.includes('comments.react') && parity.en.includes('comments.react') && parity.es.includes('comments.sortRecent'))
}

// ---------- Limpieza y semilla intacta ----------
check('limpieza: sin comentarios de la batería en el post de video',
  sqlVal(`SELECT COUNT(*) FROM comments WHERE post_id = ${video.id} AND body LIKE '%batería%'`) === 0)
check('semilla local limpia al final (4 usuarios, 7 posts, 5 canales)',
  sqlVal('SELECT COUNT(*) FROM users') === 4 && sqlVal('SELECT COUNT(*) FROM posts') === 7 && sqlVal('SELECT COUNT(*) FROM channels') === 5)

console.log(`\n${pass} PASS · ${fail} FAIL`)
process.exit(fail ? 1 : 0)
