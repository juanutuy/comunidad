// Validación compartida de los diseños de certificado (Fase 16).
export interface BlueprintInput {
  name: string
  accentColor: string
  headingText: string
  bodyText: string
  signerName: string
  signerTitle: string
  showLogo: boolean
  active?: boolean
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function parseBlueprintInput(body: Record<string, unknown>): BlueprintInput {
  const name = String(body.name || '').trim().slice(0, 80)
  if (!name) throw createError({ statusCode: 400, message: 'El diseño necesita un nombre.' })
  const accent = String(body.accentColor || '').trim()
  return {
    name,
    accentColor: HEX.test(accent) ? accent.toLowerCase() : '#2563eb',
    headingText: String(body.headingText || '').trim().slice(0, 160) || 'Certificado de finalización',
    bodyText: String(body.bodyText || '').trim().slice(0, 600) || 'por haber completado satisfactoriamente el curso {curso}.',
    signerName: String(body.signerName || '').trim().slice(0, 80),
    signerTitle: String(body.signerTitle || '').trim().slice(0, 80),
    showLogo: !!body.showLogo,
    active: body.active === undefined ? undefined : !!body.active,
  }
}
