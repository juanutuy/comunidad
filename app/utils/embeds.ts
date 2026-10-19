// Convierte una URL de video pública (YouTube/Vimeo) en su URL de
// embed. Espejo del helper del servidor (server/utils/sanitize.ts):
// el servidor vuelve a validar el host al sanitizar, así que esto es
// solo para dar feedback inmediato en el editor.
export function videoEmbedUrl(raw: string): string | null {
  const url = (raw || '').trim()
  if (!url) return null
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  if (/youtube(-nocookie)?\.com\/embed\/[\w-]+/.test(url)) return url
  const vm = url.match(/vimeo\.com\/(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  if (/player\.vimeo\.com\/video\/\d+/.test(url)) return url
  return null
}
