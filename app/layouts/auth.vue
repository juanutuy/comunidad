<script setup lang="ts">
const { tenant } = useAuth()
</script>

<template>
  <div class="flex min-h-screen items-center justify-center community-shell px-4 py-10">
    <div class="w-full max-w-md">
      <NuxtLink to="/feeds" class="mb-6 flex items-center justify-center gap-3 text-xl font-semibold">
        <img v-if="tenant?.iconUrl" :src="tenant.iconUrl" alt="" class="size-10 object-contain">
        <span>{{ tenant?.name }}</span>
      </NuxtLink>
      <slot />
    </div>
  </div>
</template>
