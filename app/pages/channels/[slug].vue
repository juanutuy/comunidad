<script setup lang="ts">
import type { PostView } from '~/components/PostCard.vue'

const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { user } = useAuth()
const { fmtMoney } = useFormat()
const api = useApi()
const toast = useToast()

interface ChannelDetail {
  channel: { id: number, slug: string, name: string, icon: string, description: string, type: string, priceCents: number, following: boolean, hasAccess: boolean }
  posts: PostView[]
}
const { data, refresh } = await useAsyncData(() => `channel-${slug.value}`, () => api<ChannelDetail>(`/api/channels/${slug.value}`), { watch: [slug] })
const tab = ref('posts')
const tabItems = [
  { label: 'Publicaciones', value: 'posts', icon: 'i-lucide-newspaper' },
  { label: 'Chat', value: 'chat', icon: 'i-lucide-messages-square' },
]

async function toggleFollow() {
  if (!user.value) { toast.add({ title: 'Iniciá sesión para seguir canales', color: 'warning' }); return }
  await api(`/api/channels/${slug.value}/follow`, { method: 'POST' })
  await refresh()
}

async function demoAccess() {
  try {
    await api(`/api/channels/${slug.value}/access`, { method: 'POST' })
    toast.add({ title: 'Acceso demo activado', description: 'Ya podés ver el contenido completo de este canal.', color: 'success' })
    await refresh()
  }
  catch { toast.add({ title: 'No se pudo activar el acceso', color: 'error' }) }
}
</script>

<template>
  <div v-if="data" class="space-y-5">
    <UCard>
      <div class="flex flex-wrap items-start gap-4">
        <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-elevated">
          <UIcon :name="data.channel.icon" class="text-2xl" />
        </span>
        <div class="min-w-0 flex-1">
          <h1 class="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {{ data.channel.name }}
            <UBadge v-if="data.channel.type === 'paid'" color="warning" variant="subtle" icon="i-lucide-crown">
              Pago · {{ fmtMoney(data.channel.priceCents) }}
            </UBadge>
            <UBadge v-else-if="data.channel.type === 'private'" color="neutral" variant="subtle" icon="i-lucide-lock">
              Privado
            </UBadge>
            <UBadge v-else color="success" variant="subtle">
              Gratuito
            </UBadge>
          </h1>
          <p class="mt-1 text-muted">{{ data.channel.description }}</p>
        </div>
        <UButton
          :color="data.channel.following ? 'neutral' : 'primary'"
          :variant="data.channel.following ? 'soft' : 'solid'"
          :icon="data.channel.following ? 'i-lucide-check' : 'i-lucide-plus'"
          :label="data.channel.following ? 'Siguiendo' : 'Seguir'"
          @click="toggleFollow"
        />
      </div>
      <UAlert v-if="data.channel.type === 'paid' && !data.channel.hasAccess" class="mt-4" color="warning" variant="soft" icon="i-lucide-lock" title="Este es un canal pago" description="Con acceso ves todas las publicaciones completas y participás en la conversación. El pago real con tarjeta llega en la próxima fase; por ahora podés activar el acceso de demostración.">
        <template #actions>
          <UButton v-if="user" size="sm" color="warning" label="Acceso demo" icon="i-lucide-key-round" @click="demoAccess" />
          <UButton v-else size="sm" to="/login" label="Iniciar sesión" />
        </template>
      </UAlert>
    </UCard>

    <UTabs v-model="tab" :items="tabItems">
      <template #content="{ item }">
        <div v-if="item.value === 'posts'" class="mt-4 space-y-5">
          <PostCard v-for="post in data.posts" :key="post.id" :post="post" @changed="refresh" />
          <UAlert v-if="!data.posts.length" color="neutral" variant="soft" title="Sin publicaciones todavía" description="Sé la primera persona en publicar en este canal desde el feed." />
        </div>
        <UCard v-else class="mt-4">
          <ChannelChat v-if="user && data.channel.hasAccess" :slug="slug" />
          <UAlert v-else-if="!user" color="neutral" variant="soft" icon="i-lucide-lock" title="Iniciá sesión para usar el chat" description="El chat de cada canal es solo para miembros con acceso a ese canal.">
            <template #actions>
              <UButton size="sm" to="/login" label="Iniciar sesión" />
            </template>
          </UAlert>
          <UAlert v-else color="warning" variant="soft" icon="i-lucide-lock" title="Sin acceso al chat de este canal" description="El chat sigue las mismas reglas que las publicaciones: necesitás acceso a este canal para participar." />
        </UCard>
      </template>
    </UTabs>
  </div>
</template>
