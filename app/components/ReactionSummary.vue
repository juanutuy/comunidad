<script setup lang="ts">
// Resumen de reacciones (Fase 16-G): los emojis más usados (hasta
// 3, como los trae el servidor en `reactionTop`) y el total. Sin
// reacciones no se pinta nada.
defineProps<{ top: string[], total: number, small?: boolean }>()
</script>

<template>
  <span v-if="total > 0" class="inline-flex items-center gap-1.5" :class="small ? 'text-xs' : 'text-sm'">
    <span class="inline-flex items-center" aria-hidden="true">
      <span
        v-for="(emoji, i) in top"
        :key="emoji"
        class="inline-flex items-center justify-center rounded-full bg-elevated ring-1 ring-default"
        :class="[small ? 'h-5 w-5 text-[11px]' : 'h-6 w-6 text-[13px]', i > 0 ? '-ml-1.5' : '']"
      >{{ emoji }}</span>
    </span>
    <span class="font-medium text-muted">{{ total }}</span>
  </span>
</template>
