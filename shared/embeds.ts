/** Normalize only exact provider hosts; never accept a provider name inside another URL. */
export function videoEmbedUrl(raw: string): string | null {
  let url: URL
  try { url = new URL(raw.trim()) } catch { return null }
  if (!['https:', 'http:'].includes(url.protocol)) return null
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? url.pathname.slice(1) : url.pathname.startsWith('/embed/') ? url.pathname.slice(7) : url.pathname.startsWith('/shorts/') ? url.pathname.slice(8) : url.searchParams.get('v')
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.replace(/^\/(video\/)?/, '')
    return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
  }
  return null
}
