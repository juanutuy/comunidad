import { channelAccess, readableMembership } from '../shared/access.ts'

export const queryOne = env => (sql, ...params) => env.DB.prepare(sql).bind(...params).first()

export async function authorizeSocket(env, identity) {
  if (!identity || !Number.isFinite(identity.expiresAt) || identity.expiresAt <= Date.now()) return false
  const get = queryOne(env)
  const user = await get('SELECT token_version FROM users WHERE id = ?', identity.userId)
  if (!user || (user.token_version ?? 0) !== identity.sessionVersion) return false
  const member = await get('SELECT role, status FROM memberships WHERE tenant_id = ? AND user_id = ?', identity.tenantId, identity.userId)
  if (!member || !readableMembership(member.status)) return false
  const [kind, tenant, ...ids] = identity.room.split(':')
  if (Number(tenant) !== identity.tenantId) return false
  if (kind === 'user') return Number(ids[0]) === identity.userId
  if (kind === 'chan') {
    const channel = await get('SELECT * FROM channels WHERE tenant_id = ? AND id = ?', identity.tenantId, Number(ids[0]))
    return !!channel && await channelAccess(get, identity.userId, member.role, channel)
  }
  if (kind === 'dm') {
    if (!ids.map(Number).includes(identity.userId)) return false
    const otherId = ids.map(Number).find(id => id !== identity.userId)
    const other = await get('SELECT status FROM memberships WHERE tenant_id = ? AND user_id = ?', identity.tenantId, otherId)
    return !!other && readableMembership(other.status)
  }
  if (kind === 'room') {
    return !!await get(`SELECT m.id FROM chat_room_members m JOIN chat_rooms r ON r.id = m.room_id
      WHERE r.tenant_id = ? AND r.id = ? AND m.user_id = ?`, identity.tenantId, Number(ids[0]), identity.userId)
  }
  return false
}
