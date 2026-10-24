<script setup lang="ts">
import { BRAND_PRESETS } from '#shared/branding'
// Ajustes de la comunidad (Fase 11): antes vivían al pie del Panel
// (/admin); ahora son su propia sección de la consola, como en la
// referencia, con sub-navegación real: «General» (nombre, lema, color
// de marca y reglas) y «Textos legales» (términos y privacidad). Es un
// solo formulario y un solo guardado contra PUT /api/admin/settings:
// el submenú solo reparte los campos en las vistas.
// Fase 12: subsección «Moderación» con la revisión previa
// opcional de publicaciones (su propia subsección porque es un
// comportamiento con explicación, no un dato de identidad).
definePageMeta({ layout: 'admin' })
const { user, tenant, fetchMe } = useAuth()
const api = useApi()
const toast = useToast()
const route = useRoute()

interface SidebarBlockForm { key: string, visible: boolean, audience: 'members' | 'everyone' }
interface NavItemForm { id: string, label: string, url: string, visible: boolean, custom: boolean, zone: 'header' | 'sidebar' }
interface SocialLinkForm { platform: string, url: string }
interface SettingsData {
  settings: {
    name: string, nameEn?: string, tagline: string, brandColor: string, guidelines: string[], terms: string, privacy: string
    moderationReview?: boolean
    joinApproval?: boolean, joinQuestions?: string[], joinCooldownDays?: number, autoJoinChannels?: number[]
    // Fase 15: privacidad y presentación.
    visibility?: string, directoryAudience?: string, libraryAudience?: string
    paidPreviewMode?: string, paidPreviewPct?: number, paidPreviewChars?: number
    paidMediaMode?: string, paidTitleMode?: string, paidLockedWhere?: string
    feedSidebar?: SidebarBlockForm[], navMenu?: NavItemForm[], anyoneCanRegister?: boolean
    logoUrl?: string, logoDarkUrl?: string, iconUrl?: string, faviconUrl?: string, bannerUrl?: string
    supportEmail?: string, websiteUrl?: string, socialLinks?: SocialLinkForm[]
    // Fase 17: pagos.
    currency?: string, manualPaymentsEnabled?: boolean
    // Fase 18: idioma por defecto de la comunidad.
    defaultLocale?: string
  }
  channels: { id: number, name: string, slug: string, type: string }[]
}
const { data } = await useAsyncData('admin-settings', () =>
  user.value?.role === 'admin'
    ? api<SettingsData>('/api/admin/settings')
    : Promise.resolve(null))

const form = reactive({
  name: '', nameEn: '', tagline: '', brandColor: '#2563eb', guidelinesText: '', terms: '', privacy: '', moderationReview: false,
  // Fase 14: ingreso de miembros.
  joinApproval: false, joinQuestions: [] as string[], joinCooldownDays: 0, autoJoinChannels: [] as number[],
  // Fase 15: privacidad y presentación.
  visibility: 'private', directoryAudience: 'members', libraryAudience: 'members',
  paidPreviewMode: 'preview', paidPreviewPct: 25, paidPreviewChars: 350,
  paidMediaMode: 'count', paidTitleMode: 'full', paidLockedWhere: 'feed',
  feedSidebar: [] as SidebarBlockForm[], navMenu: [] as NavItemForm[],
  anyoneCanRegister: true,
  logoUrl: '', logoDarkUrl: '', iconUrl: '', faviconUrl: '', bannerUrl: '',
  supportEmail: '', websiteUrl: '', socialLinks: [] as SocialLinkForm[],
  // Fase 17: pagos.
  currency: 'USD', manualPaymentsEnabled: false,
  // Fase 18: idioma por defecto (cada miembro puede elegir el suyo
  // en su modal de Ajustes > Idioma; su elección manda sobre esta).
  defaultLocale: 'es',
})
watchEffect(() => {
  if (data.value?.settings) {
    form.name = data.value.settings.name
    form.nameEn = data.value.settings.nameEn || ''
    form.tagline = data.value.settings.tagline
    form.brandColor = data.value.settings.brandColor
    form.guidelinesText = data.value.settings.guidelines.join('\n')
    form.terms = data.value.settings.terms || ''
    form.privacy = data.value.settings.privacy || ''
    form.moderationReview = !!data.value.settings.moderationReview
    form.joinApproval = !!data.value.settings.joinApproval
    form.joinQuestions = [...(data.value.settings.joinQuestions || [])]
    form.joinCooldownDays = data.value.settings.joinCooldownDays || 0
    form.autoJoinChannels = [...(data.value.settings.autoJoinChannels || [])]
    form.visibility = data.value.settings.visibility || 'private'
    form.directoryAudience = data.value.settings.directoryAudience || 'members'
    form.libraryAudience = data.value.settings.libraryAudience || 'members'
    form.paidPreviewMode = data.value.settings.paidPreviewMode || 'preview'
    form.paidPreviewPct = data.value.settings.paidPreviewPct ?? 25
    form.paidPreviewChars = data.value.settings.paidPreviewChars ?? 350
    form.paidMediaMode = data.value.settings.paidMediaMode || 'count'
    form.paidTitleMode = data.value.settings.paidTitleMode || 'full'
    form.paidLockedWhere = data.value.settings.paidLockedWhere || 'feed'
    form.feedSidebar = (data.value.settings.feedSidebar || []).map(b => ({ ...b }))
    form.navMenu = (data.value.settings.navMenu || []).map(i => ({ ...i }))
    form.anyoneCanRegister = data.value.settings.anyoneCanRegister !== false
    form.logoUrl = data.value.settings.logoUrl || ''
    form.logoDarkUrl = data.value.settings.logoDarkUrl || ''
    form.iconUrl = data.value.settings.iconUrl || ''
    form.faviconUrl = data.value.settings.faviconUrl || ''
    form.bannerUrl = data.value.settings.bannerUrl || ''
    form.supportEmail = data.value.settings.supportEmail || ''
    form.websiteUrl = data.value.settings.websiteUrl || ''
    form.socialLinks = (data.value.settings.socialLinks || []).map(s => ({ ...s }))
    form.currency = data.value.settings.currency || 'USD'
    form.manualPaymentsEnabled = !!data.value.settings.manualPaymentsEnabled
    form.defaultLocale = data.value.settings.defaultLocale === 'en' ? 'en' : 'es'
  }
})

