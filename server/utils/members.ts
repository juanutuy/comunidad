// Miembros a fondo (Fase 14): ingreso con aprobación previa,
// invitaciones, compuertas por nivel (Level Gates), etiquetas
// privadas y canales de auto-ingreso. Todo el estado vive en columnas
// aditivas del tenant (JSON) y en tablas propias (invitations,
// join_requests, member_tags, access_links); ver utils/db.ts.
import { randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { dbFor, nowIso } from './db'
import { isStaff } from './community'
import { getGamification, levelForConfig } from './gamification'
import { memberStats } from './levels'

// ---------- Ajustes de ingreso del tenant ----------

export interface JoinSettings {
  approval: boolean
  questions: string[]
  cooldownDays: number
  autoJoinChannels: number[]
}

export async function getJoinSettings(event: H3Event, tenantId: number): Promise<JoinSettings> {
  const fallback: JoinSettings = { approval: false, questions: [], cooldownDays: 0, autoJoinChannels: [] }
  try {
    const db = await dbFor(event)
    const row = await db.prepare('SELECT join_approval, join_questions, join_cooldown_days, auto_join_channels FROM tenants WHERE id = ?')
      .get(tenantId) as { join_approval: number, join_questions: string, join_cooldown_days: number, auto_join_channels: string } | undefined
    if (!row) return fallback
    const parseArr = (raw: string): unknown[] => {
      try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
    }
    return {
      approval: !!row.join_approval,
      questions: parseArr(row.join_questions).map(q => String(q)).slice(0, 6),
      cooldownDays: Math.max(0, Number(row.join_cooldown_days) || 0),
      autoJoinChannels: parseArr(row.auto_join_channels).map(n => Number(n)).filter(n => Number.isInteger(n) && n > 0).slice(0, 2),
    }
  }
  catch { return fallback } // bases anteriores sin las columnas: ingreso libre, como siempre
}

// Canales de auto-ingreso: todo miembro nuevo (registro directo,
// invitación aceptada, solicitud aprobada o alta manual) entra a los
// canales configurados. Se usa la tabla `follows` (la membresía de
// canal que ya respeta el feed y el paywall): si el canal es privado,
// el auto-ingreso igual lo agrega — es una decisión explícita del
// administrador al configurarlo.
export async function applyAutoJoin(event: H3Event, tenantId: number, userId: number): Promise<void> {
  try {
    const { autoJoinChannels } = await getJoinSettings(event, tenantId)
    if (!autoJoinChannels.length) return
    const db = await dbFor(event)
    for (const channelId of autoJoinChannels) {
      const ch = await db.prepare('SELECT id FROM channels WHERE tenant_id = ? AND id = ?').get(tenantId, channelId)
      if (!ch) continue
      await db.prepare('INSERT OR IGNORE INTO follows (tenant_id, user_id, channel_id) VALUES (?, ?, ?)')
        .run(tenantId, userId, channelId)
    }
  }
  catch { /* el auto-ingreso nunca debe romper un alta */ }
}

// ---------- Cooldown tras un rechazo ----------

// ¿La persona puede volver a solicitar el ingreso? Devuelve null si
// puede, o la fecha ISO desde la que podrá si sigue en espera.
export async function joinCooldownUntil(event: H3Event, tenantId: number, userId: number): Promise<string | null> {
  const { cooldownDays } = await getJoinSettings(event, tenantId)
  if (cooldownDays <= 0) return null
  try {
    const db = await dbFor(event)
    const last = await db.prepare("SELECT decided_at FROM join_requests WHERE tenant_id = ? AND user_id = ? AND status = 'declined' AND decided_at != '' ORDER BY id DESC LIMIT 1")
      .get(tenantId, userId) as { decided_at: string } | undefined
    if (!last) return null
    const until = new Date(new Date(last.decided_at).getTime() + cooldownDays * 24 * 3600 * 1000)
    return until.getTime() > Date.now() ? until.toISOString() : null
  }
  catch { return null }
}

// ---------- Compuertas por nivel (Level Gates) ----------

export type GateAction = 'create_post' | 'dm' | 'chat' | 'feed_link' | 'chat_link' | 'feed_video'

export const GATE_META: { action: GateAction, label: string, description: string, blockedText: string }[] = [
  { action: 'create_post', label: 'Crear publicaciones', description: 'Publicar en el feed y en los canales.', blockedText: 'publicar en la comunidad' },
  { action: 'dm', label: 'Enviar mensajes directos', description: 'Escribirle por privado a otro miembro.', blockedText: 'enviar mensajes directos' },
  { action: 'chat', label: 'Chatear en salas y canales', description: 'Enviar mensajes al chat de los canales y a las salas grupales.', blockedText: 'participar en el chat' },
  { action: 'feed_link', label: 'Pegar enlaces en el feed', description: 'Incluir un enlace en una publicación o en un comentario.', blockedText: 'incluir enlaces en tus publicaciones y comentarios' },
  { action: 'chat_link', label: 'Pegar enlaces en el chat', description: 'Incluir un enlace en un mensaje de chat o de sala.', blockedText: 'incluir enlaces en el chat' },
  { action: 'feed_video', label: 'Publicar videos en el feed', description: 'Crear una publicación con un video adjunto.', blockedText: 'publicar videos en el feed' },
]

// Mapa acción → UMBRAL de puntos del nivel exigido (0/ausente = sin
// compuerta). Se guarda como JSON en tenants.level_gates. Se usa el
// umbral y no el id de la fila porque la pantalla de gamificación
// reemplaza la lista de niveles al guardar (ids nuevos): el umbral
// es único por tenant (índice único) y sobrevive a ese reemplazo.
// Si el admin cambia los umbrales, la compuerta sigue al umbral
// guardado: conviene revisar las compuertas tras editar niveles.
export async function getGates(event: H3Event, tenantId: number): Promise<Record<string, number>> {
  try {
    const db = await dbFor(event)
    const row = await db.prepare('SELECT level_gates FROM tenants WHERE id = ?').get(tenantId) as { level_gates: string } | undefined
    const parsed = JSON.parse(row?.level_gates || '{}') as Record<string, unknown>
    const gates: Record<string, number> = {}
    for (const meta of GATE_META) {
      const v = Number(parsed[meta.action])
      if (Number.isInteger(v) && v > 0) gates[meta.action] = v
    }
    return gates
  }
  catch { return {} }
}

export interface GateBlock { action: GateAction, levelName: string, neededPoints: number, myPoints: number }

// ¿Esta acción está bloqueada por compuerta para este miembro?
// Devuelve el detalle del bloqueo o null. El staff NUNCA se bloquea
// (igual que en la referencia) y sin compuerta configurada no hay
// bloqueo. Nota: nuestro modelo no tiene un interruptor maestro de
// gamificación; compuerta en «sin nivel» = apagada.
export async function gateBlock(event: H3Event, tenantId: number, userId: number, role: string | null, action: GateAction): Promise<GateBlock | null> {
  if (isStaff(role)) return null
  const gates = await getGates(event, tenantId)
  const needed = gates[action]
  if (!needed) return null
  const gam = await getGamification(event, tenantId)
  const level = gam.levels.find(l => l.min === needed)
  if (!level) return null
  const stats = await memberStats(event, tenantId, userId)
  if (stats.points >= level.min) return null
  return { action, levelName: level.name, neededPoints: level.min, myPoints: stats.points }
}

export function gateError(block: GateBlock) {
  const meta = GATE_META.find(m => m.action === block.action)!
  return createError({
    statusCode: 403,
    message: `Necesitás el nivel ${block.levelName} para ${meta.blockedText}. Tenés ${block.myPoints} puntos y el nivel se alcanza con ${block.neededPoints}.`,
  })
}

export async function assertGate(event: H3Event, tenantId: number, userId: number, role: string | null, action: GateAction): Promise<void> {
  const block = await gateBlock(event, tenantId, userId, role, action)
  if (block) throw gateError(block)
}

const URL_RE = /(https?:\/\/|www\.)\S+/i
export function containsLink(text: string): boolean {
  return URL_RE.test(text || '')
}

// Estado de las compuertas para el usuario actual, para que la UI
// avise ANTES de ofrecer el control (compositor, mensajes): solo se
// calculan las dos acciones con superficie propia (crear post y DM);
// las de enlaces/video se avisan con el error del servidor al enviar.
export async function myGateStates(event: H3Event, tenantId: number, userId: number, role: string | null) {
  const [createPost, dm] = await Promise.all([
    gateBlock(event, tenantId, userId, role, 'create_post'),
    gateBlock(event, tenantId, userId, role, 'dm'),
  ])
  const view = (b: GateBlock | null) => b ? { blocked: true, levelName: b.levelName, neededPoints: b.neededPoints, myPoints: b.myPoints } : { blocked: false }
  return { createPost: view(createPost), dm: view(dm) }
}

// Nivel actual del miembro según su puntaje (para mensajes y UI).
export async function myLevel(event: H3Event, tenantId: number, userId: number) {
  const gam = await getGamification(event, tenantId)
  const stats = await memberStats(event, tenantId, userId)
  return { points: stats.points, level: levelForConfig(gam.levels, stats.points) }
}

// ---------- Etiquetas privadas ----------

// Etiquetas de un miembro (SOLO para superficies de administración:
// el miembro nunca las ve; ningún endpoint público las incluye).
export async function tagsOfMember(event: H3Event, tenantId: number, userId: number): Promise<{ id: number, name: string }[]> {
  const db = await dbFor(event)
  return await db.prepare(`SELECT t.id, t.name FROM member_tags t JOIN member_tag_assignments a ON a.tag_id = t.id
    WHERE a.tenant_id = ? AND a.user_id = ? ORDER BY t.name`).all(tenantId, userId) as { id: number, name: string }[]
}

// ---------- Tokens (invitaciones y enlaces de acceso) ----------

export function newToken(): string {
  return randomBytes(24).toString('hex')
}

export interface InvitationRow {
  id: number, tenant_id: number, kind: string, email: string, token: string,
  status: string, uses: number, expires_at: string, created_by: number | null,
  accepted_by: number | null, created_at: string
}

// Estado EFECTIVO de una invitación: 'expired' se deriva del
// vencimiento aunque la fila siga 'pending' (no hay cron que la
// marque; se calcula al leer, como los posts programados).
export function invitationState(inv: InvitationRow): 'pending' | 'accepted' | 'expired' | 'revoked' {
  if (inv.status === 'accepted' || inv.status === 'revoked') return inv.status
  if (inv.expires_at && new Date(inv.expires_at).getTime() <= Date.now()) return 'expired'
  return 'pending'
}

export async function invitationByToken(event: H3Event, tenantId: number, token: string): Promise<InvitationRow | undefined> {
  const db = await dbFor(event)
  return await db.prepare('SELECT * FROM invitations WHERE tenant_id = ? AND token = ?').get(tenantId, token) as InvitationRow | undefined
}
