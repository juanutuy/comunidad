// Estado de sesión compartido (usuario del tenant actual).
export interface SessionUser {
  id: number
  name: string
  slug: string
  email: string
  bio: string
  location: string
  avatarUrl: string
  memberSince: string
  role: string | null
  // Fase 18: elección personal de idioma (null = defecto de la comunidad).
  locale?: string | null
}

export interface NavItemInfo { id: string, label: string, url: string, visible: boolean, custom: boolean, zone: 'header' | 'sidebar' }
export interface SocialLinkInfo { platform: string, url: string }

export interface TenantInfo {
  id: number
  slug: string
  name: string
  tagline: string
  brandColor: string
  guidelines: string[]
  // Fase 15: visibilidad, registro, marca, contacto y menú resuelto.
  visibility?: string
  anyoneCanRegister?: boolean
  logoUrl?: string
  logoDarkUrl?: string
  iconUrl?: string
  faviconUrl?: string
  supportEmail?: string
  websiteUrl?: string
  socialLinks?: SocialLinkInfo[]
  navMenu?: NavItemInfo[]
  // Fase 17: moneda del tenant (formato de todos los precios) y
  // pagos manuales encendidos/apagados.
  currency?: string
  manualPaymentsEnabled?: boolean
  // Fase 18: idioma por defecto de la comunidad.
  defaultLocale?: string
}

// Fase 14: estado de una compuerta por nivel para el usuario actual
// (lo calcula el servidor en /api/tenant): si está bloqueada, la UI
// avisa en vez de ofrecer el control.
export interface GateState { blocked: boolean, levelName?: string, neededPoints?: number, myPoints?: number }
export interface MyGates { createPost: GateState, dm: GateState }

export function useAuth() {
  const user = useState<SessionUser | null>('auth-user', () => null)
  const tenant = useState<TenantInfo | null>('auth-tenant', () => null)
  // Fase 14: estado de la membresía (active|pending|declined|
  // suspended|restricted) y compuertas del usuario actual.
  const status = useState<string | null>('auth-status', () => null)
  const gates = useState<MyGates | null>('auth-gates', () => null)
  const api = useApi()
  // Fase 18: el composable de idioma se captura ACÁ, en la creación
  // (síncrona, con contexto de Nuxt activo). Llamarlo dentro de
  // fetchMe DESPUÉS del await rompía el SSR: sin contexto, useState
  // lanzaba, el catch anulaba el usuario y el idioma nunca se
  // aplicaba (el HTML nacía sin sesión y en español).
  const i18n = useI18n()

  const commentsState = useState<Record<number, unknown>>('post-comments', () => ({}))
  const realtimeState = useState<boolean | null>('rt-available', () => null)
  const nuxtApp = useNuxtApp()
  function resetPrivateState() {
    commentsState.value = {}
    realtimeState.value = null
    nuxtApp.runWithContext(() => clearNuxtData())
  }

  async function fetchMe() {
    try {
      const data = await api<{ tenant: TenantInfo, user: SessionUser | null, status?: string | null, gates?: MyGates | null, locale?: string }>('/api/tenant')
      if (user.value?.id !== data.user?.id || tenant.value?.id !== data.tenant?.id) resetPrivateState()
      tenant.value = data.tenant
      user.value = data.user
      status.value = data.status ?? null
      gates.value = data.gates ?? null
      // Fase 18: el idioma resuelto que calculó el servidor manda —
      // en SSR esto corre antes del primer render (app.vue espera
      // fetchMe), así la página nace en el idioma correcto.
      i18n.applyResolved(data.locale, data.user?.locale ?? null, data.tenant?.defaultLocale)
    }
    catch {
      user.value = null
    }
  }

  async function login(email: string, password: string) {
    const data = await api<{ user: SessionUser, status?: string }>('/api/auth/login', { method: 'POST', body: { email, password } })
    resetPrivateState()
    user.value = data.user
    status.value = data.status ?? 'active'
    await fetchMe()
    return data
  }

  async function register(name: string, email: string, password: string, extra?: { inviteToken?: string, answers?: string[] }) {
    const data = await api<{ user: SessionUser, status?: string }>('/api/auth/register', {
      method: 'POST',
      body: { name, email, password, inviteToken: extra?.inviteToken, answers: extra?.answers },
    })
    resetPrivateState()
    user.value = data.user
    status.value = data.status ?? 'active'
    await fetchMe()
    return data
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    resetPrivateState()
    user.value = null
    status.value = null
    gates.value = null
  }

  return { user, tenant, status, gates, fetchMe, login, register, logout }
}
