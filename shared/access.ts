/** Policies shared by HTTP handlers and Durable Objects. No framework dependencies. */
export interface ChannelAccessRow {
  id: number
  tenant_id: number
  type: string
  visibility?: string | null
  archived_at?: string | null
}
export type QueryOne = (sql: string, ...params: unknown[]) => Promise<any>
export const subscriptionCondition = "s.status = 'active' AND (s.current_period_end > ? OR (s.current_period_end = '' AND EXISTS (SELECT 1 FROM plans pl WHERE pl.id = s.plan_id AND pl.tenant_id = s.tenant_id AND pl.interval = 'once')))"

export async function activeSubscription(get: QueryOne, tenantId: number, userId: number): Promise<boolean> {
  return !!await get(`SELECT s.id FROM member_subscriptions s WHERE s.tenant_id = ? AND s.user_id = ? AND ${subscriptionCondition} LIMIT 1`, tenantId, userId, new Date().toISOString())
}

export function channelAccessDecision(channel: ChannelAccessRow, userId: number | null, role: string | null, direct: boolean, subscribed: boolean): boolean {
  if (channel.archived_at && role !== 'admin') return false
  if (role === 'admin' && userId) return true
  if (channel.type === 'free' && (!channel.visibility || channel.visibility === 'public')) return true
  if (!userId || !role) return false
  if (direct) return true
  if (channel.type === 'private') return true
  return channel.type === 'paid' && subscribed
}

export async function channelAccess(get: QueryOne, userId: number | null, role: string | null, channel: ChannelAccessRow): Promise<boolean> {
  if (channelAccessDecision(channel, userId, role, false, false)) return true
  if (!userId || !role || (channel.archived_at && role !== 'admin')) return false
  const direct = !!await get('SELECT id FROM channel_access WHERE tenant_id = ? AND user_id = ? AND channel_id = ?', channel.tenant_id, userId, channel.id)
  const subscribed = channel.type === 'paid' && !direct ? await activeSubscription(get, channel.tenant_id, userId) : false
  return channelAccessDecision(channel, userId, role, direct, subscribed)
}

export async function tenantForHost(get: QueryOne, rawHost: string) {
  const host = rawHost.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (host) {
    const domain = await get('SELECT t.* FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id WHERE d.domain = ?', host)
    if (domain) return domain
  }
  const sub = host.split('.')[0] || ''
  if (sub && !['localhost', 'www', '127'].includes(sub)) {
    const tenant = await get('SELECT * FROM tenants WHERE slug = ?', sub)
    if (tenant) return tenant
  }
  // Only local development and the Worker default domain use the default tenant.
  if (['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.workers.dev'))
    return get('SELECT * FROM tenants ORDER BY id LIMIT 1')
  return null
}

export function readableMembership(status: string | null | undefined): boolean {
  return status === 'active' || status === 'restricted'
}
