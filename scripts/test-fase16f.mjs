// Verificación local de la Fase 16-F (canales como el original):
// ejes nuevos del canal (content_type / cover_url / visibility sin
// tocar el eje de acceso `type`), modal único por API (el MISMO
// POST/PUT que usa el modal y la consola), visibilidad privada con
// pantalla de bloqueo sin fugas (feed/búsqueda/detalle), secreta
// con 404, seguir/dejar de seguir sin perder acceso, grupos
// (crear/mover/eliminar → grupo por defecto), gestionar miembros
// (conceder/quitar acceso real) y canal de imagen (álbum aceptado
// solo ahí, galería derivable, página sin región right-rail).
// Corre contra wrangler dev (D1 local). CREA datos de prueba y los
// BORRA al final (la semilla local queda intacta: 4 usuarios,
// 7 posts, 5 canales, 3 grupos).
//   node scripts/test-fase16f.mjs http://127.0.0.1:8787
const BASE = process.argv[2] || 'http://127.0.0.1:8787'
let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`PASS  ${name}`) }
  else { fail++; console.log(`FAIL  ${name} ${extra}`) }
}
async function client() {
  const jar = new Map()
  return {
    async req(path, opts = {}) {
      const headers = { ...(opts.headers || {}) }
      if (opts.body !== undefined) headers['content-type'] = 'application/json'
      const cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
      if (cookie) headers.cookie = cookie
      const res = await fetch(BASE + path, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, redirect: 'manual' })
      for (const sc of res.headers.getSetCookie?.() || []) {
        const [pair] = sc.split(';')
        const i = pair.indexOf('=')
        if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
      }
      const text = await res.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* html */ }
      return { status: res.status, text, json }
    },
    async login(email, password) {
      return this.req('/api/auth/login', { method: 'POST', body: { email, password } })
    },
  }
}
const flat = list => (list?.groups || []).flatMap(g => g.channels.map(c => ({ ...c, groupName: g.name, groupIdReal: g.id })))
const groupOf = (list, channelId) => (list?.groups || []).find(g => g.channels.some(c => c.id === channelId))

const admin = await client()
const member = await client()
check('login admin', (await admin.login('admin@demo.local', 'demo1234')).status === 200)
check('login miembro', (await member.login('member@demo.local', 'demo1234')).status === 200)
const meMember = await member.req('/api/tenant')
const memberId = meMember.json?.user?.id
check('id del miembro demo', !!memberId)

// ---------- Base: migración y semilla de seguimientos ----------
const baseAdmin = await admin.req('/api/channels?includeArchived=1')
const baseChannels = flat(baseAdmin.json)
check('base: 3 grupos y 5 canales', baseAdmin.json.groups.length === 3 && baseChannels.length === 5, `${baseAdmin.json.groups.length}g/${baseChannels.length}c`)
const sala = baseChannels.find(c => c.slug === 'sala-privada')
check("base: type='private' migró a visibility='private'", sala?.visibility === 'private', sala?.visibility)
check("base: free/paid quedaron visibility='public'", baseChannels.filter(c => c.type !== 'private').every(c => c.visibility === 'public'))
const baseMember = await member.req('/api/channels')
check('base: el miembro sigue los 5 canales (backfill, lateral no se vacía)', flat(baseMember.json).every(c => c.following === true), JSON.stringify(flat(baseMember.json).map(c => [c.slug, c.following])))
check('base: sala-privada accesible para el miembro (la membresía es el acceso)', flat(baseMember.json).find(c => c.slug === 'sala-privada')?.hasAccess === true)
const defaultGroup = baseAdmin.json.groups.find(g => g.isDefault) || baseAdmin.json.groups[0]
check('base: hay grupo por defecto marcado', !!defaultGroup?.isDefault)

