<script setup lang="ts">
// Barra inferior fija en teléfono (Fase 10): Inicio · Mensajes · Crear
// · Avisos · Menú. «Crear» no es decorativo: monta el PostComposer en
// modo «bare» (solo el disparador + su modal, que en teléfono abre a
// pantalla completa) y al publicar refresca el feed si está montado.
// Los badges salen de las mismas fuentes que la barra superior:
// Mensajes de /api/members (prop del layout) y Avisos del estado
// compartido useNotifBadge que también alimenta la campana.
defineProps<{ dmUnread: number }>()

const { user, tenant } = useAuth()
const { t } = useI18n()
const { unread: notifUnread } = useNotifBadge()
const { openPanel } = useMobilePanel()

function onPublished() {
  // Publicar es una acción deliberada y poco frecuente: se refrescan
  // los datos en pantalla (feed, canal abierto, canales del layout)
  // para que el post nuevo aparezca sin recargar la página.
  refreshNuxtData()
}

const itemClass = 'flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted transition'
</script>

<template>
  <nav
    v-if="user"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-default bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:bg-neutral-900/95 md:hidden"
    :aria-label="t('bottomBar.mobileNavigation')"
  >
    <div class="grid h-16 grid-cols-5">
      <NuxtLink to="/feeds" :class="itemClass" active-class="font-semibold text-primary">
        <UIcon name="i-lucide-home" class="text-[22px]" />
        {{ t('bottomBar.home') }}
      </NuxtLink>
      <NuxtLink to="/messages" :class="itemClass" class="relative" active-class="font-semibold text-primary">
        <span class="relative">
          <UIcon name="i-lucide-message-circle" class="text-[22px]" />
          <span v-if="dmUnread" class="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{{ dmUnread }}</span>
        </span>
        {{ t('bottomBar.messages') }}
      </NuxtLink>

      <PostComposer variant="bare" @published="onPublished">
        <template #trigger="{ openModal }">
          <button type="button" :class="itemClass" class="w-full" :aria-label="t('bottomBar.createPost')" @click="openModal()">
            <span class="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm" :style="{ backgroundColor: tenant?.brandColor || '#2563eb' }">
              <UIcon name="i-lucide-plus" class="text-xl" />
            </span>
            {{ t('bottomBar.create') }}
          </button>
        </template>
      </PostComposer>

      <NuxtLink to="/notifications" :class="itemClass" active-class="font-semibold text-primary">
        <span class="relative">
          <UIcon name="i-lucide-bell" class="text-[22px]" />
          <span v-if="notifUnread" class="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{{ notifUnread > 9 ? '9+' : notifUnread }}</span>
        </span>
        {{ t('bottomBar.notices') }}
      </NuxtLink>
      <button type="button" :class="itemClass" :aria-label="t('bottomBar.openMenu')" @click="openPanel">
        <UIcon name="i-lucide-menu" class="text-[22px]" />
        {{ t('bottomBar.menu') }}
      </button>
    </div>
  </nav>
</template>
