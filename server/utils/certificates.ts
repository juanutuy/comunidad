// Certificados (Fase 16): diseños reutilizables (blueprints) y
// emisión con FOTO del diseño. Hasta esta fase el certificado se
// calculaba al momento con un diseño fijo; ahora, la primera vez
// que un miembro elegible abre su certificado, se EMITE un registro
// en `certificates` con un código único de verificación y una copia
// (snapshot) del diseño vigente: editar el blueprint después NO
// altera los certificados ya emitidos. La verificación pública
// (/verify/[code]) lee ese registro, sin sesión y sin exponer
// correos ni otros datos del miembro.
import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { dbFor, nowIso } from './db'
import type { TenantRow, UserRow } from './community'

export interface CertDesign {
  blueprintId: number | null
  blueprintName: string
  accentColor: string
  headingText: string
  bodyText: string
  signerName: string
  signerTitle: string
  showLogo: boolean
}

// Diseño por defecto del sistema: el equivalente al certificado
// histórico (borde y acento con el color de marca del tenant), para
// los cursos sin blueprint elegido. El cuerpo lleva los marcadores
// todavía sin reemplazar; se reemplazan al emitir.
export function defaultDesign(tenant: TenantRow): CertDesign {
  return {
    blueprintId: null,
    blueprintName: 'Diseño por defecto del sistema',
    accentColor: tenant.brand_color || '#2563eb',
    headingText: 'Certificado de finalización',
    bodyText: 'por haber completado satisfactoriamente el curso {curso}.',
    signerName: '',
    signerTitle: '',
    showLogo: false,
  }
}

interface BlueprintRow {
  id: number, name: string, accent_color: string, heading_text: string, body_text: string
  signer_name: string, signer_title: string, show_logo: number, active: number
}

export function blueprintToDesign(b: BlueprintRow): CertDesign {
  return {
    blueprintId: b.id,
    blueprintName: b.name,
    accentColor: b.accent_color || '#2563eb',
    headingText: b.heading_text || 'Certificado de finalización',
    bodyText: b.body_text || 'por haber completado satisfactoriamente el curso {curso}.',
    signerName: b.signer_name || '',
    signerTitle: b.signer_title || '',
    showLogo: !!b.show_logo,
  }
}

// El diseño vigente para un curso: su blueprint si está elegido Y
// activo; si no, el diseño por defecto del sistema.
export async function resolveCourseDesign(event: H3Event, tenant: TenantRow, course: Record<string, unknown>): Promise<CertDesign> {
  const blueprintId = course.certificate_blueprint_id ? Number(course.certificate_blueprint_id) : null
  if (blueprintId) {
    try {
      const db = await dbFor(event)
      const b = await db.prepare('SELECT * FROM certificate_blueprints WHERE id = ? AND tenant_id = ? AND active = 1').get(blueprintId, tenant.id) as BlueprintRow | undefined
      if (b) return blueprintToDesign(b)
    }
    catch { /* tabla ausente en bases muy viejas: diseño por defecto */ }
  }
  return defaultDesign(tenant)
}

export function renderMarkers(text: string, values: { nombre: string, curso: string, fecha: string }): string {
  return text
    .replaceAll('{nombre}', values.nombre)
    .replaceAll('{curso}', values.curso)
    .replaceAll('{fecha}', values.fecha)
}

export function formatCertDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  catch { return d.toISOString().slice(0, 10) }
}

// Código de verificación: legible, sin caracteres ambiguos
// (0/O, 1/I/L), con prefijo propio. Único en toda la plataforma
// (índice UNIQUE en la tabla); ante una colisión se reintenta.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generateCertCode(): string {
  const bytes = randomBytes(10)
  let out = ''
  for (let i = 0; i < 10; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]
  return `CERT-${out.slice(0, 5)}-${out.slice(5)}`
}

export interface IssuedCertificate {
  id: number, code: string, memberName: string, courseTitle: string, communityName: string
  finishedAt: string, issuedAt: string, design: CertDesign
}

interface CertificateRow {
  id: number, code: string, member_name: string, course_title: string, community_name: string
  finished_at: string, issued_at: string, design_snapshot: string
}

function rowToIssued(r: CertificateRow): IssuedCertificate {
  let design: CertDesign
  try { design = JSON.parse(r.design_snapshot) as CertDesign }
  catch { design = { blueprintId: null, blueprintName: '', accentColor: '#2563eb', headingText: 'Certificado de finalización', bodyText: '', signerName: '', signerTitle: '', showLogo: false } }
  return {
    id: r.id, code: r.code, memberName: r.member_name, courseTitle: r.course_title,
    communityName: r.community_name, finishedAt: r.finished_at, issuedAt: r.issued_at, design,
  }
}

// Emitir (o recuperar) el certificado de un miembro en un curso. La
// emisión congela: nombre del miembro, título del curso, nombre de
// la comunidad, fecha de finalización y el DISEÑO completo con los
// marcadores ya reemplazados — nada de eso se vuelve a calcular.
export async function issueCertificate(event: H3Event, tenant: TenantRow, user: UserRow, course: Record<string, unknown>, finishedAt: string): Promise<IssuedCertificate> {
  const db = await dbFor(event)
  const existing = await db.prepare('SELECT * FROM certificates WHERE tenant_id = ? AND user_id = ? AND course_id = ?')
    .get(tenant.id, user.id, Number(course.id)) as CertificateRow | undefined
  if (existing) return rowToIssued(existing)
  const design = await resolveCourseDesign(event, tenant, course)
  const fecha = formatCertDate(finishedAt)
  const snapshot: CertDesign = {
    ...design,
    bodyText: renderMarkers(design.bodyText, { nombre: user.name, curso: String(course.title), fecha }),
    headingText: renderMarkers(design.headingText, { nombre: user.name, curso: String(course.title), fecha }),
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCertCode()
    try {
      const res = await db.prepare('INSERT INTO certificates (tenant_id, user_id, course_id, blueprint_id, code, member_name, course_title, community_name, finished_at, design_snapshot, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(tenant.id, user.id, Number(course.id), snapshot.blueprintId, code, user.name, String(course.title), tenant.name, finishedAt, JSON.stringify(snapshot), nowIso())
      return {
        id: Number(res.lastInsertRowId), code, memberName: user.name, courseTitle: String(course.title),
        communityName: tenant.name, finishedAt, issuedAt: nowIso(), design: snapshot,
      }
    }
    catch {
      // Colisión de código (o doble emisión simultánea): si ya quedó
      // emitido por la otra vía, se devuelve ese; si no, se reintenta
      // con un código nuevo.
      const again = await db.prepare('SELECT * FROM certificates WHERE tenant_id = ? AND user_id = ? AND course_id = ?')
        .get(tenant.id, user.id, Number(course.id)) as CertificateRow | undefined
      if (again) return rowToIssued(again)
    }
  }
  throw createError({ statusCode: 500, message: 'No se pudo emitir el certificado. Intentá de nuevo.' })
}

// Verificación pública por código (sin sesión): solo los datos que
// el propio certificado impreso ya muestra. Nada de correos.
export async function verifyCertificate(event: H3Event, code: string) {
  const db = await dbFor(event)
  const clean = code.trim().toUpperCase()
  if (!clean) return null
  const row = await db.prepare('SELECT * FROM certificates WHERE code = ?').get(clean) as CertificateRow | undefined
  if (!row) return null
  return {
    code: row.code, memberName: row.member_name, courseTitle: row.course_title,
    communityName: row.community_name, finishedAt: row.finished_at, issuedAt: row.issued_at,
  }
}