// ---------- Etapa A: crear canales con el endpoint del modal ----------
const mkPost = await admin.req('/api/admin/channels', { method: 'POST', body: { name: 'Prueba Post 16F', description: 'Canal de prueba tipo post', type: 'free', contentType: 'post', visibility: 'public' } })
check('crear canal tipo post (endpoint del modal)', mkPost.status === 200 && !!mkPost.json.id, `status ${mkPost.status}`)
const mkImg = await admin.req('/api/admin/channels', { method: 'POST', body: { name: 'Galería 16F', description: 'Canal de prueba tipo imagen', type: 'free', contentType: 'image', visibility: 'public' } })
check('crear canal tipo imagen', mkImg.status === 200 && !!mkImg.json.id, `status ${mkImg.status}`)
const mkClub = await admin.req('/api/admin/channels', { method: 'POST', body: { name: 'Club Privado 16F', description: 'Contenido solo con invitación', type: 'free', contentType: 'post', visibility: 'private' } })
check('crear canal visibilidad privada', mkClub.status === 200 && !!mkClub.json.id, `status ${mkClub.status}`)
const mkSecret = await admin.req('/api/admin/channels', { method: 'POST', body: { name: 'Secreto 16F', description: 'Nadie lo lista sin acceso', type: 'free', contentType: 'post', visibility: 'secret' } })
check('crear canal secreto', mkSecret.status === 200 && !!mkSecret.json.id, `status ${mkSecret.status}`)
const postCh = { id: mkPost.json.id, slug: mkPost.json.slug }
const imgCh = { id: mkImg.json.id, slug: mkImg.json.slug }
const clubCh = { id: mkClub.json.id, slug: mkClub.json.slug }
const secretCh = { id: mkSecret.json.id, slug: mkSecret.json.slug }

const afterCreate = flat((await admin.req('/api/channels?includeArchived=1')).json)
check('los 4 canales nuevos existen con sus ejes', [postCh, imgCh, clubCh, secretCh].every(c => afterCreate.some(x => x.id === c.id)))
check('el de imagen trae contentType image', afterCreate.find(c => c.id === imgCh.id)?.contentType === 'image')

// Un miembro NO puede crear canales ni gestionar miembros.
check('miembro no crea canales (403)', (await member.req('/api/admin/channels', { method: 'POST', body: { name: 'Ilegal 16F' } })).status === 403)
check('miembro no lista miembros de canal (403)', (await member.req(`/api/admin/channels/${clubCh.id}/members`)).status === 403)

// ---------- Etapa A/B: visibilidad privada sin acceso ----------
const memberList1 = flat((await member.req('/api/channels')).json)
const clubForMember = memberList1.find(c => c.id === clubCh.id)
check('privado: el miembro LO VE listado (metadatos)', !!clubForMember)
check('privado: pero hasAccess=false', clubForMember?.hasAccess === false)
check('secreto: el miembro NO lo ve listado', !memberList1.some(c => c.id === secretCh.id))
const clubDetail = await member.req(`/api/channels/${clubCh.slug}`)
check('privado: su página abre con vista de bloqueo', clubDetail.status === 200 && clubDetail.json.channel.visibilityLocked === true && (clubDetail.json.posts || []).length === 0, `status ${clubDetail.status}`)
check('secreto: su página da 404 sin acceso', (await member.req(`/api/channels/${secretCh.slug}`)).status === 404)

const hiddenPost = await admin.req('/api/posts', { method: 'POST', body: { channelSlug: clubCh.slug, title: 'Contenido bloqueado 16F XYZ', bodyHtml: '<p>Texto que no debe filtrarse jamas 16F.</p>' } })
check('admin publica en el canal privado', hiddenPost.status === 200, `status ${hiddenPost.status}`)
const feedMember = await member.req('/api/feed?sort=recent')
check('privado: el post NO sale en el feed del miembro', !feedMember.text.includes('Contenido bloqueado 16F XYZ'))
const searchMember = await member.req('/api/search?q=bloqueado%2016F')
check('privado: el post NO sale en la búsqueda', !searchMember.text.includes('Contenido bloqueado 16F XYZ'))
check('privado: el detalle directo del post da 404', (await member.req(`/api/post?channel=${clubCh.slug}&post=${hiddenPost.json.slug}`)).status === 404)
const videosMember = await member.req('/api/videos')
check('privado: tampoco aparece en /api/videos', !videosMember.text.includes('Contenido bloqueado 16F XYZ'))
const dirMember = await member.req('/api/search?q=Club%20Privado')
check('privado: el CANAL sí sale en la búsqueda (metadatos)', dirMember.text.includes('Club Privado 16F'))
check('secreto: el canal NO sale en la búsqueda', !(await member.req('/api/search?q=Secreto%2016F')).text.includes('Secreto 16F'))

