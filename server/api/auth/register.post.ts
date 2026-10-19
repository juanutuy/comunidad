// Registro: crea el usuario y su membresía, y abre sesión.
// Fase 14 — tres caminos de ingreso:
//   - Con invitación válida (token): la invitación ES la aprobación —
//     la cuenta nace activa aunque el tenant pida aprobación previa.
//     La invitación por correo solo sirve para ese correo.
//   - Con aprobación previa encendida (sin invitación): la membresía
//     nace 'pending' y queda una solicitud (join_requests) con las
//     respuestas a las preguntas del tenant; los admins la resuelven
//     en la consola. La sesión se abre igual, pero el muro de estado
//     (middleware) no deja usar la API hasta que aprueben.
//   - Sin aprobación: como siempre, activa al instante.
// Si el correo ya existe con una solicitud RECHAZADA en este tenant,
// puede volver a solicitar cuando pasó el cooldown configurado.
// En todos los caminos de alta activa se aplica el auto-ingreso a
// canales del tenant.
import { hashPassword, setSession } from '../../utils/auth'
import { publicUser, resolveTenant } from '../../utils/community'
import { nowIso, dbFor, slugify } from '../../utils/db'
import { sendEmail } from '../../utils/email'
import { applyAutoJoin, getJoinSettings, invitationByToken, invitationState, joinCooldownUntil } from '../../utils/members'
import { notifyAdmins } from '../../utils/moderation'

interface RegisterBody {
  name?: string
  email?: string
  password?: string
  inviteToken?: string
  answers?: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RegisterBody>(event)
  const name = (body.name || '').trim()
  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!name || !email.includes('@') || password.length < 8)
    throw createError({ statusCode: 400, message: 'Completá nombre, un correo válido y una contraseña de al menos 8 caracteres.' })
  const db = await dbFor(event)
  const tenant = await resolveTenant(event)
  const join = await getJoinSettings(event, tenant.id)

  // Invitación (opcional): se valida ANTES de crear nada.
  let invitation: Awaited<ReturnType<typeof invitationByToken>> = undefined
  if (body.inviteToken) {
    invitation = await invitationByToken(event, tenant.id, String(body.inviteToken))
    if (!invitation || invitationState(invitation) !== 'pending')
      throw createError({ statusCode: 400, message: 'Esta invitación no es válida: pudo haber vencido o haber sido revocada. Pedile una nueva a un administrador.' })
    if (invitation.kind === 'email' && invitation.email.toLowerCase() !== email)
      throw createError({ statusCode: 400, message: 'Esta invitación es para otro correo. Registrate con el correo que recibió la invitación.' })
  }

  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').get(email) as (import('../../utils/community').UserRow & { password_hash: string }) | undefined
  let userId: number
  let reapplying = false
  if (existing) {
    const m = await db.prepare('SELECT status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, existing.id) as { status: string } | undefined
    // Único reingreso posible con el mismo correo: la solicitud fue
    // rechazada en ESTE tenant y ya pasó el cooldown.
    if (!m || (m.status || 'active') !== 'declined')
      throw createError({ statusCode: 409, message: 'Ya existe una cuenta con ese correo.' })
    if (!invitation) {
      const until = await joinCooldownUntil(event, tenant.id, existing.id)
      if (until) {
        const fecha = new Date(until).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
        throw createError({ statusCode: 403, message: `Tu solicitud anterior no fue aprobada. Podés volver a solicitar el ingreso a partir del ${fecha}.` })
      }
    }
    // Se renueva la solicitud: contraseña nueva y nombre actualizado.
    await db.prepare('UPDATE users SET password_hash = ?, name = ?, token_version = token_version + 1 WHERE id = ?')
      .run(hashPassword(password), name, existing.id)
    userId = existing.id
    reapplying = true
  }
  else {
    let slug = slugify(name)
    if (await db.prepare('SELECT id FROM users WHERE slug = ?').get(slug)) slug = `${slug}-${Math.floor(Math.random() * 9000 + 1000)}`
    userId = Number((await db.prepare('INSERT INTO users (name, slug, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, slug, email, hashPassword(password), nowIso())).lastInsertRowId)
  }

  const invited = !!invitation
  const needsApproval = join.approval && !invited
  const status = needsApproval ? 'pending' : 'active'
  if (reapplying) {
    await db.prepare('UPDATE memberships SET status = ?, role = \'member\' WHERE tenant_id = ? AND user_id = ?').run(status, tenant.id, userId)
  }
  else {
    await db.prepare('INSERT INTO memberships (tenant_id, user_id, role, status) VALUES (?, ?, \'member\', ?)')
      .run(tenant.id, userId, status)
  }

  if (needsApproval) {
    const answers = join.questions.map((_, i) => String((body.answers || [])[i] || '').trim().slice(0, 500))
    await db.prepare('INSERT INTO join_requests (tenant_id, user_id, answers, status, created_at) VALUES (?, ?, ?, \'pending\', ?)')
      .run(tenant.id, userId, JSON.stringify(answers), nowIso())
    await notifyAdmins(event, tenant.id, null, `${name} solicitó ingresar a la comunidad`, '/admin/members/requests', 'join_request').catch(() => {})
  }
  else {
    await applyAutoJoin(event, tenant.id, userId)
  }

  if (invitation) {
    if (invitation.kind === 'email') {
      await db.prepare("UPDATE invitations SET status = 'accepted', accepted_by = ? WHERE id = ?").run(userId, invitation.id)
    }
    else {
      await db.prepare('UPDATE invitations SET uses = uses + 1 WHERE id = ?').run(invitation.id)
    }
  }

  // Correo de bienvenida (Fase 4): sin proveedor configurado queda
  // registrado en email_log como 'skipped_no_provider'; nunca rompe
  // el registro ni finge un envío. Con aprobación previa no se manda:
  // la bienvenida llega cuando la solicitud se aprueba.
  if (!needsApproval) {
    await sendEmail(event, {
      tenantId: tenant.id, userId, to: email, kind: 'welcome',
      subject: `¡Te damos la bienvenida a ${tenant.name}!`,
      text: `Hola, ${name}:\n\nTu cuenta en ${tenant.name} ya está creada. Entrá a la comunidad para presentarte, seguir tus canales favoritos y participar.\n\n¡Nos vemos adentro!`,
    }).catch(() => {})
  }
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as import('../../utils/community').UserRow
  setSession(event, userId, (user as { token_version?: number }).token_version ?? 0)
  return { user: { ...publicUser(user), role: 'member' }, status }
})