const subItems = [
  { value: 'general', label: 'General', icon: 'i-lucide-settings' },
  { value: 'privacidad', label: 'Privacidad', icon: 'i-lucide-lock' },
  { value: 'barra', label: 'Barra lateral del feed', icon: 'i-lucide-panel-right' },
  { value: 'menu', label: 'Menú de navegación', icon: 'i-lucide-menu' },
  { value: 'contacto', label: 'Contacto', icon: 'i-lucide-mail' },
  { value: 'pagos', label: 'Pagos', icon: 'i-lucide-banknote' },
  { value: 'legales', label: 'Textos legales', icon: 'i-lucide-scale' },
  { value: 'moderacion', label: 'Moderación', icon: 'i-lucide-shield-alert' },
  { value: 'ingreso', label: 'Ingreso de miembros', icon: 'i-lucide-user-plus' },
]
const TAB_VALUES = ['general', 'privacidad', 'barra', 'menu', 'contacto', 'pagos', 'legales', 'moderacion', 'ingreso']

// Fase 17: moneda del tenant y métodos de pago manual. La moneda se
// guarda con el botón general de la página; los métodos tienen su
// propio CRUD inmediato contra /api/admin/manual-methods.
const CURRENCY_OPTIONS = [
  { label: 'USD · Dólar estadounidense', value: 'USD' },
  { label: 'GTQ · Quetzal guatemalteco', value: 'GTQ' },
  { label: 'MXN · Peso mexicano', value: 'MXN' },
  { label: 'EUR · Euro', value: 'EUR' },
  { label: 'COP · Peso colombiano', value: 'COP' },
  { label: 'PEN · Sol peruano', value: 'PEN' },
  { label: 'ARS · Peso argentino', value: 'ARS' },
  { label: 'CLP · Peso chileno', value: 'CLP' },
  { label: 'BRL · Real brasileño', value: 'BRL' },
  { label: 'DOP · Peso dominicano', value: 'DOP' },
]
interface ManualMethodForm { id: number, type: string, title: string, details: string, active: boolean }
const { data: payStatus } = await useAsyncData('admin-pay-status', () =>
  user.value?.role === 'admin' ? api<{ enabled: boolean }>('/api/billing/status') : Promise.resolve(null))
const { data: methodsData, refresh: refreshMethods } = await useAsyncData('admin-manual-methods', () =>
  user.value?.role === 'admin' ? api<{ methods: ManualMethodForm[] }>('/api/admin/manual-methods') : Promise.resolve(null))