// ---------- Etapa B: gestionar miembros concede/quita acceso ----------
const grant = await admin.req(`/api/admin/channels/${clubCh.id}/members`, { method: 'POST', body: { userId: memberId } })
check('gestionar miembros: conceder acceso', grant.status === 200, `status ${grant.status}`)
const membersList = await admin.req(`/api/admin/channels/${clubCh.id}/members`)
check('la lista de miembros marca el acceso concedido', membersList.json.members.find(m => m.id === memberId)?.hasAccess === true)
const clubDetail2 = await member.req(`/api/channels/${clubCh.slug}`)
check('con acceso: la página se abre y el post aparece', clubDetail2.json.channel.hasAccess === true && (clubDetail2.json.posts || []).some(p => p.title === 'Contenido bloqueado 16F XYZ'))
const feedMember2 = await member.req('/api/feed?sort=recent')
check('con acceso: el post ya sale en su feed', feedMember2.text.includes('Contenido bloqueado 16F XYZ'))
const revoke = await admin.req(`/api/admin/channels/${clubCh.id}/members/${memberId}`, { method: 'DELETE' })
check('gestionar miembros: quitar acceso', revoke.status === 200)
const clubDetail3 = await member.req(`/api/channels/${clubCh.slug}`)
check('sin acceso otra vez: bloqueo de vuelta', clubDetail3.json.channel.visibilityLocked === true && (clubDetail3.json.posts || []).length === 0)

// Secreto: con acceso concedido se lista y se abre; sin él, 404.
await admin.req(`/api/admin/channels/${secretCh.id}/members`, { method: 'POST', body: { userId: memberId } })
const memberList2 = flat((await member.req('/api/channels')).json)
check('secreto con acceso: aparece en el lateral del miembro', memberList2.some(c => c.id === secretCh.id && c.hasAccess === true))
check('secreto con acceso: su página abre', (await member.req(`/api/channels/${secretCh.slug}`)).status === 200)
await admin.req(`/api/admin/channels/${secretCh.id}/members/${memberId}`, { method: 'DELETE' })
check('secreto sin acceso de nuevo: 404', (await member.req(`/api/channels/${secretCh.slug}`)).status === 404)

// ---------- Etapa B.1: seguir / dejar de seguir ----------
const unfollow = await member.req('/api/channels/general/follow', { method: 'POST' })
check('dejar de seguir responde following=false', unfollow.json?.following === false)
const memberList3 = flat((await member.req('/api/channels')).json)
check('el canal sigue LISTADO con following=false (el lateral filtra por following)', memberList3.find(c => c.slug === 'general')?.following === false)
const generalDetail = await member.req('/api/channels/general')
check('dejar de seguir NO quita el acceso', generalDetail.json.channel.hasAccess === true)
const refollow = await member.req('/api/channels/general/follow', { method: 'POST' })
check('seguir de nuevo restaura el lateral', refollow.json?.following === true)

// ---------- Etapa C: grupos ----------
const newGroup = await admin.req('/api/admin/channel-groups', { method: 'POST', body: { name: 'Grupo Prueba 16F' } })
check('crear grupo', newGroup.status === 200 && !!newGroup.json.id, `status ${newGroup.status}`)
const move = await admin.req(`/api/admin/channels/${imgCh.id}`, { method: 'PUT', body: { groupId: newGroup.json.id } })
check('mover canal al grupo nuevo (PUT del modal)', move.status === 200)
const listMoved = await admin.req('/api/channels?includeArchived=1')
check('el canal quedó en el grupo nuevo', groupOf(listMoved.json, imgCh.id)?.id === newGroup.json.id)
check('el grupo por defecto NO se elimina (400)', (await admin.req(`/api/admin/channel-groups/${defaultGroup.id}`, { method: 'DELETE' })).status === 400)
const delGroup = await admin.req(`/api/admin/channel-groups/${newGroup.json.id}`, { method: 'DELETE' })
check('eliminar el grupo nuevo', delGroup.status === 200, `status ${delGroup.status}`)
const listAfterGroupDel = await admin.req('/api/channels?includeArchived=1')
check('al borrar el grupo, el canal pasó al grupo por defecto (no se borró)', groupOf(listAfterGroupDel.json, imgCh.id)?.id === defaultGroup.id && flat(listAfterGroupDel.json).some(c => c.id === imgCh.id))

