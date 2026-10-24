// Comunidad MVP — Nuxt 4 + Nuxt UI v4, deploy 100% Cloudflare Workers.
// Sin secretos en el código: la clave de sesión se sobrescribe con
// NUXT_SESSION_SECRET como secreto del Worker en producción.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: true,

  runtimeConfig: {
    communityBaseDomain: process.env.NUXT_COMMUNITY_BASE_DOMAIN || 'servgt.com',
    communityCreationEnabled: process.env.NUXT_COMMUNITY_CREATION_ENABLED === 'true',
    // Solo servidor. Valor por defecto SOLO para desarrollo local.
    sessionSecret: process.env.NUXT_SESSION_SECRET || '',
    demoSeed: process.env.NUXT_DEMO_SEED !== 'false',
    // Ruta del archivo SQLite local (en producción se usa el binding D1).
    dbPath: process.env.DB_PATH || '',
    uploadsPath: process.env.NUXT_UPLOADS_PATH || '',
    // Fase 4 — Stripe (en oscuro hasta cargar los secretos del Worker
    // NUXT_STRIPE_SECRET_KEY / NUXT_STRIPE_WEBHOOK_SECRET; sin ellos la
    // app no cobra y la UI lo indica).
    stripeSecretKey: process.env.NUXT_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.NUXT_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '',
    // Fase 4 — Correos: proveedor HTTP genérico (POST JSON). Sin
    // NUXT_EMAIL_PROVIDER_URL los correos se registran como
    // 'skipped_no_provider' en email_log: nunca se finge un envío.
    emailProviderUrl: process.env.NUXT_EMAIL_PROVIDER_URL || process.env.EMAIL_PROVIDER_URL || '',
    emailProviderToken: process.env.NUXT_EMAIL_PROVIDER_TOKEN || process.env.EMAIL_PROVIDER_TOKEN || '',
    emailFrom: process.env.NUXT_EMAIL_FROM || process.env.EMAIL_FROM || 'Comunidad <hola@example.com>',
    // Fase 4 — Secreto compartido para disparar el digest por cron.
    cronSecret: process.env.NUXT_CRON_SECRET || process.env.CRON_SECRET || '',
    public: {
      appName: 'Comunidad',
      stripePublishableKey: process.env.NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
    },
  },

  nitro: {
    preset: process.env.NITRO_PRESET || 'cloudflare_module',
    externals: {
      // better-sqlite3 es el driver LOCAL (dev): la capa de datos
      // (server/utils/db.ts) lo importa de forma perezosa solo cuando NO
      // hay binding D1. En Cloudflare nunca se ejecuta ese camino ni se
      // necesita el binario nativo.
      external: ['better-sqlite3'],
    },
  },

  // Solo afecta al servidor de DESARROLLO (Vite): permite probar los
  // dominios personalizados por tenant con el header Host en local.
  // En producción (workerd) no hay esta restricción.
  vite: {
    server: { allowedHosts: ['.localhost', ...(process.env.NUXT_DEV_ALLOWED_HOSTS || '').split(',').filter(Boolean)] },
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
      title: 'ServGT',
      htmlAttrs: { lang: 'es' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Plataforma de comunidades: canales, cursos, eventos y biblioteca.' },
        // Fase 4 — PWA instalable.
        { name: 'theme-color', content: '#2563eb' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'ServGT' },
      ],
      link: [
        { rel: 'manifest', href: '/api/manifest' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/branding/servgt/icon-192.png' },
        { rel: 'apple-touch-icon', href: '/branding/servgt/icon-192.png' },
      ],
    },
  },
})
