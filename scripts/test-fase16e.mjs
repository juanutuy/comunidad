// Verificación local de la Fase 16-E (marco fijo: solo el centro se
// desplaza): la raíz de los layouts de miembro y de consola es
// h-dvh sin scroll del documento; el header es una fila fija; el
// lateral de canales y el RIEL DERECHO quedan fijos con su PROPIO
// scroll interno (su contenedor lleva el overflow, con la altura de
// la zona bajo el header) y la columna central es el desplazador
// principal. La consola replica el patrón (riel fijo, submenú fijo
// con scroll interno, solo el contenido se desplaza) y el layout
// auth queda con su scroll de página de siempre.
// Corre contra wrangler dev (D1 local); no escribe datos.
//   node scripts/test-fase16e.mjs http://127.0.0.1:8787
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:8787'
let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}
async function client() {
  const jar = new Map()
  return {
    async req(path, opts = {}) {
      const headers = { ...(opts.headers || {}) }
      if (opts.body !== undefined) headers['content-type'] = 'application/json'
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
      return { status: res.status, text, json }
    },
    async login(email, password) {
      return this.req('/api/auth/login', { method: 'POST', body: { email, password } })
    },
  }
}
// La etiqueta que lleva el atributo data-scroll-region="<name>".
function regionTag(html, name) {
  const i = html.indexOf(`data-scroll-region="${name}"`)
  if (i < 0) return null
  const start = html.lastIndexOf('<', i)
  const end = html.indexOf('>', i)
  return html.slice(start, end + 1)
}
const frameRoot = (html, frame) => {
  const i = html.indexOf(`data-frame="${frame}"`)
  if (i < 0) return null
  const start = html.lastIndexOf('<', i)
  const end = html.indexOf('>', i)
  return html.slice(start, end + 1)
}

// ---------- Área de miembro ----------
const member = await client()
const loginM = await member.login('member@demo.local', 'demo1234')
check('login de miembro', loginM.status === 200, `status ${loginM.status}`)

const feed = await member.req('/feeds')
check('feed sirve con sesión', feed.status === 200, `status ${feed.status}`)
const root = frameRoot(feed.text, 'member')
check('raíz del marco de miembro: h-dvh sin scroll del documento', !!root && root.includes('h-dvh') && root.includes('overflow-hidden') && !root.includes('min-h-screen'), root || 'sin raíz')

const center = regionTag(feed.text, 'center')
check('columna central es el desplazador principal (overflow-y-auto)', !!center && center.includes('overflow-y-auto'), center || 'ausente')

const side = regionTag(feed.text, 'channels-sidebar')
check('lateral de canales: fijo con scroll interno propio', !!side && side.includes('overflow-y-auto') && side.includes('shrink-0'), side || 'ausente')

// El riel derecho se comprueba POR SEPARADO (aclaración de Juan):
// su contenedor — no el centro ni la página — lleva el overflow.
const rail = regionTag(feed.text, 'right-rail')
check('riel derecho: fijo con scroll interno propio (overflow en SU contenedor)', !!rail && rail.includes('overflow-y-auto') && rail.includes('shrink-0'), rail || 'ausente')
const iSide = feed.text.indexOf('data-scroll-region="channels-sidebar"')
const iCenter = feed.text.indexOf('data-scroll-region="center"')
const iRail = feed.text.indexOf('data-scroll-region="right-rail"')
check('las tres regiones son elementos distintos y en orden (lateral · centro · riel)', iSide > -1 && iCenter > iSide && iRail > iCenter)

const headerTag = feed.text.slice(feed.text.indexOf('<header'), feed.text.indexOf('>', feed.text.indexOf('<header')) + 1)
check('header ya no es sticky sobre la página (es fila fija del marco)', !headerTag.includes('sticky'), headerTag)

const mainStart = feed.text.indexOf('data-scroll-region="center"')
const mainEnd = feed.text.indexOf('</main>')
const iFooter = feed.text.indexOf('<footer')
check('el pie vive al final del scroll central, no bajo el marco', iFooter > mainStart && iFooter < mainEnd)
const iSpacer = feed.text.indexOf('h-[calc(4rem+env(safe-area-inset-bottom))]')
check('el respiro de la barra inferior móvil queda dentro del scroll central', iSpacer > mainStart && iSpacer < mainEnd)

const apiFeed = await member.req('/api/feed')
check('la API del feed sigue respondiendo tras el cambio de marco', apiFeed.status === 200 && Array.isArray(apiFeed.json?.posts), `status ${apiFeed.status}`)

