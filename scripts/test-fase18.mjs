// Verificación local de la Fase 18 (multilenguaje es/en): paridad de
// diccionarios, resolución usuario > comunidad > base, SSR por
// contenido, mensajes de servidor localizados y persistencia.
// Corre contra wrangler dev (D1 local) y RESTAURA los locales al
// final, incluso si algo falla (no crea usuarios ni posts).
//   node scripts/test-fase18.mjs http://127.0.0.1:8787
import { execFileSync } from 'node:child_process'

const BASE = process.argv[2] || 'http://127.0.0.1:8787'
let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}
function sql(command) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'comunidad-db', '--local', '--json', '--command', command], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const start = out.indexOf('[')
  const parsed = JSON.parse(out.slice(start))
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
      const headers = { 'content-type': 'application/json', ...(opts.headers || {}) }
      const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
      if (cookie) headers.cookie = cookie
      const res = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, redirect: 'manual' })
      for (const sc of res.headers.getSetCookie?.() || []) {
        const [pair] = sc.split(';')
        const i = pair.indexOf('=')
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
      }
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* html */ }
      return { status: res.status, json, text, headers: res.headers }
    },
    async login(email, password) {
      const r = await this.req('/api/auth/login', { method: 'POST', body: { email, password } })
      if (r.status !== 200) throw new Error(`login ${email} → ${r.status}`)
      return r.json.user
    },
  }
}
// Petición suelta con cookies explícitas (visitante).
async function raw(path, cookie = '') {
  const res = await fetch(BASE + path, { headers: cookie ? { cookie } : {} })
  return { status: res.status, text: await res.text() }
}

const RAW_KEY_PATTERNS = [
  'feed.latest', 'feed.oldest', 'composer.publish', 'composer.writeSomething',
  'post.comments', 'post.savePost', 'nav.home', 'nav.courses', 'settings.title',
  'channel.posts', 'courses.title', 'auth.welcomeBack', 'pricing.title',
]

