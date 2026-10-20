<script setup lang="ts">
// Selector de reacción (Fase 16-G): popover con la cuadrícula del
// catálogo de emojis, compartido por publicaciones y comentarios.
// Elegir un emoji emite `select` (el servidor decide si crea,
// reemplaza o quita) y cierra el popover. El emoji propio, si hay,
// se marca con fondo.
import { REACTION_CATALOG } from '~/utils/reactions'

const props = defineProps<{ myReaction?: string | null, disabled?: boolean }>()
const emit = defineEmits<{ select: [emoji: string] }>()
const open = ref(false)

function pick(emoji: string) {
  open.value = false
  emit('select', emoji)
}
</script>

<template>
  <UPopover v-model:open="open">
    <slot />
    <template #content>
      <div class="grid max-w-70 grid-cols-7 gap-0.5 p-2">
        <button
          v-for="emoji in REACTION_CATALOG"
          :key="emoji"
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:scale-125 hover:bg-elevated"
          :class="props.myReaction === emoji ? 'bg-primary/15 ring-1 ring-primary' : ''"
          :disabled="props.disabled"
          @click="pick(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </template>
  </UPopover>
</template>
