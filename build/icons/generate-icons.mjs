#!/usr/bin/env node
// Regenerates every OpenCompare brand icon artifact from `icon.svg`.
//
// `icon.svg` is the single editable source: the script parses its rounded
// rectangles and linear gradients, rasterizes them with a tiny built-in
// renderer, and writes fixed-path outputs (multi-size PNGs, `build/icon.png`,
// `build/icon.icns`, `build/icon.ico`). No third-party packages and no system
// tools are required, so swapping the brand means editing `icon.svg` and
// running `node build/icons/generate-icons.mjs`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const iconDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = join(iconDir, '..', '..')
const sourceSvg = join(iconDir, 'icon.svg')

const PNG_SIZES = [16, 32, 64, 128, 256, 512, 1024]
const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024]
]
const ICO_SIZE = 256

const attrsOf = (source) =>
  Object.fromEntries([...source.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))

const hexToRgb = (hex) => {
  const value = hex.trim().replace(/^#/, '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ]
}

function parseSvg(source) {
  const gradients = new Map()
  for (const gradient of source.matchAll(/<linearGradient\s+([^>]*)>([\s\S]*?)<\/linearGradient>/g)) {
    const attrs = attrsOf(gradient[1])
    const stops = [...gradient[2].matchAll(/<stop\s+([^>]*)\/>/g)].map((stop) => {
      const stopAttrs = attrsOf(stop[1])
      return {
        offset: Number(stopAttrs.offset ?? 0),
        color: hexToRgb(stopAttrs['stop-color'])
      }
    })
    gradients.set(attrs.id, {
      from: { x: Number(attrs.x1 ?? 0), y: Number(attrs.y1 ?? 0) },
      to: { x: Number(attrs.x2 ?? 1024), y: Number(attrs.y2 ?? 0) },
      stops
    })
  }

  const shapes = [...source.matchAll(/<rect\s+([^>]*)\/>/g)].map((rect) => {
    const attrs = attrsOf(rect[1])
    const fill = attrs.fill ?? '#000000'
    const gradient = fill.match(/^url\(#(.+)\)$/)
    return {
      x: Number(attrs.x ?? 0),
      y: Number(attrs.y ?? 0),
      width: Number(attrs.width ?? 0),
      height: Number(attrs.height ?? 0),
      radius: Number(attrs.rx ?? attrs.ry ?? 0),
      gradient: gradient ? gradients.get(gradient[1]) : null,
      color: gradient ? null : hexToRgb(fill)
    }
  })

  return { gradients, shapes }
}

const sampleGradient = (gradient, x, y) => {
  const dx = gradient.to.x - gradient.from.x
  const dy = gradient.to.y - gradient.from.y
  const lengthSquared = dx * dx + dy * dy
  const raw = lengthSquared === 0 ? 0 : ((x - gradient.from.x) * dx + (y - gradient.from.y) * dy) / lengthSquared
  const t = Math.min(1, Math.max(0, raw))
  const stops = gradient.stops
  if (t <= stops[0].offset) return stops[0].color
  for (let i = 1; i < stops.length; i += 1) {
    if (t <= stops[i].offset) {
      const span = stops[i].offset - stops[i - 1].offset
      const local = span === 0 ? 0 : (t - stops[i - 1].offset) / span
      return stops[i - 1].color.map((channel, index) =>
        Math.round(channel + (stops[i].color[index] - channel) * local)
      )
    }
  }
  return stops[stops.length - 1].color
}

const insideRoundedRect = (px, py, shape) => {
  const halfWidth = shape.width / 2
  const halfHeight = shape.height / 2
  const centerX = shape.x + halfWidth
  const centerY = shape.y + halfHeight
  const qx = Math.abs(px - centerX) - (halfWidth - shape.radius)
  const qy = Math.abs(py - centerY) - (halfHeight - shape.radius)
  if (qx <= 0 && qy <= 0) return true
  const cx = Math.max(qx, 0)
  const cy = Math.max(qy, 0)
  return cx * cx + cy * cy <= shape.radius * shape.radius
}

// Renders the parsed SVG into straight-alpha RGBA at `size` pixels. Layers are
// rasterized with supersampling and box-downsampled, which gives clean edges
// without any external renderer.
function render(shapes, size) {
  const factor = size <= 128 ? 4 : 2
  const hi = size * factor
  const scale = hi / 1024
  const hiBuffer = new Uint8Array(hi * hi * 4)

  for (const shape of shapes) {
    const left = Math.max(0, Math.floor(shape.x * scale))
    const top = Math.max(0, Math.floor(shape.y * scale))
    const right = Math.min(hi, Math.ceil((shape.x + shape.width) * scale))
    const bottom = Math.min(hi, Math.ceil((shape.y + shape.height) * scale))
    for (let py = top; py < bottom; py += 1) {
      const sourceY = (py + 0.5) / scale
      for (let px = left; px < right; px += 1) {
        const sourceX = (px + 0.5) / scale
        if (!insideRoundedRect(sourceX, sourceY, shape)) continue
        const color = shape.gradient
          ? sampleGradient(shape.gradient, sourceX, sourceY)
          : shape.color
        const index = (py * hi + px) * 4
        hiBuffer[index] = color[0]
        hiBuffer[index + 1] = color[1]
        hiBuffer[index + 2] = color[2]
        hiBuffer[index + 3] = 255
      }
    }
  }

  const rgba = new Uint8Array(size * size * 4)
  const samples = factor * factor
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const index = ((y * factor + sy) * hi + (x * factor + sx)) * 4
          const alpha = hiBuffer[index + 3]
          r += hiBuffer[index] * alpha
          g += hiBuffer[index + 1] * alpha
          b += hiBuffer[index + 2] * alpha
          a += alpha
        }
      }
      const index = (y * size + x) * 4
      if (a === 0) continue
      rgba[index] = Math.round(r / a)
      rgba[index + 1] = Math.round(g / a)
      rgba[index + 2] = Math.round(b / a)
      rgba[index + 3] = Math.round(a / samples)
    }
  }
  return rgba
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (buffer) => {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    )
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function encodeIcns(entries) {
  const chunks = entries.map(([type, png]) => {
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([header, png])
  })
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

function encodeIco(png) {
  const header = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00])
  const entry = Buffer.alloc(16)
  entry[0] = 0 // 256 px is encoded as 0
  entry[1] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(header.length + entry.length, 12)
  return Buffer.concat([header, entry, png])
}

const { shapes } = parseSvg(readFileSync(sourceSvg, 'utf8'))
if (shapes.length === 0) {
  throw new Error(`No <rect> shapes found in ${sourceSvg}`)
}

mkdirSync(iconDir, { recursive: true })

const rendered = new Map()
const pngFor = (size) => {
  if (!rendered.has(size)) rendered.set(size, encodePng(size, render(shapes, size)))
  return rendered.get(size)
}

for (const size of PNG_SIZES) {
  writeFileSync(join(iconDir, `icon-${size}.png`), pngFor(size))
}
writeFileSync(join(repoRoot, 'build', 'icon.png'), pngFor(1024))
writeFileSync(
  join(repoRoot, 'build', 'icon.icns'),
  encodeIcns(ICNS_TYPES.map(([type, size]) => [type, pngFor(size)]))
)
writeFileSync(join(repoRoot, 'build', 'icon.ico'), encodeIco(pngFor(ICO_SIZE)))

console.log(`Generated ${PNG_SIZES.length} PNG sizes, icon.icns and icon.ico from ${sourceSvg}`)
