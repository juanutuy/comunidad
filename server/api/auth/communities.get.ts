import { communityPlatform, platformUser } from '../../utils/provisioning'
import { dbFor } from '../../utils/db'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'private, no-store')
  const platform = communityPlatform()
  const user = await platformUser(event)
  const db = await dbFor(event)
  const owned = await db.prepare('SELECT t.slug, t.name FROM community_owners o JOIN tenants t ON t.id = o.tenant_id WHERE o.user_id = ?').get(user.id)
  return { ...platform, owned: owned || null, limit: 1 }
})
