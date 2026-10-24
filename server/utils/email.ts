// Correos transaccionales (Fase 4) — capa propia con proveedor HTTP
// genérico y comportamiento honesto:
//   - Si hay NUXT_EMAIL_PROVIDER_URL configurada, se hace POST JSON
//     { from, to, subject, text } con `Authorization: Bearer <token>`
//     (cuando hay NUXT_EMAIL_PROVIDER_TOKEN). Sirve para un relay de
//     Amazon SES o un servicio tipo Resend sin cambiar código.
//   - Si NO hay proveedor, el correo NO se envía: queda registrado en
//     email_log con estado 'skipped_no_provider'. Nunca se finge un envío.
// Todo intento queda en email_log (sent / skipped_no_provider / failed).
import type { H3Event } from 'h3'
import { dbFor, nowIso } from './db'

export interface EmailConfig { providerUrl: string, providerToken: string, from: string }

export function emailConfig(): EmailConfig {
  const cfg = useRuntimeConfig()
  return {
    providerUrl: (cfg.emailProviderUrl as string) || '',
    providerToken: (cfg.emailProviderToken as string) || '',
    from: (cfg.emailFrom as string) || 'Comunidad <hola@example.com>',
  }
}

export function emailEnabled(): boolean {
  return !!emailConfig().providerUrl
}

export interface SendEmailInput {
  idempotencyKey?: string
  tenantId: number
  userId?: number | null
  to: string
  kind: 'welcome' | 'digest' | 'notice'
  subject: string
  text: string
}

export async function sendEmail(event: H3Event, input: SendEmailInput): Promise<'sent' | 'skipped_no_provider' | 'failed'> {
  const cfg = emailConfig()
  const db = await dbFor(event)
  let status: 'sent' | 'skipped_no_provider' | 'failed' = 'skipped_no_provider'
  let detail = 'Sin proveedor de correo configurado (NUXT_EMAIL_PROVIDER_URL).'
  if (cfg.providerUrl) {
    try {
      const res = await fetch(cfg.providerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
          ...(cfg.providerToken ? { 'Authorization': `Bearer ${cfg.providerToken}` } : {}),
        },
        body: JSON.stringify({ from: cfg.from, to: input.to, subject: input.subject, text: input.text }),
        signal: AbortSignal.timeout(15000),
      })
      status = res.ok ? 'sent' : 'failed'
      detail = `Proveedor respondió HTTP ${res.status}.`
    }
    catch (e) {
      status = 'failed'
      detail = `Error llamando al proveedor: ${(e as Error).message}`.slice(0, 300)
    }
  }
  try {
    await db.prepare('INSERT INTO email_log (tenant_id, user_id, to_email, kind, subject, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(input.tenantId, input.userId ?? null, input.to, input.kind, input.subject, status, detail, nowIso())
  }
  catch { /* el registro nunca debe romper el flujo principal */ }
  return status
}
