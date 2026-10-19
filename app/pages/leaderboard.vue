<script setup lang="ts">
const api = useApi()
const { initials } = useFormat()
interface RankRow { id: number, name: string, slug: string, avatarUrl: string, posts: number, comments: number, reactionsReceived: number, points: number, level: string }
const { data } = await useAsyncData('leaderboard', () => api<{ ranking: RankRow[] }>('/api/leaderboard'))
const medals = ['text-amber-500', 'text-neutral-400', 'text-amber-700']
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Ranking de la comunidad</h1>
      <p class="text-muted">Puntos por actividad real: publicar suma 10, comentar 3 y cada reacción recibida 2. Niveles: Inicial (0), Activo (25), Colaborador (60), Referente (120) y Leyenda (250).</p>
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <ul class="divide-y divide-default">
        <li v-for="(r, i) in data?.ranking || []" :key="r.id" class="flex items-center gap-3 px-4 py-3">
          <span class="w-8 text-center font-bold" :class="medals[i] || 'text-muted'">{{ i + 1 }}</span>
          <UAvatar :src="r.avatarUrl || undefined" :text="initials(r.name)" />
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2">
              <NuxtLink :to="`/profile/${r.slug}`" class="font-semibold hover:underline">{{ r.name }}</NuxtLink>
              <UBadge color="primary" variant="subtle" size="sm" icon="i-lucide-award">{{ r.level }}</UBadge>
            </p>
            <p class="text-xs text-muted">{{ r.posts }} publicaciones · {{ r.comments }} comentarios · {{ r.reactionsReceived }} reacciones recibidas</p>
          </div>
          <UBadge color="primary" variant="soft" size="lg">{{ r.points }} pts</UBadge>
        </li>
      </ul>
    </UCard>
  </div>
</template>
