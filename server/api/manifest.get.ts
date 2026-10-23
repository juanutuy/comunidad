import { resolveTenant } from '../utils/community'
import { getPrivacySettings } from '../utils/privacy'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const brand = await getPrivacySettings(event, tenant.id)
  const locale = getQuery(event).locale === 'en' ? 'en' : 'es'
  const name = locale === 'en' ? tenant.name_en || tenant.nameEs || tenant.name : tenant.nameEs || tenant.name
  const servgt = brand.iconUrl === '/branding/servgt/symbol.svg'
  setHeader(event, 'content-type', 'application/manifest+json')
  setHeader(event, 'cache-control', 'private, no-store')
  return {
    id: '/', name, short_name: name, lang: locale, description: tenant.tagline,
    start_url: '/feeds', scope: '/', display: 'standalone',
    theme_color: tenant.brand_color, background_color: '#ffffff',
    icons: servgt ? [
      { src: '/branding/servgt/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/branding/servgt/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/branding/servgt/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ] : [{ src: brand.iconUrl || '/icons/icon-512.png', sizes: 'any', purpose: 'any' }],
  }
})
