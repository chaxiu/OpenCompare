/**
 * Synchronous SHA-256 over raw bytes and UTF-8 text.
 *
 * The comparison engine hashes file contents, so the implementation must run
 * unchanged in Node, the browser and the Electron renderer: no `node:crypto`,
 * no async Web Crypto — a plain synchronous primitive that is directly unit
 * testable in a pure Node environment. {@link sha256Bytes} digests the bytes
 * themselves, which is what keeps binary files (including invalid UTF-8) from
 * being flattened by a text decode; {@link sha256Hex} stays its UTF-8 wrapper.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

function rotateRight(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0
}

/** Hex digest of the SHA-256 hash of `bytes`, byte for byte. */
export function sha256Bytes(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8

  const padded = new Uint8Array(((bytes.length + 8) >> 6) * 64 + 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const lengthOffset = padded.length - 8
  const high = Math.floor(bitLength / 0x100000000)
  const low = bitLength >>> 0
  padded[lengthOffset] = (high >>> 24) & 0xff
  padded[lengthOffset + 1] = (high >>> 16) & 0xff
  padded[lengthOffset + 2] = (high >>> 8) & 0xff
  padded[lengthOffset + 3] = high & 0xff
  padded[lengthOffset + 4] = (low >>> 24) & 0xff
  padded[lengthOffset + 5] = (low >>> 16) & 0xff
  padded[lengthOffset + 6] = (low >>> 8) & 0xff
  padded[lengthOffset + 7] = low & 0xff

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ])
  const words = new Uint32Array(64)

  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    for (let index = 0; index < 16; index += 1) {
      const offset = chunk + index * 4
      words[index] =
        ((padded[offset] << 24) |
          (padded[offset + 1] << 16) |
          (padded[offset + 2] << 8) |
          padded[offset + 3]) >>>
        0
    }
    for (let index = 16; index < 64; index += 1) {
      const previous = words[index - 15]
      const sigma0 = (rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3)) >>> 0
      const recent = words[index - 2]
      const sigma1 = (rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10)) >>> 0
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let a = state[0]
    let b = state[1]
    let c = state[2]
    let d = state[3]
    let e = state[4]
    let f = state[5]
    let g = state[6]
    let h = state[7]

    for (let index = 0; index < 64; index += 1) {
      const sigma1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0
      const choose = ((e & f) ^ (~e & g)) >>> 0
      const temp1 = (h + sigma1 + choose + K[index] + words[index]) >>> 0
      const sigma0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0
      const majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const temp2 = (sigma0 + majority) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }

  return [...state].map((word) => word.toString(16).padStart(8, '0')).join('')
}

/** Hex digest of the SHA-256 hash of `text` (UTF-8 encoded). */
export function sha256Hex(text: string): string {
  return sha256Bytes(new TextEncoder().encode(text))
}