// ---------- Etapa A: editar por el MISMO endpoint (modal = consola) ----------
const edit = await admin.req(`/api/admin/channels/${postCh.id}`, { method: 'PUT', body: { name: 'Prueba Post Renombrado', type: 'paid', priceCents: 1500, visibility: 'private' } })
check('editar nombre/precio/visibilidad por el PUT único', edit.status === 200 && edit.json.visibility === 'private', `status ${edit.status}`)
const editedDetail = await admin.req(`/api/channels/${postCh.slug}`)
check('el detalle refleja la edición', editedDetail.json.channel.name === 'Prueba Post Renombrado' && editedDetail.json.channel.priceCents === 1500 && editedDetail.json.channel.visibility === 'private')
const memberSeesEdited = flat((await member.req('/api/channels')).json).find(c => c.id === postCh.id)
check('el miembro lo ve listado como privado sin acceso (pago + visibilidad privada)', !!memberSeesEdited && memberSeesEdited.hasAccess === false)
const backEdit = await admin.req(`/api/admin/channels/${postCh.id}`, { method: 'PUT', body: { type: 'free', priceCents: 0, visibility: 'public' } })
check('revertir la edición también por el PUT único', backEdit.status === 200)

// ---------- Etapa D: canal de imagen (álbum, galería) ----------
const foto1 = await admin.req('/api/posts', { method: 'POST', body: { channelSlug: imgCh.slug, title: 'Foto playa 16F', bodyHtml: '<p>Una foto de la playa.</p>', mediaType: 'image', mediaUrl: 'https://example.com/playa-16f.jpg', album: 'Paisajes' } })
check('publicar foto con álbum en canal de imagen', foto1.status === 200, `status ${foto1.status} ${foto1.text.slice(0, 120)}`)
const foto2 = await admin.req('/api/posts', { method: 'POST', body: { channelSlug: imgCh.slug, title: 'Foto suelta 16F', bodyHtml: '<p>Sin álbum.</p>', mediaType: 'image', mediaUrl: 'https://example.com/suelta-16f.jpg' } })
check('publicar foto sin álbum', foto2.status === 200)
const nota = await admin.req('/api/posts', { method: 'POST', body: { channelSlug: imgCh.slug, title: 'Nota sin foto 16F', bodyHtml: '<p>Solo texto con álbum.</p>', album: 'Paisajes' } })
check('publicar texto con álbum en canal de imagen', nota.status === 200)
const imgDetail = await admin.req(`/api/channels/${imgCh.slug}`)
const imgPosts = imgDetail.json.posts || []
check('el detalle trae el álbum guardado', imgPosts.find(p => p.title === 'Foto playa 16F')?.album === 'Paisajes')
check('la galería es derivable: 2 posts con imagen (la nota no entra)', imgPosts.filter(p => p.mediaType === 'image' && p.mediaUrl).length === 2)
check('el álbum agrupa: 2 posts en «Paisajes» y 1 sin álbum', imgPosts.filter(p => p.album === 'Paisajes').length === 2 && imgPosts.filter(p => !p.album).length === 1)
const albumEnPostChannel = await admin.req('/api/posts', { method: 'POST', body: { channelSlug: postCh.slug, title: 'Post con album ilegal 16F', bodyHtml: '<p>En canal de post el álbum no existe.</p>', album: 'NoDebe' } })
check('publicar en canal tipo post acepta el post…', albumEnPostChannel.status === 200)
const postDetail = await admin.req(`/api/channels/${postCh.slug}`)
check('…pero el álbum NO se guarda fuera de un canal de imagen', (postDetail.json.posts || []).find(p => p.title === 'Post con album ilegal 16F')?.album === '')

