// Genera los iconos PNG de la PWA (public/icons/) sin dependencias:
// PNG crudo con zlib de Node. Diseño: cuadrado redondeado azul de marca
// con una «C» blanca (anillo abierto a la derecha) — genérico de la
// plataforma, no de un tenant puntual.
// Uso: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
    crc32.table = table
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1)
    raw[rowStart] = 0 // filtro: ninguno
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y, size)
      const o = rowStart + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // profundidad
  ihdr[9] = 6 // color RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BLUE = [37, 99, 235, 255]
const WHITE = [255, 255, 255, 255]
const CLEAR = [0, 0, 0, 0]

function makeIcon(size, { fullBleed = false } = {}) {
  const radius = fullBleed ? 0 : size * 0.22
  const cx = size / 2
  const cy = size / 2
  const rOuter = size * (fullBleed ? 0.30 : 0.34)
  const rInner = rOuter * 0.62
  const gap = 0.65 // apertura de la C, en radianes a cada lado del eje +x
  return encodePng(size, (x, y) => {
    // fondo: cuadrado redondeado (o completo si maskable)
    let inBg = true
    if (!fullBleed) {
      const dx = Math.max(Math.abs(x - cx) - (cx - radius), 0)
      const dy = Math.max(Math.abs(y - cy) - (cy - radius), 0)
      inBg = (dx * dx + dy * dy) <= radius * radius
    }
    if (!inBg) return CLEAR
    // letra C: anillo con apertura hacia la derecha
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const ang = Math.atan2(dy, dx)
    if (dist <= rOuter && dist >= rInner && Math.abs(ang) > gap) return WHITE
    return BLUE
  })
}

const outDir = join(process.cwd(), 'public', 'icons')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'icon-192.png'), makeIcon(192))
writeFileSync(join(outDir, 'icon-512.png'), makeIcon(512))
writeFileSync(join(outDir, 'maskable-512.png'), makeIcon(512, { fullBleed: true }))
console.log('Iconos PWA generados en public/icons/')
