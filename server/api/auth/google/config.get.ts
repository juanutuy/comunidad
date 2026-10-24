import { currentAuth, resolveTenant } from '../../../utils/community'
import { googleConfig } from '../../../utils/googleOAuth'
import { dbFor } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const { user } = await currentAuth(event, tenant.id)
  setHeader(event, 'cache-control', 'private, no-store')
  const db = await dbFor(event)
  const linked = user ? !!await db.prepare("SELECT subject FROM oauth_identities WHERE tenant_id = ? AND user_id = ? AND provider = 'google'").get(tenant.id, user.id) : false
  return { enabled: googleConfig(event).enabled, linked }
})
