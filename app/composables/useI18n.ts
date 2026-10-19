// Multilenguaje de la interfaz (Fase 18): catálogo propio es/en
// (app/i18n/) y resolución con la misma precedencia de la
// referencia — elección del usuario > defecto de la comunidad >
// idioma base 'es'. El estado nace en el servidor: app.vue espera
// /api/tenant (que devuelve el idioma RESUELTO) antes de renderizar,
// así el HTML ya sale en el idioma correcto, sin parpadeo, y el
// <html lang> lo refleja. Cambiar el idioma en Ajustes persiste en
// el servidor (PUT /api/settings/locale) y aplica al instante
// porque TODAS las cadenas pasan por t() de forma reactiva.
import { es } from '~/i18n/es'
import { en } from '~/i18n/en'

export type AppLocale = 'es' | 'en'
type Dict = typeof es

// Unión de claves con puntos («composer.publish») generada desde la
// estructura del diccionario base: una clave mal escrita no compila.
type KeyPaths<T> = T extends object
  ? { [K in keyof T & string]: T[K] extends string ? K : `${K}.${KeyPaths<T[K]>}` }[keyof T & string]
  : never
export type MessageKey = KeyPaths<Dict>

const DICTS: Record<AppLocale, Dict> = { es, en }

function flatten(dict: unknown, prefix: string, out: Map<string, string>) {
  for (const [key, value] of Object.entries(dict as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else if (value && typeof value === 'object') flatten(value, path, out)
  }
}
const FLAT: Record<AppLocale, Map<string, string>> = {
  es: new Map(), en: new Map(),
}
flatten(es, '', FLAT.es)
flatten(en, '', FLAT.en)

// Etiquetas por defecto (en español) de los ítems INTEGRADOS del
// menú de navegación: espejo de DEFAULT_NAV_ITEMS en
// server/utils/privacy.ts. Si la etiqueta guardada del tenant es la
// de por defecto, la interfaz la muestra traducida; si un admin la
// renombró, se respeta su texto tal cual (es contenido suyo).
export const NAV_DEFAULT_LABELS: Record<string, string> = {
  inicio: 'Inicio', cursos: 'Cursos', eventos: 'Eventos', miembros: 'Miembros',
  ranking: 'Ranking', videos: 'Videos', biblioteca: 'Biblioteca', precios: 'Precios',
  reglas: 'Reglas', terminos: 'Términos', privacidad: 'Privacidad',
}

export function useI18n() {
  const locale = useState<AppLocale>('i18n-locale', () => 'es')
  // Elección personal cruda (null = sigue el defecto de la comunidad)
  // y defecto del tenant: los necesita la sección «Idioma» de
  // Ajustes para pintar el estado real.
  const userLocale = useState<AppLocale | null>('i18n-user-locale', () => null)
  const tenantDefaultLocale = useState<AppLocale>('i18n-tenant-default', () => 'es')

  function t(key: MessageKey, params: Record<string, string | number> = {}): string {
    // Fallback en cadena: idioma activo → español (base) → la clave
    // (nunca debería verse: la paridad de diccionarios está testeada).
    let text = FLAT[locale.value].get(key) ?? FLAT.es.get(key) ?? key
    for (const [name, value] of Object.entries(params))
      text = text.replaceAll(`{${name}}`, String(value))
    return text
  }

  // Lo llama useAuth.fetchMe con la respuesta de /api/tenant: el
  // resuelto manda sobre el estado local (SSR y cliente coinciden).
  function applyResolved(resolved: string | undefined, userPref: string | null | undefined, tenantDefault: string | undefined) {
    locale.value = resolved === 'en' ? 'en' : 'es'
    userLocale.value = userPref === 'es' || userPref === 'en' ? userPref : null
    tenantDefaultLocale.value = tenantDefault === 'en' ? 'en' : 'es'
  }

  // Cambiar la elección personal: persiste en el servidor, fija la
  // cookie de idioma del lado cliente (la respuesta también la trae)
  // y aplica sin recargar.
  async function setUserLocale(pref: AppLocale | null) {
    const res = await useApi()<{ locale: AppLocale, userLocale: AppLocale | null }>('/api/settings/locale', {
      method: 'PUT', body: { locale: pref },
    })
    userLocale.value = res.userLocale
    locale.value = res.locale
    if (import.meta.client)
      document.cookie = `cm_locale=${res.locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    return res.locale
  }

  // Etiqueta visible de un ítem del menú de navegación del tenant:
  // integrados con su etiqueta por defecto → traducida; renombrados
  // y personalizados → el texto guardado, tal cual.
  function navLabel(item: { id: string, label: string, custom: boolean }): string {
    if (!item.custom && NAV_DEFAULT_LABELS[item.id] === item.label)
      return t(`nav.${item.id}` as MessageKey)
    return item.label
  }

  return { locale, userLocale, tenantDefaultLocale, t, applyResolved, setUserLocale, navLabel }
}
