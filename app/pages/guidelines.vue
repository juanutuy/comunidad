<script setup lang="ts">
const { tenant } = useAuth()
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-bold">Reglas de la comunidad</h1>
      <p class="text-muted">Las reglas que toda persona miembro de {{ tenant?.name }} acepta al participar.</p>
    </div>
    <UCard>
      <ol class="space-y-4">
        <li v-for="(rule, i) in tenant?.guidelines || []" :key="i" class="flex gap-3">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-white">{{ i + 1 }}</span>
          <p class="pt-0.5 leading-relaxed">{{ rule }}</p>
        </li>
      </ol>
    </UCard>
  </div>
</template>
