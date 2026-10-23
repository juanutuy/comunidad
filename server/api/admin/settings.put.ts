// Guardar ajustes de la comunidad (solo admin). Lo guardado se refleja
// de inmediato en toda la UI (encabezado, portada y reglas) porque todo
// sale de la fila del tenant.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { dbFor } from '../../utils/db'
import { CURRENCIES } from '../../utils/money'
import { resolveNavMenu, resolveSidebar, resolveSocialLinks } from '../../utils/privacy'
import type { NavItem, SidebarBlock, SocialLink } from '../../utils/privacy'

interface SettingsBody {
  name?: string, nameEn?: string, tagline?: string, brandColor?: string, guidelines?: string[], terms?: string, privacy?: string
  moderationReview?: boolean
  // Fase 18: idioma por defecto de la comunidad ('es' | 'en').
  defaultLocale?: string
  joinApproval?: boolean, joinQuestions?: string[], joinCooldownDays?: number, autoJoinChannels?: number[]
  // Fase 15: privacidad y presentación.
  visibility?: string, directoryAudience?: string, libraryAudience?: string
  paidPreviewMode?: string, paidPreviewPct?: number, paidPreviewChars?: number
  paidMediaMode?: string, paidTitleMode?: string, paidLockedWhere?: string
  feedSidebar?: SidebarBlock[], navMenu?: NavItem[], anyoneCanRegister?: boolean
  logoUrl?: string, logoDarkUrl?: string, iconUrl?: string, faviconUrl?: string
  supportEmail?: string, websiteUrl?: string, socialLinks?: SocialLink[]
  // Fase 17: pagos.
  currency?: string, manualPaymentsEnabled?: boolean
}

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const body = await readBody<SettingsBody>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, message: 'La comunidad necesita un nombre.' })
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(body.brandColor || '') ? body.brandColor! : tenant.brand_color
  const guidelines = Array.isArray(body.guidelines)
    ? body.guidelines.map(g => String(g).trim()).filter(Boolean).slice(0, 20)
    : JSON.parse(tenant.guidelines || '[]') as string[]
  const db = await dbFor(event)
  const terms = typeof body.terms === 'string' ? body.terms.slice(0, 20000) : undefined
  const privacy = typeof body.privacy === 'string' ? body.privacy.slice(0, 20000) : undefined
  if (terms !== undefined || privacy !== undefined) {
    const current = await db.prepare('SELECT terms, privacy FROM tenants WHERE id = ?').get(tenant.id).catch(() => undefined) as { terms: string, privacy: string } | undefined
    await db.prepare('UPDATE tenants SET name = ?, tagline = ?, brand_color = ?, guidelines = ?, terms = ?, privacy = ? WHERE id = ?')
      .run(name, (body.tagline || '').trim(), brandColor, JSON.stringify(guidelines), terms ?? current?.terms ?? '', privacy ?? current?.privacy ?? '', tenant.id)
  }
  else {
    await db.prepare('UPDATE tenants SET name = ?, tagline = ?, brand_color = ?, guidelines = ? WHERE id = ?')
      .run(name, (body.tagline || '').trim(), brandColor, JSON.stringify(guidelines), tenant.id)
  }
  if (body.nameEn !== undefined) {
    if (typeof body.nameEn !== 'string' || body.nameEn.length > 120) throw createError({ statusCode: 400, message: 'Nombre en inglés inválido.' })
    await db.prepare('UPDATE tenants SET name_en = ? WHERE id = ?').run(body.nameEn.trim(), tenant.id)
  }
  // Fase 12: la revisión previa se guarda aparte para no tocar las
  // ramas de textos legales; si el cliente no la manda, no cambia.
  if (typeof body.moderationReview === 'boolean') {
    await db.prepare('UPDATE tenants SET moderation_review = ? WHERE id = ?')
      .run(body.moderationReview ? 1 : 0, tenant.id).catch(() => {})
  }
  // Fase 18: idioma por defecto de la comunidad — mismo patrón; solo
  // cambian los valores soportados ('es' | 'en'), otro valor es error.
  if (body.defaultLocale !== undefined) {
    if (body.defaultLocale !== 'es' && body.defaultLocale !== 'en')
      throw createError({ statusCode: 400, message: 'El idioma por defecto tiene que ser español o inglés.' })
    await db.prepare('UPDATE tenants SET default_locale = ? WHERE id = ?')
      .run(body.defaultLocale, tenant.id).catch(() => {})
  }
  // Fase 14: ingreso de miembros — mismo patrón: cada campo se guarda
  // solo si viene en el cuerpo, con sus validaciones (hasta 6
  // preguntas de 200 caracteres; cooldown entero 0–365; hasta 2
  // canales de auto-ingreso que existan en el tenant).
  if (typeof body.joinApproval === 'boolean') {
    await db.prepare('UPDATE tenants SET join_approval = ? WHERE id = ?')
      .run(body.joinApproval ? 1 : 0, tenant.id).catch(() => {})
  }
  if (Array.isArray(body.joinQuestions)) {
    const questions = body.joinQuestions.map(q => String(q).trim().slice(0, 200)).filter(Boolean).slice(0, 6)
    await db.prepare('UPDATE tenants SET join_questions = ? WHERE id = ?')
      .run(JSON.stringify(questions), tenant.id).catch(() => {})
  }
  if (body.joinCooldownDays !== undefined) {
    const days = Number(body.joinCooldownDays)
    if (!Number.isInteger(days) || days < 0 || days > 365)
      throw createError({ statusCode: 400, message: 'El tiempo de espera tras un rechazo tiene que ser un número de días entre 0 y 365.' })
    await db.prepare('UPDATE tenants SET join_cooldown_days = ? WHERE id = ?')
      .run(days, tenant.id).catch(() => {})
  }
  if (Array.isArray(body.autoJoinChannels)) {
    const ids = [...new Set(body.autoJoinChannels.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 2)
    for (const id of ids) {
      const ch = await db.prepare('SELECT id FROM channels WHERE tenant_id = ? AND id = ?').get(tenant.id, id)
      if (!ch) throw createError({ statusCode: 400, message: 'Uno de los canales de auto-ingreso no existe en esta comunidad.' })
    }
    await db.prepare('UPDATE tenants SET auto_join_channels = ? WHERE id = ?')
      .run(JSON.stringify(ids), tenant.id).catch(() => {})
  }
  // Fase 15: privacidad y presentación — mismo patrón que los bloques
  // anteriores: cada campo se guarda solo si viene en el cuerpo. Los
  // escalares se validan con error claro; las listas JSON (barra
  // lateral, menú, redes) se resuelven contra los valores reales y lo
  // inválido se descarta.
  const enumField = async (value: string | undefined, allowed: string[], column: string, message: string) => {
    if (value === undefined) return
    if (!allowed.includes(value)) throw createError({ statusCode: 400, message })
    await db.prepare(`UPDATE tenants SET ${column} = ? WHERE id = ?`).run(value, tenant.id).catch(() => {})
  }
  await enumField(body.visibility, ['private', 'public'], 'visibility', 'La visibilidad tiene que ser «private» o «public».')
  await enumField(body.directoryAudience, ['members', 'everyone', 'paid', 'disabled'], 'directory_audience', 'Audiencia del directorio inválida.')
  await enumField(body.libraryAudience, ['members', 'everyone'], 'library_audience', 'Audiencia de la biblioteca inválida.')
  await enumField(body.paidPreviewMode, ['preview', 'full', 'title'], 'paid_preview_mode', 'Modo de anticipo de canales pagos inválido.')
  await enumField(body.paidMediaMode, ['count', 'hide'], 'paid_media_mode', 'Modo de medios del anticipo inválido.')
  await enumField(body.paidTitleMode, ['full', '40', '60', '80', '120'], 'paid_title_mode', 'Modo de título del anticipo inválido.')
  await enumField(body.paidLockedWhere, ['feed', 'channel', 'hidden'], 'paid_locked_where', 'Valor inválido para dónde aparecen las publicaciones bloqueadas.')
  if (body.paidPreviewPct !== undefined) {
    const pct = Number(body.paidPreviewPct)
    if (!Number.isInteger(pct) || pct < 5 || pct > 50)
      throw createError({ statusCode: 400, message: 'El porcentaje del anticipo tiene que ser un entero entre 5 y 50.' })
    await db.prepare('UPDATE tenants SET paid_preview_pct = ? WHERE id = ?').run(pct, tenant.id).catch(() => {})
  }
  if (body.paidPreviewChars !== undefined) {
    const chars = Number(body.paidPreviewChars)
    if (!Number.isInteger(chars) || !(chars === 0 || (chars >= 150 && chars <= 2000)))
      throw createError({ statusCode: 400, message: 'El tope de caracteres del anticipo tiene que ser 0 (sin tope) o un entero entre 150 y 2000.' })
    await db.prepare('UPDATE tenants SET paid_preview_chars = ? WHERE id = ?').run(chars, tenant.id).catch(() => {})
  }
  if (typeof body.anyoneCanRegister === 'boolean') {
    await db.prepare('UPDATE tenants SET anyone_can_register = ? WHERE id = ?')
      .run(body.anyoneCanRegister ? 1 : 0, tenant.id).catch(() => {})
  }
  if (Array.isArray(body.feedSidebar)) {
    await db.prepare('UPDATE tenants SET feed_sidebar = ? WHERE id = ?')
      .run(JSON.stringify(resolveSidebar(body.feedSidebar)), tenant.id).catch(() => {})
  }
  if (Array.isArray(body.navMenu)) {
    await db.prepare('UPDATE tenants SET nav_menu = ? WHERE id = ?')
      .run(JSON.stringify(resolveNavMenu(body.navMenu)), tenant.id).catch(() => {})
  }
  // Marca: solo se aceptan archivos subidos por la propia plataforma
  // (quedan bajo /api/files/) o la cadena vacía para quitar la imagen.
  for (const [field, column] of [['logoUrl', 'logo_url'], ['logoDarkUrl', 'logo_dark_url'], ['iconUrl', 'icon_url'], ['faviconUrl', 'favicon_url']] as const) {
    const value = body[field]
    if (value === undefined) continue
    const url = String(value).trim()
    if (url !== '' && !url.startsWith('/api/files/') && !['/branding/servgt/symbol.svg', '/branding/servgt/symbol-black.svg', '/branding/servgt/favicon.ico'].includes(url))
      throw createError({ statusCode: 400, message: 'Las imágenes de marca tienen que subirse desde esta misma pantalla.' })
    await db.prepare(`UPDATE tenants SET ${column} = ? WHERE id = ?`).run(url.slice(0, 300), tenant.id).catch(() => {})
  }
  if (body.supportEmail !== undefined) {
    const email = String(body.supportEmail || '').trim().slice(0, 120)
    if (email !== '' && !email.includes('@'))
      throw createError({ statusCode: 400, message: 'El correo de soporte no parece válido.' })
    await db.prepare('UPDATE tenants SET support_email = ? WHERE id = ?').run(email, tenant.id).catch(() => {})
  }
  if (body.websiteUrl !== undefined) {
    const url = String(body.websiteUrl || '').trim().slice(0, 300)
    if (url !== '' && !/^https?:\/\//i.test(url))
      throw createError({ statusCode: 400, message: 'La dirección del sitio web tiene que empezar con http:// o https://.' })
    await db.prepare('UPDATE tenants SET website_url = ? WHERE id = ?').run(url, tenant.id).catch(() => {})
  }
  if (Array.isArray(body.socialLinks)) {
    await db.prepare('UPDATE tenants SET social_links = ? WHERE id = ?')
      .run(JSON.stringify(resolveSocialLinks(body.socialLinks)), tenant.id).catch(() => {})
  }
  // Fase 17: pagos — moneda del tenant e interruptor de pagos
  // manuales, mismo patrón (cada campo solo si viene en el cuerpo).
  // La moneda NO convierte montos: cambia cómo se interpretan y se
  // muestran los precios ya cargados (la UI lo advierte).
  if (body.currency !== undefined) {
    if (!CURRENCIES.some(c => c.code === body.currency))
      throw createError({ statusCode: 400, message: 'Moneda no válida.' })
    await db.prepare('UPDATE tenants SET currency = ? WHERE id = ?').run(body.currency, tenant.id).catch(() => {})
  }
  if (typeof body.manualPaymentsEnabled === 'boolean') {
    await db.prepare('UPDATE tenants SET manual_payments_enabled = ? WHERE id = ?')
      .run(body.manualPaymentsEnabled ? 1 : 0, tenant.id).catch(() => {})
  }
  return { ok: true, settings: { name, tagline: (body.tagline || '').trim(), brandColor, guidelines } }
})
