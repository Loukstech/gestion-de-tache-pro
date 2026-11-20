export const cx = (...parts) =>
  parts
    .flat(Infinity)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Tronche proprement un texte long (titres, résumés parlés…). */
export function truncate(text, max = 60) {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, text.lastIndexOf(' ', max)))}…`
}

/** Met en majuscule la première lettre uniquement. */
export function capitalize(text = '') {
  const t = String(text).trim()
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

/** Normalisation FR + suppression des mots vides => clés de recherche. */
export function searchKey(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Score de correspondance floue : 0 = aucun, plus c'est haut, mieux c'est. */
export function fuzzyScore(query, target) {
  const q = searchKey(query)
  const t = searchKey(target)
  if (!q || !t) return 0
  if (t === q) return 1000
  if (t.startsWith(q)) return 700 - Math.min(t.length - q.length, 100)
  const words = t.split(' ')
  if (words.some((w) => w === q)) return 620
  if (words.some((w) => w.startsWith(q))) return 520
  if (t.includes(q)) return 420

  // Sous-séquence (tolérante aux fautes de dictée vocale)
  let qi = 0
  let hits = 0
  let streak = 0
  let bestStreak = 0
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      qi += 1
      hits += 1
      streak += 1
      bestStreak = Math.max(bestStreak, streak)
    } else {
      streak = 0
    }
  }
  if (qi === q.length) return 120 + bestStreak * 12 + hits * 2
  return 0
}

/** Mélange déterministe (pour données de démo stables). */
export function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export const isMac =
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)

export const modifierKeyLabel = isMac ? '⌘' : 'Ctrl'
