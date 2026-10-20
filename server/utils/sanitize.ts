// Sanitización de HTML rico (Fase 8) y extracción de texto plano.
//
// El editor (TipTap) produce HTML en el cliente; NUNCA se confía en
// él: todo HTML que entra (posts, lecciones de texto, descripciones
// de curso/evento, embeds) pasa por `sanitizeHtml` en el servidor al
// guardar, y los serializadores vuelven a sanitizar al servir
// (defensa en profundidad). Es un sanitizador propio y liviano — un
// tokenizador con allowlist de etiquetas/atributos — porque el
// Worker no puede cargar dependencias pesadas de DOM.
//
// Reglas:
//  - Etiquetas permitidas: formato de texto, listas (incl. tareas),
//    cita, código, enlaces, imágenes, audio y embeds de video.
//  - <iframe> SOLO para embeds de YouTube/Vimeo con host validado.
//  - Fuera: scripts, estilos, manejadores on*, href/src con
//    javascript:/data:, y cualquier atributo no listado.
//  - Las etiquetas peligrosas con contenido (script/style/…) se
//    eliminan CON su contenido; las desconocidas se desnudan pero
//    conservan su texto.

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'a', 'img', 'div', 'span', 'figure', 'figcaption',
  'audio', 'source', 'iframe', 'input', 'mark', 'sub', 'sup',
])

// Etiquetas cuyo CONTENIDO también se elimina (no solo la etiqueta).
const DROP_CONTENT_TAGS = new Set([
  'script', 'style', 'textarea', 'title', 'noscript', 'template',
  'svg', 'math', 'form', 'button', 'select', 'option', 'object',
  'embed', 'link', 'meta', 'base', 'title', 'head', 'noscript',
])

const VOID_TAGS = new Set(['br', 'hr', 'img', 'source', 'input'])

const EMBED_HOSTS = new Set([
  'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',
  'youtube-nocookie.com', 'player.vimeo.com',
])

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'li', 'blockquote', 'pre', 'figure', 'figcaption', 'hr', 'ul', 'ol'])

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, '\'')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return escapeText(text).replace(/"/g, '&quot;')
}

