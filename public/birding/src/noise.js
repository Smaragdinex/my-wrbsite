// 可重現的亂數與 value noise（不用外部套件）

export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(i, j, k) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const fade = (t) => t * t * (3 - 2 * t)
const mix = (a, b, t) => a + (b - a) * t

// 回傳 [-1, 1]
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi)
  const c000 = hash(xi, yi, zi), c100 = hash(xi + 1, yi, zi)
  const c010 = hash(xi, yi + 1, zi), c110 = hash(xi + 1, yi + 1, zi)
  const c001 = hash(xi, yi, zi + 1), c101 = hash(xi + 1, yi, zi + 1)
  const c011 = hash(xi, yi + 1, zi + 1), c111 = hash(xi + 1, yi + 1, zi + 1)
  const x00 = mix(c000, c100, u), x10 = mix(c010, c110, u)
  const x01 = mix(c001, c101, u), x11 = mix(c011, c111, u)
  return mix(mix(x00, x10, v), mix(x01, x11, v), w) * 2 - 1
}

export function fbm3(x, y, z, oct = 4) {
  let a = 1, f = 1, s = 0, n = 0
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f)
    n += a
    a *= 0.5
    f *= 2.03
  }
  return s / n
}

export const fbm2 = (x, y, oct = 4) => fbm3(x, y, 0.37, oct)
