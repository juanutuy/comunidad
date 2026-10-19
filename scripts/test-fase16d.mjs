// Verificación local de la Fase 16-D (submenús de consola, sin
// pestañas): el submenú de subsecciones es UNA columna compartida
// (AdminSubMenu) en Ajustes, Gamificación, Miembros, Contenido y
// Cursos; Moderación conserva sus pestañas de cola (AdminQueueTabs)
// y los filtros de datos de Contenido quedan intactos.
// Corre contra wrangler dev (D1 local) y RESTAURA lo que toca
// (correo de soporte y rol de Diego) incluso si algo falla.
//   node scripts/test-fase16d.mjs http://127.0.0.1:8787
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
const anchors = html => [...html.matchAll(/<a\b[^>]*>/g)].map(m => m[0])
const hasLink = (html, href) => anchors(html).some(a => a.includes(`href="${href}"`))
const activeLink = (html, href) => anchors(html).some(a => a.includes(`href="${href}"`) && a.includes('aria-current="page"'))
const hasSubMenu = html => html.includes('aria-label="Subsecciones"') && html.includes('lg:flex-col') && html.includes('lg:w-60')
const hasTablist = html => html.includes('role="tablist"')

const admin = await client()
let diegoId = null
let originalSupportEmail = null
try {
  const login = await admin.login('admin@demo.local', 'demo1234')
  check('login admin', login.status === 200, `status ${login.status}`)

  // ---------- Ajustes de la comunidad ----------
  const s = await admin.req('/admin/settings')
  check('settings 200', s.status === 200)
  check('settings: submenú en columna', hasSubMenu(s.text))
  check('settings: sin fila de pestañas', !hasTablist(s.text))
  for (const v of ['general', 'privacidad', 'barra', 'menu', 'contacto', 'pagos', 'legales', 'moderacion', 'ingreso']) {
    check(`settings: enlace ?tab=${v}`, hasLink(s.text, `/admin/settings?tab=${v}`))
  }
  check('settings: General activo por defecto', activeLink(s.text, '/admin/settings?tab=general'))
  check('settings: General trae el selector de idioma (Fase 18)', s.text.includes('Idioma por defecto de la comunidad'))

  const sp = await admin.req('/admin/settings?tab=pagos')
  check('settings?tab=pagos: Pagos activo', activeLink(sp.text, '/admin/settings?tab=pagos'))
  check('settings?tab=pagos: moneda y pagos manuales (Fase 17)', sp.text.includes('Moneda de la comunidad') && sp.text.includes('Pagos manuales'))
  const spr = await admin.req('/admin/settings?tab=privacidad')
  check('settings?tab=privacidad: Privacidad activa', activeLink(spr.text, '/admin/settings?tab=privacidad'))
  check('settings?tab=privacidad: teaser granular (Fase 15)', spr.text.includes('Quién puede ver la comunidad') && spr.text.includes('Canales pagos: cuánto lee quien no compró'))
  const sc = await admin.req('/admin/settings?tab=contacto')
  check('settings?tab=contacto: correo de soporte', sc.text.includes('Correo de soporte'))

  // Guardar desde una subsección sigue funcionando (correo de soporte).
  const get1 = await admin.req('/api/admin/settings')
  const st = get1.json?.settings || {}
  originalSupportEmail = st.supportEmail || ''
  const body = {
    name: st.name, tagline: st.tagline, brandColor: st.brandColor, guidelines: st.guidelines || [],
    terms: st.terms, privacy: st.privacy, moderationReview: !!st.moderationReview,
    joinApproval: !!st.joinApproval, joinQuestions: st.joinQuestions || [], joinCooldownDays: st.joinCooldownDays || 0,
    autoJoinChannels: st.autoJoinChannels || [], visibility: st.visibility, directoryAudience: st.directoryAudience,
    libraryAudience: st.libraryAudience, paidPreviewMode: st.paidPreviewMode, paidPreviewPct: st.paidPreviewPct,
    paidPreviewChars: st.paidPreviewChars, paidMediaMode: st.paidMediaMode, paidTitleMode: st.paidTitleMode,
    paidLockedWhere: st.paidLockedWhere, feedSidebar: st.feedSidebar || [], navMenu: st.navMenu || [],
    anyoneCanRegister: st.anyoneCanRegister !== false, logoUrl: st.logoUrl || '', logoDarkUrl: st.logoDarkUrl || '',
    iconUrl: st.iconUrl || '', faviconUrl: st.faviconUrl || '', supportEmail: 'soporte-fase16d@demo.local',
    websiteUrl: st.websiteUrl || '', socialLinks: st.socialLinks || [], currency: st.currency || 'USD',
    manualPaymentsEnabled: !!st.manualPaymentsEnabled, defaultLocale: st.defaultLocale || 'es',
  }
  const put = await admin.req('/api/admin/settings', { method: 'PUT', body })
  check('settings: PUT guardar (desde Contacto)', put.status === 200, `status ${put.status}`)
  const get2 = await admin.req('/api/admin/settings')
  check('settings: el correo nuevo quedó guardado', get2.json?.settings?.supportEmail === 'soporte-fase16d@demo.local')
  body.supportEmail = originalSupportEmail
  await admin.req('/api/admin/settings', { method: 'PUT', body })
  const get3 = await admin.req('/api/admin/settings')
  check('settings: correo de soporte restaurado', (get3.json?.settings?.supportEmail || '') === originalSupportEmail)

  // ---------- Gamificación ----------
  const g = await admin.req('/admin/gamification')
  check('gamificación: submenú en columna, sin pestañas', hasSubMenu(g.text) && !hasTablist(g.text))
  check('gamificación: enlaces ?tab=', hasLink(g.text, '/admin/gamification?tab=puntos') && hasLink(g.text, '/admin/gamification?tab=compuertas'))
  const gc = await admin.req('/admin/gamification?tab=compuertas')
  check('gamificación?tab=compuertas: contenido de compuertas', gc.text.includes('Compuertas por nivel') && activeLink(gc.text, '/admin/gamification?tab=compuertas'))

  // ---------- Moderación: las pestañas de cola SE QUEDAN ----------
  const mod = await admin.req('/admin/moderation')
  check('moderación: conserva pestañas de cola', hasTablist(mod.text) && mod.text.includes('Reportes') && mod.text.includes('En revisión'))
  check('moderación: sin submenú de subsecciones', !mod.text.includes('aria-label="Subsecciones"'))

  // ---------- Miembros ----------
  const mem = await admin.req('/admin/members')
  check('miembros: submenú en columna, sin pestañas', hasSubMenu(mem.text) && !hasTablist(mem.text))
  check('miembros: subsecciones del admin', hasLink(mem.text, '/admin/members/requests') && hasLink(mem.text, '/admin/members/invitations') && hasLink(mem.text, '/admin/members/roles'))
  check('miembros: Miembros activo', activeLink(mem.text, '/admin/members'))
  const reqs = await admin.req('/admin/members/requests')
  check('solicitudes: submenú + activo', hasSubMenu(reqs.text) && activeLink(reqs.text, '/admin/members/requests'))
  check('solicitudes: estado de la aprobación visible', reqs.text.includes('aprobación previa está apagada') || reqs.text.includes('historial'))
  const inv = await admin.req('/admin/members/invitations')
  check('invitaciones: submenú + activo', hasSubMenu(inv.text) && activeLink(inv.text, '/admin/members/invitations'))

  // ---------- Contenido ----------
  const con = await admin.req('/admin/content')
  check('contenido: submenú en columna, sin pestañas', hasSubMenu(con.text) && !hasTablist(con.text))
  check('contenido: subsecciones (admin ve Archivos)', hasLink(con.text, '/admin/content/media') && hasLink(con.text, '/admin/content/channels'))
  const med = await admin.req('/admin/content/media')
  check('medios: submenú + activo', hasSubMenu(med.text) && activeLink(med.text, '/admin/content/media'))
  check('medios: filtro por tipo intacto (dato, no navegación)', med.text.includes('Imágenes'))
  const chn = await admin.req('/admin/content/channels')
  check('canales de contenido: submenú + activo', hasSubMenu(chn.text) && activeLink(chn.text, '/admin/content/channels'))
  check('canales de contenido: vista Activos intacta', chn.text.includes('Activos'))

  // ---------- Cursos ----------
  const cou = await admin.req('/admin/courses')
  check('cursos: submenú en columna, sin pestañas caseras', hasSubMenu(cou.text) && !hasTablist(cou.text))
  check('cursos: título de sección (ya no «Administración»)', !cou.text.includes('Administración</h1>') && cou.text.includes('Cursos</h1>'))
  check('cursos: Cursos activo y enlace a Certificados', activeLink(cou.text, '/admin/courses') && hasLink(cou.text, '/admin/courses/blueprints'))
  const bp = await admin.req('/admin/courses/blueprints')
  check('certificados: submenú + activo', hasSubMenu(bp.text) && activeLink(bp.text, '/admin/courses/blueprints'))
  check('certificados: contenido real', bp.text.includes('Diseños de certificado'))

  // ---------- Filtro por rol: moderador ----------
  const members = await admin.req('/api/admin/members')
  diegoId = (members.json?.members || []).find(m => m.email === 'diego@demo.local')?.id
  check('diego localizado para la prueba de rol', !!diegoId)
  if (diegoId) {
    await admin.req(`/api/admin/members/${diegoId}/role`, { method: 'POST', body: { role: 'moderator' } })
    const diego = await client()
    await diego.login('diego@demo.local', 'demo1234')
    const dMem = await diego.req('/admin/members')
    check('moderador: ve el submenú de Miembros', hasSubMenu(dMem.text) && hasLink(dMem.text, '/admin/members'))
    check('moderador: NO ve Invitaciones/Solicitudes/Roles', !hasLink(dMem.text, '/admin/members/invitations') && !hasLink(dMem.text, '/admin/members/requests') && !hasLink(dMem.text, '/admin/members/roles'))
    const dCon = await diego.req('/admin/content')
    check('moderador: Contenido sin Archivos', hasLink(dCon.text, '/admin/content/channels') && !hasLink(dCon.text, '/admin/content/media'))
    await admin.req(`/api/admin/members/${diegoId}/role`, { method: 'POST', body: { role: 'member' } })
    diegoId = null
  }
}
finally {
  if (diegoId) {
    try { await admin.req(`/api/admin/members/${diegoId}/role`, { method: 'POST', body: { role: 'member' } }) } catch { /* la limpieza por SQL la confirma el informe */ }
  }
}
console.log(`\n${pass} PASS · ${fail} FAIL`)
process.exit(fail ? 1 : 0)
