// Estado de sesión compartido (usuario del tenant actual).
export interface SessionUser {
  id: number
  name: string
  slug: string
  email: string
  bio: string
  location: string
  memberSince: string
  role: string | null
}

export interface TenantInfo {
  id: number
  slug: string
  name: string
  tagline: string
  brandColor: string
  guidelines: string[]
}

export function useAuth() {
  const user = useState<SessionUser | null>('auth-user', () => null)
  const tenant = useState<TenantInfo | null>('auth-tenant', () => null)
  const api = useApi()

  async function fetchMe() {
    try {
      const data = await api<{ tenant: TenantInfo, user: SessionUser | null }>('/api/tenant')
      tenant.value = data.tenant
      user.value = data.user
    }
    catch {
      user.value = null
    }
  }

  async function login(email: string, password: string) {
    const data = await api<{ user: SessionUser }>('/api/auth/login', { method: 'POST', body: { email, password } })
    user.value = data.user
    return data.user
  }

  async function register(name: string, email: string, password: string) {
    const data = await api<{ user: SessionUser }>('/api/auth/register', { method: 'POST', body: { name, email, password } })
    user.value = data.user
    return data.user
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, tenant, fetchMe, login, register, logout }
}
