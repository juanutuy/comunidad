<script setup lang="ts">
const { fetchMe } = useAuth()
await fetchMe()
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
