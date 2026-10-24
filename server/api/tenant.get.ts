// Tenant actual (resuelto por subdominio del host; por defecto el demo)
// + usuario de la sesión si existe.
// Fase 14: la respuesta suma el estado de la membresía del usuario
// (status: active|pending|declined|suspended|restricted) para que la
// interfaz muestre la pantalla de estado cuando no hay acceso, y las
// compuertas por nivel que lo bloquean (gates) para avisar antes de
// ofrecer el compositor o los mensajes directos.
import { currentAuth, publicUser, resolveTenant } from '../utils/community'
import { resolveEventLocale } from '../utils/i18n'
import { myGateStates } from '../utils/members'
import { getPaymentSettings } from '../utils/payments'
import { getPrivacySettings } from '../utils/privacy'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user, role, status } = await currentAuth(event, tenant.id)
  // Fase 18: idioma resuelto del pedido (elección del usuario >
  // cookie > defecto de la comunidad > 'es') y sus dos fuentes, para
  // que la interfaz nazca en el idioma correcto también en SSR.
  const loc = await resolveEventLocale(event, tenant.id)
  const gates = user && status === 'active'
    ? await myGateStates(event, tenant.id, user.id, role).catch(() => null)
    : null
  // Fase 15: visibilidad, marca, contacto y menú resuelto — el layout
  // (logos por tema, favicon, navegación y bloque de contacto) se
  // alimenta de acá.
  const priv = await getPrivacySettings(event, tenant.id)
  // Fase 17: moneda del tenant (el formato de precios de TODA la UI
  // sale de acá) y si los pagos manuales están encendidos.
  const pay = await getPaymentSettings(event, tenant.id)
  return {
    tenant: {
      id: tenant.id, slug: tenant.slug, name: tenant.name, nameEs: tenant.nameEs, nameEn: tenant.name_en || tenant.nameEs, tagline: tenant.tagline,
      brandColor: tenant.brand_color,
      bannerUrl: tenant.banner_url || '',
      currency: pay.currency,
      manualPaymentsEnabled: pay.manualPaymentsEnabled,
      // Fase 18: idioma por defecto de la comunidad.
      defaultLocale: loc.defaultLocale,
      guidelines: JSON.parse(tenant.guidelines || '[]') as string[],
      visibility: priv.visibility,
      anyoneCanRegister: priv.anyoneCanRegister,
      logoUrl: priv.logoUrl, logoDarkUrl: priv.logoDarkUrl,
      iconUrl: priv.iconUrl, faviconUrl: priv.faviconUrl,
      supportEmail: priv.supportEmail, websiteUrl: priv.websiteUrl,
      socialLinks: priv.socialLinks,
      navMenu: priv.navMenu,
    },
    // Fase 18: la elección personal cruda viaja en el usuario (null =
    // sigue el defecto de la comunidad); `locale` es el RESUELTO.
    user: user && role ? { ...publicUser(user), role, locale: loc.userLocale } : null,
    status: user && role ? status : null,
    gates,
    locale: loc.locale,
  }
})