const METHOD_TYPE_OPTIONS = [
  { label: 'Transferencia bancaria', value: 'transferencia' },
  { label: 'Billetera / dinero móvil', value: 'billetera' },
  { label: 'Enlace de pago', value: 'enlace' },
  { label: 'Otro', value: 'otro' },
]
const methodTypeLabel = (t: string) => METHOD_TYPE_OPTIONS.find(o => o.value === t)?.label || 'Otro'
const newMethod = reactive({ type: 'transferencia', title: '', details: '' })
const creatingMethod = ref(false)
async function createMethod() {
  creatingMethod.value = true
  try {
    await api('/api/admin/manual-methods', { method: 'POST', body: { ...newMethod } })
    toast.add({ title: 'Método creado', color: 'success' })
    newMethod.title = ''; newMethod.details = ''
    await refreshMethods()
  }
  catch (e) { toast.add({ title: 'No se pudo crear el método', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' }) }
  finally { creatingMethod.value = false }
}
async function toggleMethod(m: ManualMethodForm) {
  await api(`/api/admin/manual-methods/${m.id}`, { method: 'PUT', body: { type: m.type, title: m.title, details: m.details, active: !m.active } })
  await refreshMethods()
}
async function removeMethod(m: ManualMethodForm) {
  if (!confirm(`¿Borrar el método «${m.title}»? Los pagos ya registrados no se tocan.`)) return
  await api(`/api/admin/manual-methods/${m.id}`, { method: 'DELETE' })
  toast.add({ title: 'Método borrado', color: 'success' })
  await refreshMethods()
}
const tab = computed(() => (TAB_VALUES.includes(String(route.query.tab || '')) ? String(route.query.tab) : 'general'))

// Fase 15: etiquetas y opciones de los bloques nuevos.
const SIDEBAR_LABELS: Record<string, string> = {
  upcoming_events: 'Próximos eventos', recent_posts: 'Publicaciones recientes',
  leaders: 'Top líderes', members: 'Miembros', online_now: 'En línea',
}
const audienceOptions = [
  { label: 'Solo miembros', value: 'members' },
  { label: 'Todos (también visitantes)', value: 'everyone' },
]
function move<T>(list: T[], i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const [item] = list.splice(i, 1)
  list.splice(j, 0, item!)
}
// El menú se edita por zona: subir/bajar mueve dentro de su zona.
function navZoneItems(zone: 'header' | 'sidebar') {
  return form.navMenu.map((item, index) => ({ item, index })).filter(x => x.item.zone === zone)
}
function moveNav(globalIndex: number, dir: -1 | 1) {
  const zone = form.navMenu[globalIndex]?.zone
  if (!zone) return
  const sameZone = navZoneItems(zone).map(x => x.index)
  const pos = sameZone.indexOf(globalIndex)
  const target = sameZone[pos + dir]
  if (target === undefined) return
  const [item] = form.navMenu.splice(globalIndex, 1)
  form.navMenu.splice(target, 0, item!)
}
const newLink = reactive({ label: '', url: '', zone: 'sidebar' as 'header' | 'sidebar' })
function addCustomLink() {
  const label = newLink.label.trim()
  const url = newLink.url.trim()
  if (!label || !url) return
  form.navMenu.push({ id: `custom-${Date.now().toString(36)}`, label, url, visible: true, custom: true, zone: newLink.zone })
  newLink.label = ''
  newLink.url = ''
}
function removeNavItem(index: number) {
  form.navMenu.splice(index, 1)
}
const SOCIAL_PLATFORM_OPTIONS = ['Facebook', 'X', 'Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'Discord'].map(p => ({ label: p, value: p }))
function addSocial() {
  form.socialLinks.push({ platform: 'Facebook', url: '' })
}
function removeSocial(i: number) {
  form.socialLinks.splice(i, 1)
}
// Subida de imágenes de marca (logos, icono, favicon): el archivo va
// por la vía de siempre y acá solo queda su URL hasta guardar.
const uploadingBrand = ref('')
async function onBrandFile(e: Event, field: 'logoUrl' | 'logoDarkUrl' | 'iconUrl' | 'faviconUrl' | 'bannerUrl') {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploadingBrand.value = field
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'branding')
    const up = await api<{ url: string }>('/api/uploads', { method: 'POST', body: fd })
    form[field] = up.url
  }
  catch (err) {
    toast.add({ title: 'No se pudo subir la imagen', description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploadingBrand.value = '' }
}

function addQuestion() {
  if (form.joinQuestions.length < 6) form.joinQuestions.push('')
}
function removeQuestion(i: number) {
  form.joinQuestions.splice(i, 1)
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: {
        name: form.name,
        nameEn: form.nameEn,
        tagline: form.tagline,
        brandColor: form.brandColor,
        guidelines: form.guidelinesText.split('\n').map(g => g.trim()).filter(Boolean),
        terms: form.terms,
        privacy: form.privacy,
        moderationReview: form.moderationReview,
        joinApproval: form.joinApproval,
        joinQuestions: form.joinQuestions,
        joinCooldownDays: Number(form.joinCooldownDays) || 0,
        autoJoinChannels: form.autoJoinChannels,
        // Fase 15: privacidad y presentación.
        visibility: form.visibility,
        directoryAudience: form.directoryAudience,
        libraryAudience: form.libraryAudience,
        paidPreviewMode: form.paidPreviewMode,
        paidPreviewPct: Number(form.paidPreviewPct) || 25,
        paidPreviewChars: Number(form.paidPreviewChars) || 0,
        paidMediaMode: form.paidMediaMode,
        paidTitleMode: form.paidTitleMode,
        paidLockedWhere: form.paidLockedWhere,
        feedSidebar: form.feedSidebar,
        navMenu: form.navMenu,
        anyoneCanRegister: form.anyoneCanRegister,
        logoUrl: form.logoUrl,
        logoDarkUrl: form.logoDarkUrl,
        iconUrl: form.iconUrl,
        faviconUrl: form.faviconUrl,
        bannerUrl: form.bannerUrl,
        supportEmail: form.supportEmail,
        websiteUrl: form.websiteUrl,
        socialLinks: form.socialLinks.filter(s => s.url.trim()),
        // Fase 17: pagos.
        currency: form.currency,
        manualPaymentsEnabled: form.manualPaymentsEnabled,
        // Fase 18: idioma por defecto de la comunidad.
        defaultLocale: form.defaultLocale,
      },
    })
    toast.add({ title: 'Ajustes guardados', color: 'success' })
    await fetchMe()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: 'No se pudieron guardar los ajustes', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { saving.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Ajustes de la comunidad</h1>
      <p class="text-muted">La identidad de {{ tenant?.name }} y sus textos públicos.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" description="Tu cuenta no tiene rol de administrador en esta comunidad." />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
      <AdminSubMenu :items="subItems" />
      <div class="min-w-0 flex-1 space-y-5">

      <UCard v-if="tab === 'general'">
        <div class="space-y-4">
          <UFormField label="Nombre de la comunidad (español)">
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="Nombre de la comunidad (inglés)" hint="Si está vacío, se usa el nombre en español.">
            <UInput v-model="form.nameEn" class="w-full" />
          </UFormField>
          <UFormField label="Lema / descripción corta">
            <UInput v-model="form.tagline" class="w-full" />
          </UFormField>
          <UFormField label="Banner de la comunidad" description="Portada que aparece en el feed y encima de los canales. Recomendado: imagen panorámica de al menos 1600 × 400 px.">
            <div class="space-y-3">
              <div v-if="form.bannerUrl" class="overflow-hidden rounded-lg border border-default">
                <img :src="form.bannerUrl" alt="Vista previa del banner de la comunidad" class="h-32 w-full object-cover sm:h-44">
              </div>
              <div class="flex items-center gap-2">
                <label class="cursor-pointer">
                  <UButton as="span" size="sm" variant="soft" icon="i-lucide-upload" :label="uploadingBrand === 'bannerUrl' ? 'Subiendo…' : form.bannerUrl ? 'Cambiar banner' : 'Subir banner'" :loading="uploadingBrand === 'bannerUrl'" />
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="e => onBrandFile(e, 'bannerUrl')">
                </label>
                <UButton v-if="form.bannerUrl" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" label="Quitar" @click="form.bannerUrl = ''" />
              </div>
            </div>
          </UFormField>
          <UFormField label="Color de marca">
            <div class="mb-3 flex flex-wrap gap-2">
              <button v-for="color in BRAND_PRESETS" :key="color" type="button" :aria-label="color"
                :aria-pressed="form.brandColor.toLowerCase() === color" class="h-10 w-10 rounded-full border-2 border-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                :style="{ backgroundColor: color }" @click="form.brandColor = color">
                <UIcon v-if="form.brandColor.toLowerCase() === color" name="i-lucide-check" class="size-5 text-white" />
              </button>
            </div>
            <div class="flex items-center gap-3">
              <input v-model="form.brandColor" type="color" class="h-10 w-16 cursor-pointer rounded-md border border-default bg-transparent">
              <UInput v-model="form.brandColor" class="w-32" />
              <span class="flex h-8 w-8 items-center justify-center rounded-lg font-bold text-white" :style="{ backgroundColor: form.brandColor }">{{ (form.name || 'C').charAt(0) }}</span>
            </div>
          </UFormField>
          <UFormField
            label="Idioma por defecto de la comunidad" class="max-w-sm"
            description="El idioma de la interfaz para visitantes y para los miembros que no eligieron uno propio en sus ajustes. Lo que escriben los miembros (publicaciones, cursos, eventos) no se traduce: solo cambia la interfaz."
          >
            <USelect
              v-model="form.defaultLocale" class="w-full"
              :items="[{ label: 'Español', value: 'es' }, { label: 'English', value: 'en' }]"
            />
          </UFormField>
          <UFormField label="Reglas de la comunidad" description="Una regla por línea. Se muestran en la página de Reglas.">
            <UTextarea v-model="form.guidelinesText" :rows="8" class="w-full" />
          </UFormField>

          <div class="border-t border-default pt-4">
            <p class="font-semibold">Marca</p>
            <p class="mt-1 text-sm text-muted">
              El logo se muestra en la barra superior según el tema de cada persona (claro u oscuro).
              Si falta el del tema, se usa el icono; y si no hay ninguno, la inicial con el color de marca.
              El favicon es el iconito de la pestaña del navegador.
            </p>
            <div class="mt-3 grid gap-4 sm:grid-cols-2">
              <div v-for="field in [
                { key: 'logoUrl' as const, label: 'Logo (tema claro)', hint: 'Imagen ancha, fondo transparente si podés.' },
                { key: 'logoDarkUrl' as const, label: 'Logo (tema oscuro)', hint: 'La versión que se lee sobre fondo oscuro.' },
                { key: 'iconUrl' as const, label: 'Icono', hint: 'Cuadrado, para espacios chicos.' },
                { key: 'faviconUrl' as const, label: 'Favicon', hint: 'Cuadrado y chico (32×32 o 64×64).' },
              ]" :key="field.key" class="rounded-lg border border-default p-3">
                <p class="text-sm font-medium">{{ field.label }}</p>
                <p class="text-xs text-muted">{{ field.hint }}</p>
                <div class="mt-2 flex items-center gap-3">
                  <span class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-elevated">
                    <img v-if="form[field.key]" :src="form[field.key]" :alt="field.label" class="max-h-full max-w-full object-contain">
                    <UIcon v-else name="i-lucide-image" class="text-muted" />
                  </span>
                  <label class="cursor-pointer">
                    <UButton as="span" size="sm" variant="soft" icon="i-lucide-upload" :label="uploadingBrand === field.key ? 'Subiendo…' : 'Subir'" :loading="uploadingBrand === field.key" />
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="e => onBrandFile(e, field.key)">
                  </label>
                  <UButton v-if="form[field.key]" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Quitar imagen" @click="form[field.key] = ''" />
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-start justify-between gap-4 border-t border-default pt-4">
            <div class="min-w-0">
              <p class="font-semibold">Cualquiera puede registrarse</p>
              <p class="mt-1 text-sm text-muted">
                Encendido, el registro es público (con la aprobación previa de la subsección «Ingreso de miembros» si la activás).
                Apagado, el registro se cierra: solo entra quien tenga una invitación o a quien des de alta a mano.
              </p>
            </div>
            <USwitch v-model="form.anyoneCanRegister" aria-label="Permitir el registro público" />
          </div>
        </div>
      </UCard>

      <UCard v-else-if="tab === 'privacidad'">
        <div class="space-y-6">
          <div>
            <p class="font-semibold">Quién puede ver la comunidad</p>
            <p class="mt-1 text-sm text-muted">
              Privada es como funcionó siempre: casi todo pide cuenta (el feed de canales abiertos se puede
              hojear, pero participar, buscar y el directorio son de miembros). Pública abre la lectura a
              visitantes: leen el feed y las publicaciones de los canales abiertos, las páginas de esos
              canales y — según las audiencias de abajo — el directorio y la biblioteca. Los canales
              privados no existen para un visitante, y los pagos solo se muestran como anticipo.
            </p>
            <URadioGroup
              v-model="form.visibility" class="mt-3"
              :items="[
                { label: 'Privada', value: 'private', description: 'La comunidad se vive con cuenta, como hasta ahora.' },
                { label: 'Pública', value: 'public', description: 'Cualquiera puede leer el contenido abierto sin registrarse.' },
              ]"
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Directorio de miembros" description="Quién puede abrir la página de Miembros. «Solo pagos» = miembros con acceso a un canal pago o una suscripción activa.">
              <USelect
                v-model="form.directoryAudience" class="w-full"
                :items="[
                  { label: 'Solo miembros', value: 'members' },
                  { label: 'Todos, también visitantes', value: 'everyone' },
                  { label: 'Solo miembros pagos', value: 'paid' },
                  { label: 'Desactivado', value: 'disabled' },
                ]"
              />
            </UFormField>
            <UFormField label="Biblioteca" description="Quién puede abrir la biblioteca de recursos.">
              <USelect
                v-model="form.libraryAudience" class="w-full"
                :items="[
                  { label: 'Solo miembros', value: 'members' },
                  { label: 'Todos, también visitantes', value: 'everyone' },
                ]"
              />
            </UFormField>
          </div>
          <UAlert
            v-if="form.visibility === 'private' && (form.directoryAudience === 'everyone' || form.libraryAudience === 'everyone')"
            color="warning" variant="soft" icon="i-lucide-info"
            title="Las audiencias «todos» necesitan la comunidad pública"
            description="Con la comunidad privada, un visitante igual tiene que iniciar sesión para estas superficies; la audiencia «todos» suma su efecto cuando la visibilidad es pública."
          />

          <div class="border-t border-default pt-4">
            <p class="font-semibold">Canales pagos: cuánto lee quien no compró</p>
            <p class="mt-1 text-sm text-muted">
              Quien compró el acceso siempre ve todo. Para el resto, el anticipo se arma con estas reglas
              y es el mismo en el feed, en el detalle, en el canal y en la búsqueda.
            </p>
            <div class="mt-3 grid gap-4 sm:grid-cols-2">
              <UFormField label="Cuánto se muestra">
                <USelect
                  v-model="form.paidPreviewMode" class="w-full"
                  :items="[
                    { label: 'Una vista previa (anticipo)', value: 'preview' },
                    { label: 'La publicación completa (solo lectura)', value: 'full' },
                    { label: 'Solo el título', value: 'title' },
                  ]"
                />
              </UFormField>
              <UFormField label="Dónde aparecen las publicaciones bloqueadas">
                <USelect
                  v-model="form.paidLockedWhere" class="w-full"
                  :items="[
                    { label: 'En el feed y en el canal', value: 'feed' },
                    { label: 'Solo en la página del canal', value: 'channel' },
                    { label: 'En ninguna parte hasta comprar', value: 'hidden' },
                  ]"
                />
              </UFormField>
              <UFormField label="Máximo del cuerpo en el anticipo (%)" description="Entre 5 y 50. Del cuerpo de cada publicación.">
                <UInput v-model.number="form.paidPreviewPct" type="number" min="5" max="50" class="w-28" />
              </UFormField>
              <UFormField label="Y nunca más de (caracteres)" description="Entre 150 y 2000; gana el límite menor de los dos. 0 = sin tope de caracteres.">
                <UInput v-model.number="form.paidPreviewChars" type="number" min="0" max="2000" step="50" class="w-28" />
              </UFormField>
              <UFormField label="Fotos y archivos del anticipo">
                <USelect
                  v-model="form.paidMediaMode" class="w-full"
                  :items="[
                    { label: 'Mostrar solo la cantidad', value: 'count' },
                    { label: 'Ocultar por completo', value: 'hide' },
                  ]"
                />
              </UFormField>
              <UFormField label="Títulos largos en el anticipo">
                <USelect
                  v-model="form.paidTitleMode" class="w-full"
                  :items="[
                    { label: 'Mostrar el título completo', value: 'full' },
                    { label: 'Acortar a 40 caracteres', value: '40' },
                    { label: 'Acortar a 60 caracteres', value: '60' },
                    { label: 'Acortar a 80 caracteres', value: '80' },
                    { label: 'Acortar a 120 caracteres', value: '120' },
                  ]"
                />
              </UFormField>
            </div>
            <UAlert
              color="neutral" variant="soft" icon="i-lucide-info" class="mt-3"
              title="Leer no es participar"
              description="Con la publicación completa en modo lectura, quien no compró puede leerla entera, pero comentar, reaccionar y votar siguen exigiendo el acceso al canal."
            />
          </div>
        </div>
      </UCard>

      <UCard v-else-if="tab === 'barra'">
        <div class="space-y-4">
          <div>
            <p class="font-semibold">Barra lateral del feed</p>
            <p class="mt-1 text-sm text-muted">
              Los bloques del riel derecho del feed, en el orden en que se muestran. «Todos» hace que el
              bloque también se vea para visitantes cuando la comunidad es pública; si no, es solo de miembros.
              Se guarda con el botón «Guardar ajustes», como el resto de esta página.
            </p>
          </div>
          <div v-for="(block, i) in form.feedSidebar" :key="block.key" class="flex flex-wrap items-center gap-3 rounded-lg border border-default p-3">
            <div class="flex flex-col">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-up" aria-label="Subir bloque" :disabled="i === 0" @click="move(form.feedSidebar, i, -1)" />
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-down" aria-label="Bajar bloque" :disabled="i === form.feedSidebar.length - 1" @click="move(form.feedSidebar, i, 1)" />
            </div>
            <p class="min-w-36 flex-1 font-medium">{{ SIDEBAR_LABELS[block.key] || block.key }}</p>
            <USelect v-model="block.audience" :items="audienceOptions" size="sm" class="w-52" />
            <USwitch v-model="block.visible" :aria-label="`Mostrar ${SIDEBAR_LABELS[block.key] || block.key}`" />
          </div>
        </div>
      </UCard>

      <UCard v-else-if="tab === 'menu'">
        <div class="space-y-6">
          <div>
            <p class="font-semibold">Menú de navegación</p>
            <p class="mt-1 text-sm text-muted">
              Lo que se ve en la barra superior (cabecera) y en el lateral de la comunidad — el panel móvil
              usa la misma lista. Los enlaces integrados se pueden renombrar, reordenar y ocultar, pero no
              borrar; los personalizados van a cualquier dirección y se abren en pestaña nueva si son externos.
            </p>
          </div>
          <div v-for="zone in [{ value: 'header' as const, label: 'Cabecera (barra superior)' }, { value: 'sidebar' as const, label: 'Lateral' }]" :key="zone.value">
            <p class="mb-2 text-sm font-semibold">{{ zone.label }}</p>
            <div class="space-y-2">
              <NavLinkEditor v-for="{ item, index } in navZoneItems(zone.value)" :key="item.id"
                v-model="form.navMenu[index]!" @move="moveNav(index, $event)" @remove="removeNavItem(index)" />
            </div>
          </div>
          <div class="rounded-lg border border-dashed border-default p-3">
            <p class="text-sm font-semibold">Agregar enlace personalizado</p>
            <div class="mt-2 flex flex-wrap items-end gap-2">
              <UFormField label="Texto">
                <UInput v-model="newLink.label" placeholder="Ej.: Nuestro blog" maxlength="60" />
              </UFormField>
              <UFormField label="Dirección">
                <UInput v-model="newLink.url" placeholder="https://… o /ruta" class="w-64" />
              </UFormField>
              <UFormField label="Zona">
                <USelect v-model="newLink.zone" :items="[{ label: 'Cabecera', value: 'header' }, { label: 'Lateral', value: 'sidebar' }]" />
              </UFormField>
              <UButton icon="i-lucide-plus" label="Agregar" :disabled="!newLink.label.trim() || !newLink.url.trim()" @click="addCustomLink" />
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-else-if="tab === 'contacto'">
        <div class="space-y-4">
          <div>
            <p class="font-semibold">Contacto</p>
            <p class="mt-1 text-sm text-muted">
              Estos datos aparecen al pie del lateral de la comunidad, en un bloque «Contacto».
              Si todo queda vacío, el bloque no se muestra.
            </p>
          </div>
          <UFormField label="Correo de soporte" description="El correo al que pueden escribir los miembros (y visitantes, si la comunidad es pública).">
            <UInput v-model="form.supportEmail" type="email" placeholder="soporte@tucomunidad.com" class="w-full" />
          </UFormField>
          <UFormField label="Sitio web">
            <UInput v-model="form.websiteUrl" placeholder="https://tucomunidad.com" class="w-full" />
          </UFormField>
          <div>
            <p class="text-sm font-semibold">Redes sociales</p>
            <div class="mt-2 space-y-2">
              <SocialLinkEditor v-for="(_, i) in form.socialLinks" :key="i" v-model="form.socialLinks[i]!"
                :platforms="SOCIAL_PLATFORM_OPTIONS" @remove="removeSocial(i)" />
              <UButton v-if="form.socialLinks.length < 10" size="sm" variant="soft" icon="i-lucide-plus" label="Agregar red social" @click="addSocial" />
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-else-if="tab === 'legales'">
        <div class="space-y-4">
          <UFormField label="Términos y condiciones" description="Se muestran en /terms. Si queda vacío se usa un texto por defecto.">
            <UTextarea v-model="form.terms" :rows="10" class="w-full" placeholder="Texto de términos de tu comunidad…" />
          </UFormField>
          <UFormField label="Política de privacidad" description="Se muestra en /privacy. Si queda vacío se usa un texto por defecto.">
            <UTextarea v-model="form.privacy" :rows="10" class="w-full" placeholder="Texto de privacidad de tu comunidad…" />
          </UFormField>
        </div>
      </UCard>

      <UCard v-else-if="tab === 'ingreso'">
        <div class="space-y-6">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="font-semibold">Aprobación previa para ingresar</p>
              <p class="mt-1 text-sm text-muted">
                Apagada, quien se registra entra de inmediato (lo más simple y lo que más convierte).
                Encendida, cada registro queda en revisión: la persona no puede entrar hasta que un administrador
                la apruebe desde <NuxtLink to="/admin/members/requests" class="text-primary hover:underline">Miembros → Solicitudes de ingreso</NuxtLink>.
                Las invitaciones y las altas manuales no pasan por esta revisión: ya son una decisión del equipo.
              </p>
            </div>
            <USwitch v-model="form.joinApproval" aria-label="Activar la aprobación previa para ingresar" />
          </div>

          <div>
            <p class="font-semibold">Preguntas de ingreso</p>
            <p class="mt-1 text-sm text-muted">
              Hasta 6 preguntas que la persona responde al registrarse (solo se preguntan con la aprobación previa encendida).
              Las respuestas llegan con la solicitud, para decidir con contexto. {{ form.joinQuestions.length }} de 6.
            </p>
            <div class="mt-3 space-y-2">
              <div v-for="(q, i) in form.joinQuestions" :key="i" class="flex items-center gap-2">
                <UInput v-model="form.joinQuestions[i]" class="flex-1" maxlength="200" placeholder="Ej.: ¿Qué querés aprender en esta comunidad?" />
                <UButton color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Quitar pregunta" @click="removeQuestion(i)" />
              </div>
              <UButton v-if="form.joinQuestions.length < 6" size="sm" variant="soft" icon="i-lucide-plus" label="Agregar pregunta" @click="addQuestion" />
            </div>
          </div>

          <UFormField label="Tiempo de espera tras un rechazo (días)" description="Cuánto tiene que esperar una persona rechazada antes de poder volver a solicitar el ingreso con el mismo correo. 0 = puede reintentar de inmediato. Rechazar no es suspender: una cuenta suspendida no vuelve por esta vía.">
            <UInput v-model.number="form.joinCooldownDays" type="number" min="0" max="365" class="w-28" />
          </UFormField>

          <div>
            <p class="font-semibold">Canales de auto-ingreso</p>
            <p class="mt-1 text-sm text-muted">
              Los canales a los que entra automáticamente todo miembro nuevo, llegue como llegue
              (registro aprobado, invitación o alta manual). Si un canal es privado, el auto-ingreso igual
              suma a la persona: es tu decisión al elegirlo acá.
            </p>
            <div class="mt-3 space-y-2">
              <UCheckbox v-for="channel in data?.channels || []" :key="channel.id" :label="channel.name"
                :model-value="form.autoJoinChannels.includes(channel.id)"
                @update:model-value="checked => form.autoJoinChannels = checked ? [...form.autoJoinChannels, channel.id] : form.autoJoinChannels.filter(id => id !== channel.id)" />
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-else-if="tab === 'pagos'">
        <div class="space-y-6">
          <div>
            <p class="font-semibold">Moneda de la comunidad</p>
            <p class="mt-1 text-sm text-muted">
              La moneda en la que se leen y se muestran todos los precios de la comunidad: planes, canales,
              cursos, ingresos y órdenes.
            </p>
            <div class="mt-3 max-w-sm">
              <USelect v-model="form.currency" :items="CURRENCY_OPTIONS" class="w-full" />
            </div>
            <UAlert
              class="mt-3" color="warning" variant="soft" icon="i-lucide-triangle-alert"
              title="Cambiar la moneda no convierte los montos"
              description="Los precios ya cargados quedan con el mismo número: solo cambia la moneda en la que se interpretan y se muestran. Si tus precios estaban pensados en otra moneda, ajustalos en Planes, Canales y Cursos después de cambiar."
            />
          </div>

          <div class="border-t border-default pt-5">
            <p class="font-semibold">Pagos con tarjeta (Stripe)</p>
            <p class="mt-1 text-sm text-muted">
              <template v-if="payStatus?.enabled">Los pagos en línea están <strong>activos</strong>: el checkout cobra con Stripe y el acceso se concede al confirmarse el pago.</template>
              <template v-else>Los pagos en línea están <strong>en oscuro</strong>: todavía no hay claves de Stripe cargadas en el servidor, así que ningún checkout cobra con tarjeta. Mientras tanto, la comunidad puede vender con pagos manuales (abajo) sin esperar a Stripe.</template>
            </p>
          </div>

          <div class="border-t border-default pt-5">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="font-semibold">Pagos manuales</p>
                <p class="mt-1 text-sm text-muted">
                  El comprador paga por fuera (transferencia, billetera, tu propio enlace), declara el pago
                  y queda <strong>en revisión</strong>: recién cuando lo aprobás desde
                  <NuxtLink to="/admin/earnings" class="text-primary hover:underline">Ingresos → Pagos pendientes</NuxtLink>
                  se concede el acceso. Declarar un pago no concede nada por sí solo.
                </p>
              </div>
              <USwitch v-model="form.manualPaymentsEnabled" aria-label="Activar los pagos manuales" />
            </div>

            <div class="mt-4 space-y-2">
              <div v-for="m in methodsData?.methods || []" :key="m.id" class="flex flex-wrap items-start gap-3 rounded-lg border border-default p-3">
                <div class="min-w-0 flex-1">
                  <p class="font-medium">{{ m.title }} <UBadge color="neutral" variant="subtle">{{ methodTypeLabel(m.type) }}</UBadge> <UBadge v-if="!m.active" color="warning" variant="subtle">Inactivo</UBadge></p>
                  <p class="mt-0.5 whitespace-pre-line text-sm text-muted">{{ m.details }}</p>
                </div>
                <UButton size="sm" color="neutral" variant="soft" :label="m.active ? 'Desactivar' : 'Activar'" @click="toggleMethod(m)" />
                <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Borrar método" @click="removeMethod(m)" />
              </div>
              <p v-if="!methodsData?.methods.length" class="text-sm text-muted">Todavía no hay métodos cargados: sin al menos uno activo, el pago manual no aparece en el checkout aunque el interruptor esté encendido.</p>
            </div>

            <div class="mt-4 rounded-lg bg-elevated/50 p-3">
              <p class="text-sm font-semibold">Agregar método</p>
              <div class="mt-2 grid gap-3 sm:grid-cols-2">
                <UFormField label="Tipo"><USelect v-model="newMethod.type" :items="METHOD_TYPE_OPTIONS" class="w-full" /></UFormField>
                <UFormField label="Título (lo ve el comprador)"><UInput v-model="newMethod.title" class="w-full" placeholder="Ej.: Transferencia Banco Industrial" /></UFormField>
              </div>
              <UFormField class="mt-3" label="Instrucciones (lo que ve el comprador al pagar)">
                <UTextarea v-model="newMethod.details" :rows="3" class="w-full" placeholder="Ej.: Cuenta monetaria 123-456789-0 a nombre de… Al pagar, anotá tu nombre en el concepto." />
              </UFormField>
              <div class="mt-3 flex justify-end">
                <UButton size="sm" label="Agregar método" icon="i-lucide-plus" :loading="creatingMethod" :disabled="!newMethod.title.trim() || !newMethod.details.trim()" @click="createMethod" />
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <UCard v-else>
        <div class="space-y-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="font-semibold">Revisión previa de publicaciones</p>
              <p class="mt-1 text-sm text-muted">
                Las publicaciones de miembros quedan en revisión hasta que un administrador las apruebe.
                Los administradores publican directamente. Las publicaciones en revisión no se ven en el
                feed ni suman puntos hasta ser aprobadas, y se gestionan desde
                <NuxtLink to="/admin/moderation?tab=revision" class="text-primary hover:underline">Moderación → En revisión</NuxtLink>.
              </p>
            </div>
            <USwitch v-model="form.moderationReview" aria-label="Activar la revisión previa de publicaciones" />
          </div>
          <UAlert
            color="neutral" variant="soft" icon="i-lucide-info"
            title="Las ediciones no pasan por revisión"
            description="La revisión previa aplica solo a publicaciones nuevas. Editar una publicación ya aprobada no la vuelve a mandar a la cola."
          />
        </div>
      </UCard>

      <div class="flex justify-end">
        <UButton label="Guardar ajustes" icon="i-lucide-save" :loading="saving" :disabled="!form.name.trim()" @click="save" />
      </div>
      </div>
      </div>
    </template>
  </div>
</template>
