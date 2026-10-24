import { createHash, randomBytes } from 'node:crypto'
import { currentAuth, requireUser, resolveTenant } from '../../../utils/community'
import { verifyPassword } from '../../../utils/auth'
import { googleConfig } from '../../../utils/googleOAuth'
import { dbFor } from '../../../utils/db'
import { limitAuthAttempts } from '../../../utils/authLimits'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const config = googleConfig(event)
  if (!config.enabled) throw createError({ statusCode: 409, message: 'Google no está configurado para este dominio. / Google is not configured for this domain.' })
  const body = await readBody<{ link?: boolean, password?: string }>(event)
  const db = await dbFor(event)
  const { user } = await currentAuth(event, tenant.id)
  await limitAuthAttempts(event, user?.email || 'google-sign-in')
  let linkUser = 0
  let version = 0
  if (body.link === true) {
    const me = await requireUser(event, tenant.id)
    const row = await db.prepare('SELECT password_hash, token_version FROM users WHERE id = ?').get(me.id)
    if (typeof body.password !== 'string' || !verifyPassword(body.password, row.password_hash)) throw createError({ statusCode: 401, message: 'Confirmá tu contraseña actual. / Confirm your current password.' })
    linkUser = me.id
    version = row.token_version ?? 0
  }
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const now = Date.now()
  await db.prepare('DELETE FROM oauth_flows WHERE expires_at < ?').run(now)
  await db.prepare('INSERT INTO oauth_flows (state_hash, tenant_id, user_id, token_version, verifier, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(createHash('sha256').update(state).digest('hex'), tenant.id, linkUser, version, verifier, now + 600000)
  setCookie(event, 'cm_google_state', state, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/api/auth/google', maxAge: 600 })
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: 'openid email profile', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' })
  setHeader(event, 'cache-control', 'no-store')
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }
})
