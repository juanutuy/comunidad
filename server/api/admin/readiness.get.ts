import { requireAdmin, resolveTenant } from '../../utils/community'
import { communityPlatform } from '../../utils/provisioning'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  await requireAdmin(event, tenant.id)
  setHeader(event, 'cache-control', 'private, no-store')
  const config = useRuntimeConfig()
  const db = await dbFor(event)
  const domains = await db.prepare('SELECT domain FROM tenant_domains WHERE tenant_id = ? ORDER BY id').all(tenant.id)
  return {
    // Never return credentials or provider URLs: existence is all the UI needs.
    email: !!config.emailProviderUrl && !!config.emailProviderToken && !!config.emailFrom,
    stripe: !!config.stripeSecretKey && !!config.stripeWebhookSecret && !!config.public.stripePublishableKey,
    digest: !!config.cronSecret,
    branding: !!tenant.icon_url && !!tenant.logo_url,
    domains: domains.map(d => String(d.domain)),
    platform: communityPlatform(),
  }
})