// URL segura para href/src: http(s), mailto (solo href) o rutas
// internas absolutas (/api/files/…, /…). Nada de javascript:, data:,
// ni URLs relativas ambiguas ni protocol-relative (//host).
function safeUrl(raw: string, allowMailto: boolean): string | null {
  const url = decodeEntities(raw).trim()
  if (!url) return null
  if (/^(javascript|data|vbscript|file):/i.test(url)) return null
  if (url.startsWith('//')) return null
  if (url.startsWith('/')) return url
  if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) return url
  if (allowMailto && /^mailto:[^\s"'<>]+$/i.test(url)) return url
  return null
}

// Embed de video permitido: host validado y ruta de embed.
function safeEmbedUrl(raw: string): string | null {
  const url = safeUrl(raw, false)
  if (!url) return null
  let parsed: URL
  try { parsed = new URL(url) }
  catch { return null }
  if (!EMBED_HOSTS.has(parsed.hostname.toLowerCase())) return null
  if (parsed.hostname.includes('vimeo')) {
    if (!parsed.pathname.startsWith('/video/')) return null
  }
  else if (!parsed.pathname.startsWith('/embed/')) return null
  return url
}

export { videoEmbedUrl } from '../../shared/embeds'

interface TagToken { kind: 'open' | 'close' | 'selfclose', name: string, attrs: Map<string, string> }

// Tokenizador: recorre el HTML respetando comillas dentro de los
// atributos. Emite texto y etiquetas; los comentarios y declaraciones
// se descartan.
function tokenize(html: string): ({ kind: 'text', text: string } | TagToken)[] {
  const tokens: ({ kind: 'text', text: string } | TagToken)[] = []
  const n = html.length
  let i = 0
  let textStart = 0
  const pushText = (end: number) => {
    if (end > textStart) tokens.push({ kind: 'text', text: html.slice(textStart, end) })
  }
  while (i < n) {
    if (html[i] !== '<') { i++; continue }
    // Comentario o declaración: se descarta.
    if (html.startsWith('<!--', i)) {
      pushText(i)
      const end = html.indexOf('-->', i + 4)
      i = end === -1 ? n : end + 3
      textStart = i
      continue
    }
    if (html.startsWith('<!', i) || html.startsWith('<?', i)) {
      pushText(i)
      const end = html.indexOf('>', i + 2)
      i = end === -1 ? n : end + 1
      textStart = i
      continue
    }
    let j = i + 1
    let closing = false
    if (html[j] === '/') { closing = true; j++ }
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(html.slice(j, j + 40))
    if (!nameMatch) { i++; continue } // un '<' suelto es texto
    const name = nameMatch[0].toLowerCase()
    j += nameMatch[0].length
    // Atributos hasta '>' respetando comillas.
    const attrs = new Map<string, string>()
    let selfClose = false
    let done = false
    while (j < n && !done) {
      const ch = html[j]!
      if (ch === '>') { j++; done = true; break }
      if (ch === '/' && html[j + 1] === '>') { selfClose = true; j += 2; done = true; break }
      if (/\s/.test(ch)) { j++; continue }
      const attrMatch = /^[^\s=/>]+/.exec(html.slice(j))
      if (!attrMatch) { j++; continue }
      const attrName = attrMatch[0].toLowerCase()
      j += attrMatch[0].length
      while (j < n && /\s/.test(html[j]!)) j++
      let attrValue = ''
      if (html[j] === '=') {
        j++
        while (j < n && /\s/.test(html[j]!)) j++
        const quote = html[j]
        if (quote === '"' || quote === '\'') {
          const end = html.indexOf(quote, j + 1)
          attrValue = end === -1 ? html.slice(j + 1) : html.slice(j + 1, end)
          j = end === -1 ? n : end + 1
        }
        else {
          const bare = /^[^\s>]*/.exec(html.slice(j))
          attrValue = bare ? bare[0] : ''
          j += attrValue.length
        }
      }
      if (!attrs.has(attrName)) attrs.set(attrName, attrValue)
    }
    if (!done) { i = n; break } // etiqueta sin cerrar al final: se descarta
    pushText(i)
    tokens.push({ kind: closing ? 'close' : selfClose ? 'selfclose' : 'open', name, attrs })
    i = j
    textStart = i
  }
  pushText(n)
  return tokens
}

function buildAttrs(name: string, attrs: Map<string, string>): string | null {
  const get = (k: string) => attrs.get(k)
  const parts: string[] = []
  if (name === 'a') {
    const href = get('href')
    const safe = href ? safeUrl(href, true) : null
    if (!safe) return null // enlace sin destino seguro: se desnuda
    parts.push(`href="${escapeAttr(safe)}"`)
    if (get('target') === '_blank') parts.push('target="_blank"', 'rel="noopener noreferrer"')
  }
  else if (name === 'img') {
    const src = get('src')
    const safe = src ? safeUrl(src, false) : null
    if (!safe) return null
    parts.push(`src="${escapeAttr(safe)}"`)
    if (get('alt')) parts.push(`alt="${escapeAttr(decodeEntities(get('alt')!))}"`)
  }
  else if (name === 'audio') {
    parts.push('controls')
    const src = get('src')
    if (src) {
      const safe = safeUrl(src, false)
      if (!safe) return null
      parts.push(`src="${escapeAttr(safe)}"`)
    }
  }
  else if (name === 'source') {
    const src = get('src')
    const safe = src ? safeUrl(src, false) : null
    if (!safe) return null
    parts.push(`src="${escapeAttr(safe)}"`)
    const type = get('type')
    if (type && /^[a-z]+\/[\w.+-]+$/.test(type)) parts.push(`type="${escapeAttr(type)}"`)
  }
  else if (name === 'iframe') {
    const src = get('src')
    const safe = src ? safeEmbedUrl(src) : null
    if (!safe) return null
    parts.push(`src="${escapeAttr(safe)}"`, 'allowfullscreen', 'loading="lazy"')
    if (get('title')) parts.push(`title="${escapeAttr(decodeEntities(get('title')!))}"`)
  }
  else if (name === 'code') {
    const cls = get('class')
    if (cls && /^language-[a-z0-9-]+$/.test(cls)) parts.push(`class="${escapeAttr(cls)}"`)
  }
  else if (name === 'ul') {
    if (get('data-type') === 'taskList') parts.push('data-type="taskList"')
  }
  else if (name === 'li') {
    if (get('data-type') === 'taskItem') {
      parts.push('data-type="taskItem"')
      if (get('data-checked') === 'true') parts.push('data-checked="true"')
    }
  }
  else if (name === 'input') {
    if (get('type') !== 'checkbox') return null
    parts.push('type="checkbox"', 'disabled')
    if (attrs.has('checked')) parts.push('checked')
  }
  return parts.length ? ` ${parts.join(' ')}` : ''
}

export function sanitizeHtml(input: string): string {
  if (!input) return ''
  const tokens = tokenize(String(input).slice(0, 400_000))
  const out: string[] = []
  const stack: string[] = []
  let dropDepth = 0 // dentro de una etiqueta de contenido eliminado
  let dropName = ''
  for (const tok of tokens) {
    if (tok.kind === 'text') {
      if (!dropDepth) out.push(escapeText(decodeEntities(tok.text)))
      continue
    }
    const { name } = tok
    if (dropDepth) {
      if (name === dropName) {
        if (tok.kind === 'open') dropDepth++
        else if (tok.kind === 'close') dropDepth--
      }
      continue
    }
    if (DROP_CONTENT_TAGS.has(name)) {
      if (tok.kind === 'open') { dropDepth = 1; dropName = name }
      continue
    }
    if (!ALLOWED_TAGS.has(name)) continue // desnuda: conserva el texto
    if (tok.kind === 'close') {
      // Cierra solo si está abierta (y cierra antes lo anidado dentro).
      let idx = stack.lastIndexOf(name)
      if (name === 'a') idx = Math.max(idx, stack.lastIndexOf('a:bare'))
      if (idx === -1) continue
      while (stack.length > idx) {
        const popped = stack.pop()!
        if (!popped.endsWith(':bare')) out.push(`</${popped}>`)
      }
      continue
    }
    const attrStr = buildAttrs(name, tok.attrs)
    if (attrStr === null) {
      // Etiqueta inválida (p. ej. enlace sin href seguro): se desnuda.
      // Para img/iframe/source/input sin src válido se descarta entera.
      if (['img', 'iframe', 'source', 'input'].includes(name)) continue
      if (tok.kind === 'open' && name === 'a') stack.push('a:bare')
      continue
    }
    if (VOID_TAGS.has(name) || tok.kind === 'selfclose') {
      out.push(`<${name}${attrStr}>`)
      continue
    }
    // <p> y <li> no se anidan a sí mismos: el editor a veces los deja abiertos.
    if ((name === 'p' || name === 'li') && stack[stack.length - 1] === name) {
      out.push(`</${stack.pop()}>`)
    }
    out.push(`<${name}${attrStr}>`)
    stack.push(name)
  }
  while (stack.length) {
    const name = stack.pop()!
    if (!name.endsWith(':bare')) out.push(`</${name}>`)
  }
  return out.join('').trim()
}

// Texto plano a partir del HTML (para teaser, búsqueda, notificaciones
// y correos): los bloques separan con saltos de línea.
export function htmlToText(input: string): string {
  if (!input) return ''
  const tokens = tokenize(String(input).slice(0, 400_000))
  const parts: string[] = []
  let dropDepth = 0
  let dropName = ''
  for (const tok of tokens) {
    if (tok.kind === 'text') {
      if (!dropDepth) parts.push(decodeEntities(tok.text))
      continue
    }
    if (dropDepth) {
      if (tok.name === dropName) {
        if (tok.kind === 'open') dropDepth++
        else if (tok.kind === 'close') dropDepth--
      }
      continue
    }
    if (DROP_CONTENT_TAGS.has(tok.name)) {
      if (tok.kind === 'open') { dropDepth = 1; dropName = tok.name }
      continue
    }
    if (BLOCK_TAGS.has(tok.name) || tok.name === 'br') parts.push('\n')
  }
  return parts.join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}