// Perfil: sin riel derecho (Fase 9), el centro sigue siendo el desplazador.
const mySlug = loginM.json?.user?.slug
if (mySlug) {
  const profile = await member.req(`/profile/${mySlug}`)
  check('perfil: sin riel derecho y con centro desplazable', profile.status === 200 && !profile.text.includes('data-scroll-region="right-rail"') && !!regionTag(profile.text, 'center'))
}
else check('perfil: sin riel derecho y con centro desplazable', false, 'login sin slug')

// ---------- Consola ----------
const admin = await client()
const loginA = await admin.login('admin@demo.local', 'demo1234')
check('login de admin', loginA.status === 200, `status ${loginA.status}`)

const panel = await admin.req('/admin')
const aRoot = frameRoot(panel.text, 'admin')
check('raíz de la consola: h-dvh sin scroll del documento', panel.status === 200 && !!aRoot && aRoot.includes('h-dvh') && !aRoot.includes('min-h-screen'), aRoot || 'sin raíz')
const aRail = regionTag(panel.text, 'admin-rail')
check('riel de secciones fijo con scroll interno (sin sticky top-20)', !!aRail && aRail.includes('overflow-y-auto') && !aRail.includes('sticky'), aRail || 'ausente')
const aMain = regionTag(panel.text, 'admin-content')
check('solo el contenido de la sección se desplaza en la consola', !!aMain && aMain.includes('overflow-y-auto'), aMain || 'ausente')

const settings = await admin.req('/admin/settings')
const sub = regionTag(settings.text, 'admin-submenu')
check('submenú de Ajustes: fijo (sticky en el desplazador) con scroll interno propio', settings.status === 200 && !!sub && sub.includes('lg:sticky') && sub.includes('lg:overflow-y-auto') && !sub.includes('lg:top-20'), sub || 'ausente')

const membersPage = await admin.req('/admin/members')
check('una página larga de consola (Miembros) usa el mismo marco', membersPage.status === 200 && !!regionTag(membersPage.text, 'admin-content'))

const courses = await admin.req('/api/admin/courses')
const firstCourse = courses.json?.courses?.[0]
if (firstCourse?.id) {
  const studio = await admin.req(`/admin/courses/${firstCourse.id}/edit`)
  check('estudio de curso: su panel se recalculó contra el desplazador de la consola', studio.status === 200 && studio.text.includes('lg:max-h-[calc(100dvh-6.5rem)]'))
}
else check('estudio de curso: su panel se recalculó contra el desplazador de la consola', false, 'sin cursos en la base local')

// ---------- Lo que NO cambia ----------
// Pricing vive en el cascarón de la comunidad (no es layout auth):
// hereda el marco, como hoy hereda el cascarón.
const pricing = await (await client()).req('/pricing')
check('/pricing sigue en el cascarón de la comunidad (marco de miembro)', pricing.status === 200 && !!frameRoot(pricing.text, 'member'))

const loginPage = await (await client()).req('/login')
check('layout auth intacto: /login con scroll de página (min-h-screen, sin marco)', loginPage.status === 200 && loginPage.text.includes('min-h-screen') && !loginPage.text.includes('data-frame='))

// ---------- Fuente: reinicio de scroll al navegar y chat ----------
// El chat conserva su desplazador interno propio (el hilo no depende
// del scroll de la zona central) y ambos layouts reinician SU
// desplazador al cambiar de página: se verifica en la fuente porque
// el comportamiento de scroll no se puede ejercer por HTTP.
const chatSrc = readFileSync('app/components/ChatThread.vue', 'utf8')
check('ChatThread conserva su scroll interno propio (max-h + overflow-y-auto)', chatSrc.includes('max-h-[480px]') && chatSrc.includes('overflow-y-auto'))
const defSrc = readFileSync('app/layouts/default.vue', 'utf8')
check('layout de miembro reinicia la columna central al cambiar de página', defSrc.includes('centerScroller') && defSrc.includes('route.path') && defSrc.includes('scrollTo'))
const admSrc = readFileSync('app/layouts/admin.vue', 'utf8')
check('la consola reinicia su contenido al cambiar de sección/subsección', admSrc.includes('contentScroller') && admSrc.includes('scrollTo'))

console.log(`\n${pass} PASS · ${fail} FAIL`)
process.exit(fail ? 1 : 0)
