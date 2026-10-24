import type { H3Event } from 'h3'
export function googleConfig(event: H3Event) {
  const config = useRuntimeConfig()
  const origin = String(config.googleOAuthOrigin).replace(/\/$/, '')
  let valid = false
  try { const url = new URL(origin); valid = url.origin === origin && (url.protocol === 'https:' || (import.meta.dev && url.hostname === 'localhost')) } catch { /* not configured */ }
  const enabled = valid && !!config.googleClientId && !!config.googleClientSecret && getRequestURL(event).origin === origin
  return { enabled, origin, redirectUri: `${origin}/api/auth/google/callback`, clientId: String(config.googleClientId), clientSecret: String(config.googleClientSecret) }
}
