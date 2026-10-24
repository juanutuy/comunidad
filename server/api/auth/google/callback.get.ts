import { createHash, timingSafeEqual } from 'node:crypto'
import { currentAuth, resolveTenant } from '../../../utils/community'
import { setSession } from '../../../utils/auth'
import { dbFor, nowIso } from '../../../utils/db'
import { googleConfig } from '../../../utils/googleOAuth'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'referrer-policy', 'no-referrer')
  const config = googleConfig(event)
  if (!config.enabled) return sendRedirect(event, '/login?oauth=unavailable', 303)
  const query = getQuery(event)
  const state = typeof query.state === 'string' ? query.state : ''
  const cookie = getCookie(event, 'cm_google_state') || ''
  deleteCookie(event, 'cm_google_state', { path: '/api/auth/google' })
  if (!/^[\w-]{43}$/.test(state) || cookie.length !== state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) return sendRedirect(event, '/login?oauth=expired', 303)
  const tenant = await resolveTenant(event)
  const db = await dbFor(event)
  // DELETE RETURNING consumes the flow atomically, including cancellation/error callbacks.
  const flow = await db.prepare('DELETE FROM oauth_flows WHERE state_hash = ? AND tenant_id = ? AND expires_at > ? RETURNING user_id, token_version, verifier')
    .get(createHash('sha256').update(state).digest('hex'), tenant.id, Date.now())
  if (!flow || typeof query.code !== 'string' || query.code.length > 4096) return sendRedirect(event, '/login?oauth=expired', 303)
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: query.code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: flow.verifier }), signal: AbortSignal.timeout(15000) })
    const token = await response.json() as { access_token?: string }
    if (!response.ok || !token.access_token) throw new Error('OAuth exchange failed')
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15000) })
    const profile = await profileResponse.json() as { sub?: string, email_verified?: boolean }
    if (!profileResponse.ok || !profile.sub || profile.sub.length > 255 || profile.email_verified !== true) throw new Error('Unverified identity')
    if (flow.user_id) {
      const auth = await currentAuth(event, tenant.id)
      const row = await db.prepare('SELECT token_version FROM users WHERE id = ?').get(flow.user_id)
      if (auth.user?.id !== flow.user_id || !['active', 'restricted'].includes(auth.status || '') || row?.token_version !== flow.token_version) throw new Error('Link session changed')
      // Never merge accounts by email or overwrite another identity. Explicit password reauthentication occurred at start.
      await db.prepare("INSERT INTO oauth_identities (tenant_id, provider, subject, user_id, created_at) VALUES (?, 'google', ?, ?, ?)").run(tenant.id, profile.sub, flow.user_id, nowIso())
      return sendRedirect(event, '/settings?section=seguridad', 303)
    }
    const account = await db.prepare(`SELECT u.id, u.token_version, m.status FROM oauth_identities oi JOIN users u ON u.id = oi.user_id JOIN memberships m ON m.user_id = u.id AND m.tenant_id = oi.tenant_id WHERE oi.tenant_id = ? AND oi.provider = 'google' AND oi.subject = ?`).get(tenant.id, profile.sub)
    if (!account || !['active', 'restricted'].includes(account.status)) return sendRedirect(event, '/login?oauth=not-linked', 303)
    setSession(event, account.id, account.token_version ?? 0)
    return sendRedirect(event, '/feeds', 303)
  }
  catch { return sendRedirect(event, '/login?oauth=failed', 303) }
})
