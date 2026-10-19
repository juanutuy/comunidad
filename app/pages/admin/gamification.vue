<script setup lang="ts">
// Gamificación (solo admin, Fase 9): niveles e insignias de nivel y
// puntos por acción, editables por comunidad. Los niveles se guardan
// como lista completa (editar / agregar / eliminar en un solo guardado)
// y el servidor valida las guardas (base en 0, umbrales crecientes).
const { user, tenant } = useAuth()
const api = useApi()
const toast = useToast()

interface GamLevel { id: number, name: string, min: number, icon: string }
interface GamPoint { action: string, label: string, description: string, points: number }
interface GamData { levels: GamLevel[], points: GamPoint[] }
const { data, refresh } = await useAsyncData('admin-gamification', () =>
  user.value?.role === 'admin' ? api<GamData>('/api/admin/gamification') : Promise.resolve(null))

interface LevelDraft { name: string, min: number, icon: string }
const levels = ref<LevelDraft[]>([])
const points = reactive<Record<string, number>>({})
watchEffect(() => {
  if (data.value) {
    levels.value = data.value.levels.map(l => ({ name: l.name, min: l.min, icon: l.icon }))
    for (const p of data.value.points) points[p.action] = p.points
  }
})

function addLevel() {
  const maxMin = levels.value.reduce((acc, l) => Math.max(acc, Number(l.min) || 0), 0)
  levels.value.push({ name: 'Nuevo nivel', min: maxMin + 50, icon: 'i-lucide-star' })
}
function removeLevel(idx: number) {
  levels.value.splice(idx, 1)
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await api('/api/admin/gamification', {
      method: 'PUT',
      body: {
        levels: levels.value.map(l => ({ name: l.name, min: Number(l.min), icon: l.icon })),
        points: { ...points },
      },
    })
    toast.add({ title: 'Gamificación guardada', description: 'Los perfiles y el ranking ya usan los valores nuevos.', color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: 'No se pudo guardar', description: (e as { data?: { message?: string } }).data?.message || '', color: 'error' })
  }
  finally { saving.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Gamificación</h1>
      <p class="text-muted">Niveles, insignias y puntos de {{ tenant?.name }}. Los cambios se aplican de inmediato en perfiles y en el ranking.</p>
    </div>
    <UAlert v-if="user && user.role !== 'admin'" color="warning" variant="soft" title="Solo administradores" />
    <UAlert v-else-if="!user" color="neutral" variant="soft" title="Iniciá sesión con una cuenta administradora" />
    <template v-else>
      <AdminNav />

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="flex flex-1 items-center gap-2 font-bold"><UIcon name="i-lucide-trophy" /> Niveles e insignias</h2>
            <UButton size="sm" variant="soft" icon="i-lucide-plus" label="Agregar nivel" @click="addLevel" />
          </div>
        </template>
        <p class="mb-4 text-sm text-muted">
          Cada nivel es también la insignia que se ve en la tarjeta «Insignias ganadas» del perfil.
          El primer nivel tiene que empezar en <strong>0 puntos</strong> y los umbrales deben ir creciendo sin repetirse.
          El icono es un nombre de <a href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">Lucide</a> (por ejemplo <code>i-lucide-crown</code>).
        </p>
        <div class="space-y-3">
          <div v-for="(l, i) in levels" :key="i" class="flex flex-wrap items-end gap-3 rounded-lg border border-default p-3">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full bg-primary/10">
              <UIcon :name="l.icon || 'i-lucide-award'" class="text-xl text-primary" />
            </span>
            <UFormField label="Nombre" class="min-w-36 flex-1">
              <UInput v-model="l.name" class="w-full" />
            </UFormField>
            <UFormField label="Puntos mínimos" class="w-32">
              <UInput v-model.number="l.min" type="number" min="0" step="1" class="w-full" />
            </UFormField>
            <UFormField label="Icono" class="min-w-44 flex-1">
              <UInput v-model="l.icon" class="w-full" placeholder="i-lucide-star" />
            </UFormField>
            <UButton
              color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Eliminar nivel"
              :disabled="levels.length <= 1 || Number(l.min) === 0"
              :title="Number(l.min) === 0 ? 'El nivel base (0 puntos) no se puede eliminar' : 'Eliminar nivel'"
              @click="removeLevel(i)"
            />
          </div>
        </div>
        <p class="mt-3 text-xs text-muted">El orden de las insignias sale del umbral: al guardar, la lista se ordena de menor a mayor.</p>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="flex items-center gap-2 font-bold"><UIcon name="i-lucide-coins" /> Puntos por acción</h2>
        </template>
        <div class="space-y-3">
          <div v-for="p in data?.points || []" :key="p.action" class="flex flex-wrap items-center gap-3">
            <span class="min-w-52 flex-1">
              <span class="block text-sm font-medium">{{ p.label }}</span>
              <span class="block text-xs text-muted">{{ p.description }}</span>
            </span>
            <UInput v-model.number="points[p.action]" type="number" min="0" step="1" class="w-24" />
            <span class="text-sm text-muted">pts</span>
          </div>
        </div>
      </UCard>

      <div class="flex justify-end">
        <UButton label="Guardar gamificación" icon="i-lucide-save" :loading="saving" @click="save" />
      </div>
    </template>
  </div>
</template>
