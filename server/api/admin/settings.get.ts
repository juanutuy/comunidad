// Ajustes de la comunidad (solo admin): datos editables del tenant.
// Fase 14: suma el bloque de ingreso de miembros (aprobación previa,
// preguntas, cooldown y canales de auto-ingreso) y la lista de
// canales para los selectores de auto-ingreso.
import { requireAdmin, resolveTenant } from '../../utils/community'
import { getJoinSettings } from '../../utils/members'
import { getPaymentSettings } from '../../utils/payments'
import { getPrivacySettings } from '../../utils/privacy'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  const db = await dbFor(event)
  const row = await db.prepare('SELECT terms, privacy, moderation_review, default_locale FROM tenants WHERE id = ?').get(tenant.id).catch(() => undefined) as { terms: string, privacy: string, moderation_review?: number, default_locale?: string } | undefined
  const join = await getJoinSettings(event, tenant.id)
  const priv = await getPrivacySettings(event, tenant.id)
  const pay = await getPaymentSettings(event, tenant.id)
  const channels = await db.prepare('SELECT id, name, slug, type FROM channels WHERE tenant_id = ? ORDER BY sort, name').all(tenant.id) as { id: number, name: string, slug: string, type: string }[]
  return {
    settings: {
      name: tenant.nameEs || tenant.name, nameEn: tenant.name_en || '', tagline: tenant.tagline, brandColor: tenant.brand_color,
      guidelines: JSON.parse(tenant.guidelines || '[]') as string[],
      terms: row?.terms || '', privacy: row?.privacy || '',
      // Fase 12: revisión previa opcional de publicaciones.
      moderationReview: !!row?.moderation_review,
      // Fase 18: idioma por defecto de la comunidad.
      defaultLocale: row?.default_locale === 'en' ? 'en' : 'es',
      // Fase 14: ingreso de miembros.
      joinApproval: join.approval,
      joinQuestions: join.questions,
      joinCooldownDays: join.cooldownDays,
      autoJoinChannels: join.autoJoinChannels,
      // Fase 15: privacidad y presentación (los bloques JSON van
      // resueltos contra los valores reales: el formulario siempre
      // edita la lista completa, nunca el JSON crudo).
      visibility: priv.visibility,
      directoryAudience: priv.directoryAudience,
      libraryAudience: priv.libraryAudience,
      paidPreviewMode: priv.paidPreviewMode,
      paidPreviewPct: priv.paidPreviewPct,
      paidPreviewChars: priv.paidPreviewChars,
      paidMediaMode: priv.paidMediaMode,
      paidTitleMode: priv.paidTitleMode,
      paidLockedWhere: priv.paidLockedWhere,
      feedSidebar: priv.feedSidebar,
      navMenu: priv.navMenu,
      anyoneCanRegister: priv.anyoneCanRegister,
      logoUrl: priv.logoUrl, logoDarkUrl: priv.logoDarkUrl,
      iconUrl: priv.iconUrl, faviconUrl: priv.faviconUrl,
      supportEmail: priv.supportEmail, websiteUrl: priv.websiteUrl,
      socialLinks: priv.socialLinks,
      // Fase 17: pagos — moneda del tenant y pagos manuales.
      currency: pay.currency,
      manualPaymentsEnabled: pay.manualPaymentsEnabled,
    },
    channels: channels.map(c => ({ id: c.id, name: c.name, slug: c.slug, type: c.type })),
  }
})
