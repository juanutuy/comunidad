import { limitAuthAttempts } from '../../utils/authLimits'
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
import { hashPassword, setSession, verifyPassword } from '../../utils/auth'
import { publicUser, resolveTenant } from '../../utils/community'
import { nowIso, dbFor, slugify } from '../../utils/db'
import { eventLocale, msg, resolveEventLocale, setLocaleCookie } from '../../utils/i18n'
import { sendEmail } from '../../utils/email'
import { applyAutoJoin, getJoinSettings, invitationByToken, invitationState, joinCooldownUntil } from '../../utils/members'
import { notifyAdmins } from '../../utils/moderation'
import { getPrivacySettings } from '../../utils/privacy'

interface RegisterBody {
  name?: string
  email?: string
  password?: string
  inviteToken?: string
  answers?: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RegisterBody>(event)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  await limitAuthAttempts(event, email)
  const db = await dbFor(event)
  const tenant = await resolveTenant(event)
  // Fase 18: los errores del registro salen en el idioma resuelto
  // del visitante (cookie o defecto de la comunidad).
  if (!name || (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || password.length < 8 || password.length > 1024 || (body.answers !== undefined && !Array.isArray(body.answers)))
    throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'auth.registerInvalid') })
  const join = await getJoinSettings(event, tenant.id)

  // Invitación (opcional): se valida ANTES de crear nada.
  let invitation: Awaited<ReturnType<typeof invitationByToken>> = undefined
  if (body.inviteToken) {
    invitation = await invitationByToken(event, tenant.id, String(body.inviteToken))
    if (!invitation || invitationState(invitation) !== 'pending')
      throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'auth.inviteInvalid') })
    if (invitation.kind === 'email' && invitation.email.toLowerCase() !== email)
      throw createError({ statusCode: 400, message: await msg(event, tenant.id, 'auth.inviteOtherEmail') })
  }

  // Fase 15: registro público cerrado — sin una invitación válida no
  // se crea ninguna cuenta (ni siquiera una reaplicación tras un
  // rechazo: el ingreso vuelve a ser una decisión del equipo).
  const priv = await getPrivacySettings(event, tenant.id)
  if (!priv.anyoneCanRegister && !invitation)
    throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'auth.registrationClosed') })

  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').get(email) as (import('../../utils/community').UserRow & { password_hash: string }) | undefined
  let userId: number
  let reapplying = false
  if (existing) {
    // A pre-existing global identity must prove ownership before joining or reapplying.
    if (!verifyPassword(password, existing.password_hash))
      throw createError({ statusCode: 409, message: await msg(event, tenant.id, 'auth.emailTaken') })
    const m = await db.prepare('SELECT status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenant.id, existing.id) as { status: string } | undefined
    // Único reingreso posible con el mismo correo: la solicitud fue
    // rechazada en ESTE tenant y ya pasó el cooldown.
    if (m && (m.status || 'active') !== 'declined')
      throw createError({ statusCode: 409, message: await msg(event, tenant.id, 'auth.emailTaken') })
    if (m && !invitation) {
      const until = await joinCooldownUntil(event, tenant.id, existing.id)
      if (until) {
        const locale = await eventLocale(event, tenant.id)
        const fecha = new Date(until).toLocaleDateString(locale === 'en' ? 'en-US' : 'es', { day: 'numeric', month: 'long', year: 'numeric' })
        throw createError({ statusCode: 403, message: await msg(event, tenant.id, 'auth.cooldown', { date: fecha }) })
      }
    }
    // Reapplication changes the membership, never global credentials or name.
    userId = existing.id
    reapplying = !!m
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
  // Fase 18: la cuenta nueva no tiene elección personal: la cookie
  // de idioma queda en el defecto de la comunidad.
  setLocaleCookie(event, (await resolveEventLocale(event, tenant.id)).defaultLocale)
  return { user: { ...publicUser(user), role: 'member' }, status }
})