const admin = await client()
let users0 = 0, posts0 = 0
try {
  users0 = sqlVal('SELECT COUNT(*) FROM users')
  posts0 = sqlVal('SELECT COUNT(*) FROM posts')

  // ---------- 1. Paridad de diccionarios es/en ----------
  const parityScript = `
    const flat = (o, p = '', out = []) => { for (const [k, v] of Object.entries(o)) { const key = p ? p + '.' + k : k; if (typeof v === 'string') out.push(key); else flat(v, key, out) } return out }
    const { es } = await import('./app/i18n/es.ts')
    const { en } = await import('./app/i18n/en.ts')
    const a = flat(es).sort(), b = flat(en).sort()
    console.log(JSON.stringify({ es: a, en: b }))
  `
  const parityOut = execFileSync('node', ['--experimental-strip-types', '--input-type=module', '-e', parityScript], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const parity = JSON.parse(parityOut.trim().split('\n').pop())
  const onlyEs = parity.es.filter(k => !parity.en.includes(k))
  const onlyEn = parity.en.filter(k => !parity.es.includes(k))
  check(`paridad de diccionarios (${parity.es.length} claves)`, onlyEs.length === 0 && onlyEn.length === 0, `solo-es: ${onlyEs.slice(0, 5)} solo-en: ${onlyEn.slice(0, 5)}`)

  // ---------- 2. Visitante: defecto de la comunidad (es) y cookie ----------
  const loginEs = await raw('/login')
  check('visitante /login en español', loginEs.text.includes('Bienvenido de nuevo') && loginEs.text.includes('lang="es"'))
  const loginEn = await raw('/login', 'cm_locale=en')
  check('visitante /login con cookie en → inglés + lang="en"', loginEn.text.includes('Welcome back') && loginEn.text.includes('lang="en"'))
  const pricingEs = await raw('/pricing')
  check('visitante /pricing en español', pricingEs.text.includes('Próximamente'))
  const pricingEn = await raw('/pricing', 'cm_locale=en')
  check('visitante /pricing con cookie en → inglés', pricingEn.text.includes('Coming soon'))

  // ---------- 3. Mensajes de servidor: login inválido ----------
  const badEs = await (await client()).req('/api/auth/login', { method: 'POST', body: { email: 'member@demo.local', password: 'incorrecta' } })
  check('login inválido (es)', badEs.status === 401 && badEs.json.message === 'Correo o contraseña incorrectos.', badEs.json?.message)
  const badEnRes = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'cookie': 'cm_locale=en' }, body: JSON.stringify({ email: 'member@demo.local', password: 'incorrecta' }) })
  const badEn = await badEnRes.json()
  check('login inválido (en, por cookie)', badEnRes.status === 401 && badEn.message === 'Incorrect email or password.', badEn.message)

  // ---------- 4. Un usuario elige English; otro sigue en español ----------
  await admin.login('admin@demo.local', 'demo1234')
  const marco = await client()
  await marco.login('member@demo.local', 'demo1234')
  const lucia = await client()
  await lucia.login('lucia@demo.local', 'demo1234')

  const setEn = await marco.req('/api/settings/locale', { method: 'PUT', body: { locale: 'en' } })
  check('PUT /api/settings/locale {en}', setEn.status === 200 && setEn.json.locale === 'en' && setEn.json.userLocale === 'en', JSON.stringify(setEn.json))
  const tenantMarco = await marco.req('/api/tenant')
  check('/api/tenant de Marco resuelve en', tenantMarco.json.locale === 'en' && tenantMarco.json.user.locale === 'en')
  const tenantLucia = await lucia.req('/api/tenant')
  check('/api/tenant de Lucía sigue en es (default)', tenantLucia.json.locale === 'es' && (tenantLucia.json.user.locale === null))

  const feedMarco = await marco.req('/feeds')
  check('feed de Marco en inglés (SSR)', feedMarco.text.includes('Write something') && feedMarco.text.includes('lang="en"'))
  check('feed de Marco SIN el placeholder en español', !feedMarco.text.includes('Escribí algo'))
  const rawLeaks = RAW_KEY_PATTERNS.filter(k => feedMarco.text.includes(k))
  check('feed en inglés sin claves crudas', rawLeaks.length === 0, rawLeaks.join(','))
  const feedLucia = await lucia.req('/feeds')
  check('feed de Lucía en español (SSR)', feedLucia.text.includes('Escribí algo') && feedLucia.text.includes('lang="es"'))

  // ---------- 5. Mensajes de servidor según el idioma del solicitante ----------
  const pollMarco = await marco.req('/api/posts', { method: 'POST', body: { channelSlug: 'general', kind: 'poll', title: '', body: '', options: ['a'] } })
  check('crear encuesta sin pregunta (en)', pollMarco.status === 400 && /poll|question/i.test(pollMarco.json.message), pollMarco.json?.message)
  const pollLucia = await lucia.req('/api/posts', { method: 'POST', body: { channelSlug: 'general', kind: 'poll', title: '', body: '', options: ['a'] } })
  check('crear encuesta sin pregunta (es)', pollLucia.status === 400 && /encuesta/i.test(pollLucia.json.message), pollLucia.json?.message)
  const manualMarco = await marco.req('/api/billing/manual', { method: 'POST', body: { kind: 'plan', planId: 1, methodId: 1 } })
  check('checkout manual deshabilitado (en)', manualMarco.status === 409 && manualMarco.json.message === 'Manual payments are not enabled in this community.', manualMarco.json?.message)
  const manualLucia = await lucia.req('/api/billing/manual', { method: 'POST', body: { kind: 'plan', planId: 1, methodId: 1 } })
  check('checkout manual deshabilitado (es)', manualLucia.status === 409 && manualLucia.json.message === 'Los pagos manuales no están activados en esta comunidad.', manualLucia.json?.message)

  // ---------- 6. Volver a «predeterminado» y defecto de comunidad en en ----------
  const setNull = await marco.req('/api/settings/locale', { method: 'PUT', body: { locale: null } })
  check('PUT locale null → vuelve al defecto (es)', setNull.status === 200 && setNull.json.locale === 'es' && setNull.json.userLocale === null)

  async function putSettings(patch) {
    const s = (await admin.req('/api/admin/settings')).json.settings
    return admin.req('/api/admin/settings', {
      method: 'PUT',
      body: {
        name: s.name, tagline: s.tagline, brandColor: s.brandColor,
        guidelines: s.guidelines, terms: s.terms, privacy: s.privacy,
        moderationReview: s.moderationReview, joinApproval: s.joinApproval,
        joinQuestions: s.joinQuestions, joinCooldownDays: s.joinCooldownDays,
        autoJoinChannels: s.autoJoinChannels,
        visibility: s.visibility, directoryAudience: s.directoryAudience, libraryAudience: s.libraryAudience,
        paidPreviewMode: s.paidPreviewMode, paidPreviewPct: s.paidPreviewPct, paidPreviewChars: s.paidPreviewChars,
        paidMediaMode: s.paidMediaMode, paidTitleMode: s.paidTitleMode, paidLockedWhere: s.paidLockedWhere,
        feedSidebar: s.feedSidebar, navMenu: s.navMenu, anyoneCanRegister: s.anyoneCanRegister,
        logoUrl: s.logoUrl, logoDarkUrl: s.logoDarkUrl, iconUrl: s.iconUrl, faviconUrl: s.faviconUrl,
        supportEmail: s.supportEmail, websiteUrl: s.websiteUrl, socialLinks: s.socialLinks,
        currency: s.currency, manualPaymentsEnabled: s.manualPaymentsEnabled,
        defaultLocale: s.defaultLocale,
        ...patch,
      },
    })
  }
  // Marco elige Español EXPLÍCITO antes de cambiar el defecto.
  await marco.req('/api/settings/locale', { method: 'PUT', body: { locale: 'es' } })
  const defEn = await putSettings({ defaultLocale: 'en' })
  check('admin pone el defecto de la comunidad en en', defEn.status === 200)
  const tenantCheck = await (await client()).req('/api/tenant')
  check('/api/tenant anónimo reporta defaultLocale en', tenantCheck.json.tenant.defaultLocale === 'en' && tenantCheck.json.locale === 'en')

  // Lucía vuelve a entrar: el login refresca su cookie al resuelto
  // (sin elección personal manda el nuevo defecto de la comunidad).
  const lucia2 = await client()
  await lucia2.login('lucia@demo.local', 'demo1234')
  const feedLucia2 = await lucia2.req('/feeds')
  check('sin elección personal → Lucía ve inglés con el defecto en', feedLucia2.text.includes('Write something'))
  const feedMarco2 = await marco.req('/feeds')
  check('con Español explícito → Marco sigue en español', feedMarco2.text.includes('Escribí algo'))
  const loginVisitor2 = await raw('/login')
  check('visitante /login ve el defecto (en)', loginVisitor2.text.includes('Welcome back'))

  // ---------- 7. Persistencia tras cerrar sesión y volver a entrar ----------
  await marco.req('/api/settings/locale', { method: 'PUT', body: { locale: 'en' } })
  await marco.req('/api/auth/logout', { method: 'POST', body: {} })
  const marco2 = await client()
  await marco2.login('member@demo.local', 'demo1234')
  const tenantMarco2 = await marco2.req('/api/tenant')
  check('tras re-login, la elección (en) persiste desde la base', tenantMarco2.json.locale === 'en' && tenantMarco2.json.user.locale === 'en')
  const feedMarco3 = await marco2.req('/feeds')
  check('feed tras re-login en inglés', feedMarco3.text.includes('Write something'))
}
catch (e) {
  fail++
  console.log('ERROR de la corrida:', e.message)
}
finally {
  // ---------- Limpieza: locales restaurados a la semilla ----------
  try {
    sql('UPDATE users SET locale = NULL')
    sql("UPDATE tenants SET default_locale = 'es'")
    const users1 = sqlVal('SELECT COUNT(*) FROM users')
    const posts1 = sqlVal('SELECT COUNT(*) FROM posts')
    const leftEn = sqlVal("SELECT COUNT(*) FROM users WHERE locale = 'en'")
    const tenantDef = sqlVal('SELECT default_locale FROM tenants LIMIT 1')
    check('limpieza: usuarios como al inicio', users1 === users0, `${users1} vs ${users0}`)
    check('limpieza: posts como al inicio', posts1 === posts0, `${posts1} vs ${posts0}`)
    check('limpieza: ningún locale en; defecto es', leftEn === 0 && tenantDef === 'es')
  }
  catch (e) { console.log('ERROR en limpieza:', e.message); fail++ }
}
console.log(`\n${pass} PASS · ${fail} FAIL`)
process.exit(fail ? 1 : 0)
