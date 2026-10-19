// Comunidad MVP — Nuxt 4 + Nuxt UI v4, deploy 100% Cloudflare Workers.
// Sin secretos en el código: la clave de sesión se sobrescribe con
// NUXT_SESSION_SECRET como secreto del Worker en producción.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: true,

  runtimeConfig: {
    // Solo servidor. Valor por defecto SOLO para desarrollo local.
    sessionSecret: process.env.NUXT_SESSION_SECRET || 'dev-only-cambiar-en-produccion',
    // Ruta del archivo SQLite local (en producción se usa el binding D1).
    dbPath: process.env.DB_PATH || '',
    public: {
      appName: 'Comunidad',
    },
  },

  nitro: {
    preset: 'cloudflare_module',
    externals: {
      // better-sqlite3 es el driver LOCAL (dev). En Cloudflare la capa de
      // datos usa el mismo esquema Drizzle contra D1 (ver server/db/schema.ts
      // y README): el binario nativo nunca se empaqueta en el Worker.
      external: ['better-sqlite3'],
    },
  },

  modules: ['@nuxt/ui'],

  // Iconos Lucide empaquetados localmente (sin CDN en runtime).
  icon: {
    serverBundle: { collections: ['lucide'] },
    clientBundle: { scan: true },
  },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Comunidad',
      htmlAttrs: { lang: 'es' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Plataforma de comunidades: canales, cursos, eventos y biblioteca.' },
      ],
    },
  },
})
