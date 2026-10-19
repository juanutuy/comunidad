// Verificación local de la Fase 17 (Ingresos, moneda, pagos
// manuales, planes). Corre contra wrangler dev (D1 local) y LIMPIA
// todo lo que crea al final, incluso si algo falla.
//   node scripts/test-fase17.mjs http://127.0.0.1:8787
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
      return { status: res.status, json, text }
    },
    async login(email, password) {
      const r = await this.req('/api/auth/login', { method: 'POST', body: { email, password } })
      if (r.status !== 200) throw new Error(`login ${email} → ${r.status}`)
      return r.json.user
    },
  }
}

const createdPaymentIds = []
let methodId = 0
let qaUserIds = []
let diegoId = 0
let originalSettings = null
let originalPlanOrder = []
const admin = await client()

try {
  const adminUser = await admin.login('admin@demo.local', 'demo1234')
  check('login admin', !!adminUser)

  // ---------- Baseline de Ingresos y cruce con SQL ----------
  const earn0 = await admin.req('/api/admin/earnings')
  check('GET /api/admin/earnings (admin) 200', earn0.status === 200)
  const sqlTotal = sqlVal("SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE status = 'paid'")
  const sqlMonthOrders = sqlVal("SELECT COUNT(*) FROM payments WHERE created_at >= date('now','start of month')")
  const sqlTotalOrders = sqlVal('SELECT COUNT(*) FROM payments')
  check('KPI ingresos totales == SQL SUM(paid)', earn0.json.kpis.totalRevenueCents === sqlTotal, `${earn0.json.kpis.totalRevenueCents} vs ${sqlTotal}`)
  check('KPI órdenes del mes == SQL', earn0.json.kpis.monthOrders === sqlMonthOrders, `${earn0.json.kpis.monthOrders} vs ${sqlMonthOrders}`)
  check('total de órdenes == SQL COUNT', earn0.json.total === sqlTotalOrders)

  // ---------- Usuarios QA y datos semilla ----------
  const pricing0 = await (await client()).req('/api/billing/plans')
  const paidChannel = pricing0.json.channels[0]
  const paidCourse = pricing0.json.courses[0]
  check('hay canal pago y curso pago semilla', !!paidChannel && !!paidCourse, JSON.stringify(pricing0.json.channels))

  const qaA = await client()
  const regA = await qaA.req('/api/auth/register', { method: 'POST', body: { name: 'QA Comprador A', email: 'qa17a@test.local', password: 'qa17pass-a' } })
  check('registro comprador A', regA.status === 200, `→ ${regA.status}`)
  const qaB = await client()
  const regB = await qaB.req('/api/auth/register', { method: 'POST', body: { name: 'QA Comprador B', email: 'qa17b@test.local', password: 'qa17pass-b' } })
  check('registro comprador B', regB.status === 200, `→ ${regB.status}`)
  qaUserIds = [regA.json.user.id, regB.json.user.id]

  // ---------- Moderador: lee Ingresos, no decide ----------
  const members = await admin.req('/api/admin/members')
  diegoId = members.json.members.find(m => m.email === 'diego@demo.local').id
  await admin.req(`/api/admin/members/${diegoId}/role`, { method: 'POST', body: { role: 'moderator' } })
  const mod = await client()
  await mod.login('diego@demo.local', 'demo1234')
  const modEarn = await mod.req('/api/admin/earnings')
  check('moderador VE Ingresos (200)', modEarn.status === 200, `→ ${modEarn.status}`)
  const modPending = await mod.req('/api/admin/earnings/pending')
  check('moderador NO ve la cola de pendientes (403)', modPending.status === 403, `→ ${modPending.status}`)

  // ---------- Moneda GTQ ----------
  const settingsRes = await admin.req('/api/admin/settings')
  originalSettings = settingsRes.json.settings
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
        ...patch,
      },
    })
  }
  const g1 = await putSettings({ currency: 'GTQ' })
  check('PUT ajustes moneda GTQ', g1.status === 200, `→ ${g1.status} ${g1.text?.slice(0, 120)}`)
  const pricingGtq = await (await client()).req('/pricing')
  check('/pricing en GTQ muestra «Q…»', /Q\s?9\.00/.test(pricingGtq.text), pricingGtq.text.match(/Q\s?[\d.]+/)?.[0] || 'sin Q')
  const chPage = await qaA.req(`/channels/${paidChannel.slug}`)
  check('página del canal pago en GTQ muestra «Q…»', /Q\s?[\d]/.test(chPage.text), '')
  const g2 = await putSettings({ currency: 'USD' })
  const pricingUsd = await (await client()).req('/pricing')
  check('volver a USD restaura «$…»', g2.status === 200 && /\$9\.00/.test(pricingUsd.text), '')

  // ---------- Pago manual: apagado al inicio ----------
  const offTry = await qaA.req('/api/billing/manual', { method: 'POST', body: { kind: 'channel', slug: paidChannel.slug, methodId: 1 } })
  check('pago manual con manuales apagados → 409', offTry.status === 409, `→ ${offTry.status}`)

  const method = await admin.req('/api/admin/manual-methods', { method: 'POST', body: { type: 'transferencia', title: 'QA Transferencia', details: 'Cuenta QA 000-111 a nombre de Pruebas.' } })
  check('admin crea método manual', method.status === 200 && method.json.method?.id > 0, `→ ${method.status}`)
  methodId = method.json.method.id
  const onTry = await putSettings({ manualPaymentsEnabled: true })
  check('interruptor de manuales ON', onTry.status === 200)
  const statusA = await qaA.req('/api/billing/status')
  check('status del comprador: manualEnabled true, Stripe sigue false', statusA.json.manualEnabled === true && statusA.json.enabled === false)
  const methodsForBuyer = await qaA.req('/api/billing/methods')
  check('el comprador ve el método con instrucciones', methodsForBuyer.json.methods.some(m => m.id === methodId && m.details.includes('Cuenta QA')))

  // ---------- Flujo completo: canal (aprobar) ----------
  const before = await qaA.req(`/api/channels/${paidChannel.slug}`)
  check('comprador A sin acceso al inicio', before.json ? !before.json.channel?.hasAccess : !before.text.includes('hasAccess":true'))
  const channelData = await qaA.req(`/api/channels/${paidChannel.slug}`)
  const lockedBefore = channelData.json ? channelData.json.posts.some(p => p.locked) : /"locked":true/.test(channelData.text)
  check('posts del canal pago llegan bloqueados (teaser)', lockedBefore === true)

  const buy1 = await qaA.req('/api/billing/manual', { method: 'POST', body: { kind: 'channel', slug: paidChannel.slug, methodId, reference: 'QA op 123' } })
  check('declarar pago manual → 200 pending', buy1.status === 200 && buy1.json.status === 'pending' && buy1.json.paymentId > 0, `→ ${buy1.status} ${buy1.text?.slice(0, 140)}`)
  const payId = buy1.json.paymentId
  createdPaymentIds.push(payId)

  const afterDeclare = await qaA.req(`/api/channels/${paidChannel.slug}`)
  const stillLocked = afterDeclare.json ? afterDeclare.json.posts.some(p => p.locked) && !afterDeclare.json.channel.hasAccess : true
  check('tras declarar, el canal SIGUE bloqueado (no concede nada)', stillLocked === true)

  const dup = await qaA.req('/api/billing/manual', { method: 'POST', body: { kind: 'channel', slug: paidChannel.slug, methodId } })
  check('segundo intento con pago pendiente → 409 en revisión', dup.status === 409, `→ ${dup.status}`)
  const dupCount = sqlVal(`SELECT COUNT(*) FROM payments WHERE user_id = ${qaUserIds[0]} AND kind = 'channel'`)
  check('no se creó fila duplicada', dupCount === 1, `count=${dupCount}`)

  const pending = await admin.req('/api/admin/earnings/pending')
  const row = pending.json.pending.find(p => p.id === payId)
  check('el admin ve el pago en Pagos pendientes con comprador/producto/método/referencia',
    !!row && row.buyerName === 'QA Comprador A' && row.methodTitle === 'QA Transferencia' && row.reference === 'QA op 123',
    JSON.stringify(row || null))

  const modApprove = await mod.req(`/api/admin/earnings/${payId}/approve`, { method: 'POST' })
  check('moderador NO puede aprobar (403)', modApprove.status === 403, `→ ${modApprove.status}`)

  const approve = await admin.req(`/api/admin/earnings/${payId}/approve`, { method: 'POST' })
  check('admin aprueba → 200', approve.status === 200, `→ ${approve.status} ${approve.text?.slice(0, 120)}`)
  const afterApprove = await qaA.req(`/api/channels/${paidChannel.slug}`)
  const unlocked = afterApprove.json ? afterApprove.json.channel.hasAccess && afterApprove.json.posts.every(p => !p.locked) : false
  check('tras aprobar, el comprador entra al canal completo', unlocked === true)
  const purchasesA = await qaA.req('/api/billing/purchases')
  check('el pago figura «paid» y gateway manual en Mis compras', purchasesA.json.payments.some(p => p.id === payId && p.status === 'paid' && p.gateway === 'manual'))
  const notifA = await qaA.req('/api/notifications')
  const notifText = JSON.stringify(notifA.json)
  check('el comprador recibió la notificación de aprobación', notifText.includes('pago fue aprobado'))
  const earn1 = await admin.req('/api/admin/earnings')
  const orderRow = earn1.json.orders.find(o => o.id === payId)
  check('la orden aparece en Ingresos: manual, pagada, monto del canal', !!orderRow && orderRow.gateway === 'manual' && orderRow.paymentStatus === 'paid' && orderRow.amountCents === paidChannel.priceCents)
  check('KPI total subió el monto del canal', earn1.json.kpis.totalRevenueCents === earn0.json.kpis.totalRevenueCents + paidChannel.priceCents,
    `${earn0.json.kpis.totalRevenueCents} → ${earn1.json.kpis.totalRevenueCents}`)

  // ---------- Flujo completo: curso (rechazar) ----------
  const buy2 = await qaB.req('/api/billing/manual', { method: 'POST', body: { kind: 'course', slug: paidCourse.slug, methodId, reference: 'QA curso' } })
  check('comprador B declara pago de curso → pending', buy2.status === 200 && buy2.json.status === 'pending' && buy2.json.paymentId > 0)
  const pay2Id = buy2.json.paymentId
  createdPaymentIds.push(pay2Id)
  const reject = await admin.req(`/api/admin/earnings/${pay2Id}/reject`, { method: 'POST' })
  check('admin rechaza → 200', reject.status === 200, `→ ${reject.status}`)
  const courseB = await qaB.req(`/api/courses/${paidCourse.slug}`)
  check('tras rechazar, B NO está inscrito', courseB.json ? !courseB.json.course.enrolled : !/"enrolled":true/.test(courseB.text))
  const purchasesB = await qaB.req('/api/billing/purchases')
  check('el pago figura «rejected»', purchasesB.json.payments.some(p => p.id === pay2Id && p.status === 'rejected'))
  const notifB = await qaB.req('/api/notifications')
  check('B recibió la notificación de rechazo', JSON.stringify(notifB.json).includes('no fue aprobado'))
  const enrollCount = sqlVal(`SELECT COUNT(*) FROM enrollments WHERE user_id = ${qaUserIds[1]}`)
  check('sin inscripción en la base para B', enrollCount === 0)

  // ---------- Planes: orden y destacado ----------
  const plansAdmin = await admin.req('/api/admin/plans')
  originalPlanOrder = plansAdmin.json.plans.map(p => p.id)
  const reversed = [...originalPlanOrder].reverse()
  const featuredPlan = plansAdmin.json.plans.find(p => p.id === reversed[0])
  const reo = await admin.req('/api/admin/plans/reorder', { method: 'POST', body: { order: reversed, featuredId: reversed[0] } })
  check('reordenar + destacar → 200', reo.status === 200, `→ ${reo.status}`)
  const pricingRe = await (await client()).req('/pricing')
  const idxFeatured = pricingRe.text.indexOf(featuredPlan.name)
  const idxOther = pricingRe.text.indexOf(plansAdmin.json.plans.find(p => p.id === reversed[1]).name)
  check('/pricing refleja el orden nuevo', idxFeatured >= 0 && idxOther > idxFeatured)
  check('/pricing marca el destacado', pricingRe.text.includes('Destacado') && pricingRe.text.includes('ring-warning'))
  const restoreOrder = await admin.req('/api/admin/plans/reorder', { method: 'POST', body: { order: originalPlanOrder, featuredId: null } })
  check('orden restaurado', restoreOrder.status === 200)
}
catch (e) {
  fail++
  console.log('ERROR de la corrida:', e.message)
}
finally {
  // ---------- Limpieza total ----------
  try {
    if (diegoId) await admin.req(`/api/admin/members/${diegoId}/role`, { method: 'POST', body: { role: 'member' } })
  } catch { /* sigue la limpieza por SQL */ }
  const ids = createdPaymentIds.filter(id => Number.isInteger(id) && id > 0).join(',') || '0'
  const users = qaUserIds.join(',') || '0'
  const stmts = [
    `DELETE FROM payments WHERE id IN (${ids})`,
    `DELETE FROM channel_access WHERE user_id IN (${users})`,
    `DELETE FROM enrollments WHERE user_id IN (${users})`,
    `DELETE FROM member_subscriptions WHERE user_id IN (${users})`,
    `DELETE FROM notifications WHERE user_id IN (${users})`,
    `DELETE FROM manual_payment_methods WHERE id = ${methodId || 0}`,
    `DELETE FROM memberships WHERE user_id IN (${users})`,
    `DELETE FROM users WHERE id IN (${users})`,
    `UPDATE tenants SET currency = 'USD', manual_payments_enabled = 0 WHERE id = 1`,
    `UPDATE plans SET featured = 0 WHERE tenant_id = 1`,
  ]
  if (originalPlanOrder.length) {
    originalPlanOrder.forEach((id, i) => stmts.push(`UPDATE plans SET display_order = ${i + 1}, sort = ${i + 1} WHERE id = ${id}`))
  }
  for (const s of stmts) { try { sql(s) } catch (e) { console.log('limpieza parcial:', s, e.message.slice(0, 100)) } }
  const leftPayments = sqlVal('SELECT COUNT(*) FROM payments')
  const leftMethods = sqlVal('SELECT COUNT(*) FROM manual_payment_methods')
  const tenantRow = sql('SELECT currency, manual_payments_enabled FROM tenants WHERE id = 1')[0]
  console.log(`Limpieza: payments=${leftPayments} (baseline), métodos=${leftMethods}, moneda=${tenantRow?.currency}, manuales=${tenantRow?.manual_payments_enabled}`)
  check('limpieza: tenant restaurado (USD, manuales apagados)', tenantRow?.currency === 'USD' && tenantRow?.manual_payments_enabled === 0)
  check('limpieza: sin métodos manuales', leftMethods === 0)
}

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`)
process.exit(fail ? 1 : 0)
