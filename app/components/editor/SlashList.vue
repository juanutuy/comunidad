<script setup lang="ts">
// Lista del menú slash «/» del editor rico (Fase 8). La monta el
// plugin de sugerencias de TipTap vía VueRenderer; recibe los ítems
// ya filtrados por la búsqueda y ejecuta el elegido.
import { UIcon } from '#components'

export interface SlashItem {
  title: string
  hint: string
  icon: string
  command: (props: { editor: any, range: { from: number, to: number } }) => void
}

const props = defineProps<{ items: SlashItem[], command: (item: SlashItem) => void }>()
// Este componente lo monta TipTap con VueRenderer (fuera del árbol
// principal): usa plainT, que lee el idioma de la variable de
// módulo de useI18n en vez de un composable de Nuxt.
const selected = ref(0)
watch(() => props.items, () => { selected.value = 0 })

function onKeyDown(event: KeyboardEvent): boolean {
  if (event.key === 'ArrowUp') {
    selected.value = (selected.value + props.items.length - 1) % Math.max(props.items.length, 1)
    return true
  }
  if (event.key === 'ArrowDown') {
    selected.value = (selected.value + 1) % Math.max(props.items.length, 1)
    return true
  }
  if (event.key === 'Enter') {
    const item = props.items[selected.value]
    if (item) props.command(item)
    return true
  }
  return false
}
defineExpose({ onKeyDown })
</script>

<template>
  <div class="max-h-80 w-64 overflow-y-auto rounded-xl border border-default bg-default p-1.5 shadow-xl">
    <button
      v-for="(item, i) in items"
      :key="item.title"
      type="button"
      class="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition"
      :class="i === selected ? 'bg-primary/10 text-primary' : 'hover:bg-elevated'"
      @click="command(item)"
      @mouseenter="selected = i"
    >
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-default bg-default">
        <UIcon :name="item.icon" class="text-base" />
      </span>
      <span class="min-w-0">
        <span class="block font-medium leading-tight">{{ item.title }}</span>
        <span class="block truncate text-xs text-muted">{{ item.hint }}</span>
      </span>
    </button>
    <p v-if="!items.length" class="px-3 py-2 text-sm text-muted">{{ plainT('editor.noBlocksMatch') }}</p>
  </div>
</template>