// ---------- HTML servido: sin riel en el canal, con riel en el feed ----------
const channelHtml = await member.req(`/channels/${imgCh.slug}`)
check('la página del canal NO contiene la región right-rail', !channelHtml.text.includes('data-scroll-region="right-rail"'))
check('la página del canal SÍ conserva el marco fijo (center + channels-sidebar)', channelHtml.text.includes('data-scroll-region="center"') && channelHtml.text.includes('data-scroll-region="channels-sidebar"'))
check('la página del canal de imagen sirve el conmutador (Feed/Galería/Álbum)', channelHtml.text.includes('Galería') && channelHtml.text.includes('Álbum'))
const feedHtml = await member.req('/feeds')
check('el feed SÍ sigue teniendo right-rail', feedHtml.text.includes('data-scroll-region="right-rail"'))
const dirHtml = await member.req('/channels')
check('el directorio /channels sirve y lista los canales', dirHtml.status === 200 && dirHtml.text.includes('Galería 16F') && dirHtml.text.includes('Club Privado 16F'))
check('el directorio NO lista el canal secreto sin acceso', !dirHtml.text.includes('Secreto 16F'))
const clubHtml = await member.req(`/channels/${clubCh.slug}`)
check('la página del canal privado sirve la vista de bloqueo', clubHtml.text.includes('Este canal es privado'))

// ---------- Fuga cazada en la primera corrida: follows sin acceso ----------
// El perfil devuelve los canales que el dueño SIGUE y esa respuesta
// viaja en el payload de todas las páginas (tarjeta de nivel del
// panel móvil); y las notificaciones de post nuevo avisan a los
// seguidores. Seguir ≠ acceso: tras revocar, ni el nombre del canal
// secreto ni los títulos de sus posts pueden llegar al miembro.
await admin.req(`/api/admin/channels/${secretCh.id}/members`, { method: 'POST', body: { userId: memberId } })
await admin.req(`/api/admin/channels/${secretCh.id}/members/${memberId}`, { method: 'DELETE' })
// Título ÚNICO por corrida: las notificaciones viejas de corridas
// anteriores quedan en la base local (borrar un canal no borra las
// notificaciones que generó) y ensuciarían el chequeo.
const secretTitle = `Post secreto que no avisa 16F ${Date.now()}`
const secretPost = await admin.req('/api/posts', { method: 'POST', body: { channelSlug: secretCh.slug, title: secretTitle, bodyHtml: '<p>Contenido secreto.</p>' } })
check('admin publica en el canal secreto', secretPost.status === 200, `status ${secretPost.status}`)
const notifs = await member.req('/api/notifications')
check('sin acceso: la notificación del post secreto NO llega (seguir ≠ acceso)', !notifs.text.includes(secretTitle))
const profileSelf = await member.req(`/api/profiles/${meMember.json.user.slug}`)
check('sin acceso: su propio perfil NO lista el canal secreto que sigue', !profileSelf.text.includes('Secreto 16F'))
const feedHtml2 = await member.req('/feeds')
check('sin acceso: el payload SSR del feed NO nombra el canal secreto', !feedHtml2.text.includes('Secreto 16F'))

// ---------- Limpieza total ----------
for (const c of [postCh, imgCh, clubCh, secretCh]) {
  const del = await admin.req(`/api/admin/channels/${c.id}`, { method: 'DELETE' })
  check(`limpieza: canal ${c.slug} eliminado`, del.status === 200, `status ${del.status}`)
}
const finalList = await admin.req('/api/channels?includeArchived=1')
check('limpieza: quedan 3 grupos y 5 canales (la semilla)', finalList.json.groups.length === 3 && flat(finalList.json).length === 5, `${finalList.json.groups.length}g/${flat(finalList.json).length}c`)
const finalMember = flat((await member.req('/api/channels')).json)
check('limpieza: el miembro sigue los 5 canales de la semilla', finalMember.length === 5 && finalMember.every(c => c.following === true))
const finalFeed = await member.req('/api/feed?sort=recent')
check('limpieza: el feed vuelve a los 7 posts de la semilla', !finalFeed.text.includes('16F') )

console.log(`\n${pass} PASS · ${fail} FAIL`)
process.exit(fail ? 1 : 0)
