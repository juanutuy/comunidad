import type { H3Event } from 'h3'
import { readSession } from './auth'
import { dbFor } from './db'

export function communityPlatform() {
  const config = useRuntimeConfig()
  const domain = String(config.communityBaseDomain).toLowerCase().trim()
  const validDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)
  return { domain: validDomain ? domain : '', enabled: config.communityCreationEnabled === true && validDomain }
}

export async function platformUser(event: H3Event) {
  const session = readSession(event)
  if (!session) throw createError({ statusCode: 401, message: 'Iniciá sesión para crear tu comunidad. / Sign in to create your community.' })
  const db = await dbFor(event)
  const user = await db.prepare('SELECT id, token_version FROM users WHERE id = ?').get(session.uid) as { id: number, token_version: number } | undefined
  if (!user || (user.token_version ?? 0) !== (session.v ?? 0)) throw createError({ statusCode: 401, message: 'Sesión no válida. / Invalid session.' })
  return user
}

export function validCommunitySlug(slug: string) {
  return /^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$/.test(slug)
    && !['hub', 'www', 'admin', 'api', 'app', 'mail', 'support', 'status', 'billing', 'login', 'servgt', 'assets', 'cdn', 'static', 'demo', 'test'].includes(slug)
}
