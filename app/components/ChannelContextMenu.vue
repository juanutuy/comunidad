<script setup lang="ts">
// Menú «⋯» de UN canal (Fase 16-F): el mismo en el lateral, en el
// panel móvil, en el directorio y en la cabecera de la página del
// canal. Cada entrada hace algo real y respeta el rol que el
// servidor acepta: seguir/copiar ID para cualquier miembro; editar
// y precios SOLO admin (son el PUT/POST de canales); gestionar
// miembros para el equipo (admin/moderador, guard del endpoint);
// eliminar solo admin. SIN entrada «Paywalls»: el acceso pago es
// el precio del canal y «Precios» es su única puerta — una segunda
// entrada sería la redundancia que Juan caza. SIN «Lock Screen»:
// función no verificada en el original; no se inventa.
import type { DropdownMenuItem } from '@nuxt/ui'

export interface ChannelMenuData {
  id: number
  slug: string
  name: string
  description?: string
  type: string
  priceCents?: number
  contentType?: 'post' | 'image'
  coverUrl?: string
  visibility?: 'public' | 'private' | 'secret'
  groupId?: number | null
  postPermission?: string
  archived?: boolean
  following?: boolean
  hasAccess?: boolean
}

const props = withDefaults(defineProps<{ channel: ChannelMenuData, size?: 'xs' | 'sm', withCover?: boolean }>(), { size: 'xs', withCover: false })
const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin')
const isStaff = computed(() => ['admin', 'moderator', 'course_manager'].includes(user.value?.role || ''))
const coverInput = ref<HTMLInputElement | null>(null)
const uploadingCover = ref(false)

// Portada desde la cabecera del canal (con `withCover`, solo la
// página del canal): sube la imagen y la asigna con el MISMO PUT
// de canales que usa el modal — no hay una segunda vía de guardado.
async function onCoverSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  uploadingCover.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'channel')
    const up = await api<{ url: string }>('/api/uploads', { method: 'POST', body: fd })
    await api(`/api/admin/channels/${props.channel.id}`, { method: 'PUT', body: { coverUrl: up.url } })
    toast.add({ title: t('channel.coverUpdated'), color: 'success' })
    notifyChanged()
    await refreshNuxtData('layout-channels')
  }
  catch (err) {
    toast.add({ title: t('channel.coverFailed'), description: (err as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { uploadingCover.value = false }
}
const { t } = useI18n()
const api = useApi()
const toast = useToast()
const { openEdit } = useChannelEditor()
const { openMembers, askDeleteChannel, notifyChanged } = useChannelAdmin()

function editorData(): ChannelEditorData {
  const c = props.channel
  return {
    id: c.id, name: c.name, description: c.description || '',
    type: c.type, priceCents: c.priceCents || 0,
    contentType: c.contentType || 'post', coverUrl: c.coverUrl || '',
    visibility: c.visibility || 'public',
    postPermission: c.postPermission === 'staff' ? 'staff' : 'members',
    groupId: c.groupId ?? null, archived: !!c.archived,
  }
}

async function toggleFollow() {
  try {
    await api(`/api/channels/${props.channel.slug}/follow`, { method: 'POST' })
    notifyChanged()
    await refreshNuxtData('layout-channels')
  }
  catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message || t('channel.followChanged'), color: 'error' })
  }
}

async function copyId() {
  try {
    await navigator.clipboard.writeText(String(props.channel.id))
    toast.add({ title: t('channel.copiedId'), description: `#${props.channel.id}`, color: 'success' })
  }
  catch {
    toast.add({ title: t('channel.copyIdFailed'), description: `#${props.channel.id}`, color: 'error' })
  }
}

const items = computed<DropdownMenuItem[][]>(() => {
  const groupsArr: DropdownMenuItem[][] = []
  const main: DropdownMenuItem[] = []
  if (user.value) {
    main.push({
      label: props.channel.following ? t('channel.unfollow') : t('channel.follow'),
      icon: props.channel.following ? 'i-lucide-user-minus' : 'i-lucide-user-plus',
      onSelect: () => { void toggleFollow() },
    })
    main.push({ label: t('channel.menuCopyId'), icon: 'i-lucide-copy', onSelect: () => { void copyId() } })
  }
  if (main.length) groupsArr.push(main)
  const staff: DropdownMenuItem[] = []
  if (isAdmin.value) {
    if (props.withCover) {
      staff.push({
        label: props.channel.coverUrl ? t('channel.menuChangeCover') : t('channel.menuAddCover'),
        icon: 'i-lucide-image-plus',
        onSelect: () => coverInput.value?.click(),
      })
    }
    staff.push({ label: t('channel.menuEdit'), icon: 'i-lucide-pencil', onSelect: () => openEdit(editorData()) })
    staff.push({ label: t('channel.menuPrices'), icon: 'i-lucide-tag', onSelect: () => openEdit(editorData(), { focusPrice: true }) })
  }
  if (isStaff.value)
    staff.push({ label: t('channel.menuMembers'), icon: 'i-lucide-users', onSelect: () => openMembers({ id: props.channel.id, slug: props.channel.slug, name: props.channel.name }) })
  if (staff.length) groupsArr.push(staff)
  if (isAdmin.value) {
    groupsArr.push([{
      label: t('channel.menuDelete'), icon: 'i-lucide-trash-2', color: 'error',
      onSelect: () => askDeleteChannel({ id: props.channel.id, slug: props.channel.slug, name: props.channel.name }),
    }])
  }
  return groupsArr
})
</script>

<template>
  <span class="inline-flex">
    <UDropdownMenu v-if="items.length" :items="items" :content="{ align: 'end' }">
      <UButton
        icon="i-lucide-ellipsis" color="neutral" variant="ghost" :size="size"
        :aria-label="`# ${channel.name}`" :loading="uploadingCover"
        @click.prevent.stop
      />
    </UDropdownMenu>
    <input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="onCoverSelected">
  </span>
</template>
