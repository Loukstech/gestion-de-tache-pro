/**
 * Analyseur de dates et d'heures en français naturel.
 * Gère : aujourd'hui, demain, après-demain, lundi prochain, le 20 septembre,
 * dans 3 jours, ce week-end, fin du mois, à 15h30, demain soir, hier,
 * la semaine prochaine, tous les vendredis…
 */
import { fold } from './normalize.js'

export const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
export const MONTHS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
]

const ORDINALS = { premier: 1, premiere: 1, er: 1 }

const startOfDay = (date) => {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const addDays = (date, days) => {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

const addMonths = (date, months) => {
  const copy = new Date(date)
  const day = copy.getDate()
  copy.setMonth(copy.getMonth() + months)
  if (copy.getDate() < day) copy.setDate(0)
  return copy
}

export const dateUtils = { startOfDay, addDays, addMonths }

/** ISO local (YYYY-MM-DD) sans le décalage UTC de toISOString(). */
export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** YYYY-MM-DDTHH:mm en heure locale. */
export function toLocalDateTime(date) {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${toISODate(date)}T${hh}:${mm}`
}

export function fromISODate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const [datePart, timePart] = String(value).split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  if (timePart) {
    const [hh, mm] = timePart.split(':').map(Number)
    date.setHours(hh || 0, mm || 0, 0, 0)
  }
  return date
}

/** Différence en jours calendaires (sans les heures) entre deux dates. */
export function daysBetween(a, b) {
  const d1 = startOfDay(a).getTime()
  const d2 = startOfDay(b).getTime()
  return Math.round((d2 - d1) / 86400000)
}

const TIME_PART_DEFAULTS = {
  matin: 9,
  'debut de matinee': 8,
  midi: 12,
  'apres-midi': 14,
  aprem: 14,
  soir: 19,
  soiree: 20,
  nuit: 22,
  'fin de journee': 18,
}

/**
 * Extrait toutes les informations temporelles d'un énoncé.
 * Retourne { due, dueRanges, hasTime, text, mentions[] }
 */
export function parseDateExpression(rawText, reference = new Date()) {
  const text = String(rawText || '')
  const folded = fold(text)
  const ranges = []
  const mentions = []

  let due = null
  let hasTime = false
  let timeFromPartOfDay = false

  const register = (pattern, handler, options = {}) => {
    const flags = options.global === false ? 'i' : 'gi'
    const regex = new RegExp(pattern.source, flags)
    let match
    const limit = options.limit || 4
    let count = 0
    while ((match = regex.exec(folded)) !== null && count < limit) {
      count += 1
      const result = handler(match, folded)
      if (!result) continue
      ranges.push([match.index, match.index + match[0].length - 1])
      mentions.push({ raw: text.slice(match.index, match.index + match[0].length), ...result.mention })
      if (result.date && !due) {
        due = result.date
      } else if (result.date && due && (options.mergeTime || result.timeOnly || result.timeFromPartOfDay)) {
        due = mergeDateTime(due, result.date, Boolean(result.timeOnly || result.timeFromPartOfDay))
      }
      if (result.hasTime) hasTime = true
      if (result.timeFromPartOfDay) timeFromPartOfDay = true
      if (regex.lastIndex === match.index) regex.lastIndex += 1
      if (!options.keepGoing) break
    }
  }

  // ---------- 1. Dates relatives simples ----------
  register(/\b(aujourd'hui|ce jour|dans la journee)\b/i, () => ({
    date: startOfDay(reference),
    mention: { kind: 'relative', value: "aujourd'hui" },
  }))

  register(/(?<!apre?s-)\b(demain|demain matin)\b/i, (match) => {
    const base = addDays(startOfDay(reference), 1)
    if (/matin/.test(match[0])) return { date: withHour(base, 9), hasTime: true, timeFromPartOfDay: true, mention: { kind: 'relative', value: 'demain matin' } }
    return { date: base, mention: { kind: 'relative', value: 'demain' } }
  })

  register(/\b(apres-demain)\b/i, () => ({
    date: addDays(startOfDay(reference), 2),
    mention: { kind: 'relative', value: 'après-demain' },
  }))

  register(/\b(hier)\b/i, () => ({
    date: addDays(startOfDay(reference), -1),
    mention: { kind: 'relative', value: 'hier' },
  }))

  register(/\b(avant-hier)\b/i, () => ({
    date: addDays(startOfDay(reference), -2),
    mention: { kind: 'relative', value: 'avant-hier' },
  }))

  // ---------- 2. « dans N jours / semaines / mois » ----------
  register(/\b(dans|d'ici|sous)\s+(\d+)\s*(jours?|semaines?|mois|annees?|ans|heures?|minutes?|min)\b/i, (match) => {
    const amount = parseInt(match[2], 10)
    const unit = match[3]
    let date
    if (/jour/.test(unit)) date = addDays(startOfDay(reference), amount)
    else if (/semaine/.test(unit)) date = addDays(startOfDay(reference), amount * 7)
    else if (/mois/.test(unit)) date = addMonths(startOfDay(reference), amount)
    else if (/an/.test(unit)) date = addMonths(startOfDay(reference), amount * 12)
    else if (/heure/.test(unit)) { date = new Date(reference.getTime() + amount * 3600000); return { date, hasTime: true, mention: { kind: 'relative', value: `dans ${amount} h` } } }
    else { date = new Date(reference.getTime() + amount * 60000); return { date, hasTime: true, mention: { kind: 'relative', value: `dans ${amount} min` } } }
    return { date, mention: { kind: 'relative', value: `dans ${amount} ${unit}` } }
  })

  register(/\b(dans un moment|bientot|prochainement|ces jours-ci)\b/i, () => ({
    date: addDays(startOfDay(reference), 3),
    mention: { kind: 'relative', value: 'bientôt' },
  }))

  // ---------- 3. Jours de la semaine ----------
  register(
    new RegExp(`\\b(${WEEKDAYS.join('|')})\\s*(prochain|suivant|dernier)?\\b`, 'i'),
    (match) => {
      const target = WEEKDAYS.indexOf(match[1])
      const modifier = match[2] || ''
      const current = reference.getDay()
      let delta = (target - current + 7) % 7
      if (modifier === 'dernier') delta = delta === 0 ? -7 : delta - 7
      else if (delta === 0) delta = 7 // « lundi » = le prochain lundi
      else if (modifier === 'prochain' && delta <= 2) delta += 7
      return { date: addDays(startOfDay(reference), delta), mention: { kind: 'weekday', value: `${match[1]} ${modifier}`.trim() } }
    },
  )

  register(/\b(ce week-end|ce weekend|le week-end|ce week end|weekend)\b/i, () => {
    const current = reference.getDay()
    const delta = (6 - current + 7) % 7 || 7
    return { date: addDays(startOfDay(reference), delta), mention: { kind: 'relative', value: 'ce week-end' } }
  })

  register(/\b(la semaine prochaine|semaine prochaine|la semaine d'apres)\b/i, () => {
    const current = reference.getDay()
    const nextMonday = addDays(startOfDay(reference), ((1 - current + 7) % 7) + 7)
    return { date: nextMonday, mention: { kind: 'relative', value: 'la semaine prochaine' } }
  })

  register(/\b(cette semaine|la semaine|en cours de semaine)\b/i, () => ({
    date: addDays(startOfDay(reference), Math.max(1, 5 - reference.getDay())),
    mention: { kind: 'relative', value: 'cette semaine' },
  }))

  register(/\b(le mois prochain|mois prochain)\b/i, () => ({
    date: addMonths(startOfDay(reference), 1),
    mention: { kind: 'relative', value: 'le mois prochain' },
  }))

  register(/\b(fin du mois|a la fin du mois|fin de mois)\b/i, () => {
    const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0)
    return { date: startOfDay(end), mention: { kind: 'relative', value: 'fin du mois' } }
  })

  register(/\b(debut du mois|au debut du mois)\b/i, () => {
    const first = new Date(reference.getFullYear(), reference.getMonth() + 1, 1)
    return { date: startOfDay(first), mention: { kind: 'relative', value: 'début du mois' } }
  })

  register(/\b(fin d'annee|fin de l'annee)\b/i, ({
    date: new Date(reference.getFullYear(), 11, 31),
    mention: { kind: 'relative', value: "fin d'année" },
  }))

  register(/\b(apres midi|cet apres-midi|cette apres-midi)\b/i, () => ({
    date: withHour(startOfDay(reference), 14),
    hasTime: true,
    timeFromPartOfDay: true,
    mention: { kind: 'part-of-day', value: 'après-midi' },
  }), { mergeTime: true })

  register(/\b(ce soir|le soir|soiree|cette soiree)\b/i, () => ({
    date: withHour(startOfDay(reference), 19),
    hasTime: true,
    timeFromPartOfDay: true,
    mention: { kind: 'part-of-day', value: 'ce soir' },
  }), { mergeTime: true })

  register(/\b(ce matin|le matin|matinee)\b/i, () => ({
    date: withHour(startOfDay(reference), 9),
    hasTime: true,
    timeFromPartOfDay: true,
    mention: { kind: 'part-of-day', value: 'ce matin' },
  }), { mergeTime: true })

  register(/\b(a midi|ce midi|pour midi)\b/i, () => ({
    date: withHour(startOfDay(reference), 12),
    hasTime: true,
    mention: { kind: 'part-of-day', value: 'midi' },
  }), { mergeTime: true })

  // ---------- 4. Date explicite : le 20 septembre, 20/09, 20 septembre 2027 ----------
  register(
    new RegExp(`\\b(?:le\\s+)?(\\d{1,2})(?:er)?\\s+(${MONTHS.join('|')})(?:\\s+(\\d{4}))?\\b`, 'i'),
    (match) => {
      const day = parseInt(match[1], 10)
      const month = MONTHS.indexOf(match[2])
      if (day < 1 || day > 31 || month < 0) return null
      const year = match[3] ? parseInt(match[3], 10) : reference.getFullYear()
      let candidate = new Date(year, month, day)
      if (candidate.getDate() !== day) return null
      if (!match[3] && daysBetween(reference, candidate) < 0) candidate = new Date(year + 1, month, day)
      return { date: startOfDay(candidate), mention: { kind: 'absolute', value: `${day} ${match[2]}${match[3] ? ` ${match[3]}` : ''}` } }
    },
  )

  register(/\b(?:le\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/i, (match) => {
    const a = parseInt(match[1], 10)
    const b = parseInt(match[2], 10)
    if (a > 31 || b > 12 || a < 1 || b < 1) return null
    let year = match[3] ? parseInt(match[3], 10) : reference.getFullYear()
    if (year < 100) year += 2000
    let candidate = new Date(year, b - 1, a)
    if (candidate.getDate() !== a) return null
    if (!match[3] && daysBetween(reference, candidate) < -1) {
      candidate = new Date(year + 1, b - 1, a)
    }
    return { date: startOfDay(candidate), mention: { kind: 'absolute', value: `${a}/${b}${match[3] ? `/${match[3]}` : ''}` } }
  })

  register(/(?:(?<=^|[^\p{L}]))(matin|midi|apres-midi|soiree|soir|nuit)(?![\p{L}])/iu, (match) => {
    const hour = TIME_PART_DEFAULTS[match[1]] ?? 9
    return {
      date: withHour(startOfDay(due || reference), hour),
      hasTime: true,
      timeOnly: true,
      timeFromPartOfDay: true,
      mention: { kind: 'part-of-day', value: match[1] },
    }
  }, { mergeTime: true, limit: 1 })

  // ---------- 5. Heure ----------
  register(/(?<![\p{L}]\s)(?<!pendant\s)(?<!dur[ée]e\s)\b(?:a|vers|pour|des|à)\s*(\d{1,2})\s*h(?:\s*(\d{1,2}))?\s*(du matin|du soir|de l'apres-midi|pm|am)?\b/i, (match) => {
    let hour = parseInt(match[1], 10)
    const minute = match[2] ? parseInt(match[2], 10) : 0
    const suffix = fold(match[3] || '')
    if (hour > 23) return null
    if (/soir|pm|apres-midi/.test(suffix) && hour < 12) hour += 12
    if (/matin|am/.test(suffix) && hour === 12) hour = 0
    return { date: withMinute(startOfDay(due || reference), hour, minute), hasTime: true, timeOnly: true, mention: { kind: 'time', value: `${hour}h${String(minute).padStart(2, '0')}` } }
  }, { mergeTime: true, keepGoing: true, limit: 2 })

  register(/(?<!pendant\s)(?<!dur[ée]e\s)(?<!environ\s)\b(\d{1,2})\s*h(?:\s*(\d{1,2}))?(?!\s*(?:de travail|de route|environ|et|du matin|du soir))?\b/i, (match) => {
    const hour = parseInt(match[1], 10)
    const minute = match[2] ? parseInt(match[2], 10) : 0
    if (hour > 23 || minute > 59) return null
    return { date: withMinute(startOfDay(due || reference), hour, minute), hasTime: true, timeOnly: true, mention: { kind: 'time', value: `${hour}h${String(minute).padStart(2, '0')}` } }
  }, { mergeTime: true, limit: 2 })

  register(/(?<!pendant\s)(?<!dur[ée]e\s)(?<!environ\s)\b(\d{1,2})\s*heures?\s*(et\s*)?(demie|demi|trente)?(?!\s*(?:de travail|de route|environ|par jour|par semaine|supplementaire))\b/i, (match) => {
    const hour = parseInt(match[1], 10)
    if (hour > 23) return null
    const minute = match[3] ? 30 : 0
    return { date: withMinute(startOfDay(due || reference), hour, minute), hasTime: true, timeOnly: true, mention: { kind: 'time', value: `${hour}h${minute ? '30' : '00'}` } }
  }, { mergeTime: true, limit: 2 })

  return {
    due: due ? normaliseFinalDate(due, hasTime, timeFromPartOfDay, reference) : null,
    hasTime,
    timeFromPartOfDay,
    ranges,
    mentions,
  }
}

function normaliseFinalDate(date, hasTime, timeFromPartOfDay, reference) {
  // Une date « jour » sans heure précise reste à 09:00 pour un affichage utile,
  // mais on ne la marque pas comme horodatée.
  if (!hasTime) return withHour(startOfDay(date), 9)
  if (timeFromPartOfDay && date.getHours() === 0) return withHour(date, 9)
  // Une heure déjà passée sans jour mentionné -> report au lendemain.
  if (date.getTime() < reference.getTime() && daysBetween(reference, date) === 0) {
    return addDays(date, 1)
  }
  return date
}

function withHour(date, hour) {
  const copy = new Date(date)
  copy.setHours(hour, 0, 0, 0)
  return copy
}

function withMinute(date, hour, minute) {
  const copy = new Date(date)
  copy.setHours(hour, minute, 0, 0)
  return copy
}

function mergeDateTime(base, incoming, timeOnly) {
  if (timeOnly) return withMinute(startOfDay(base), incoming.getHours(), incoming.getMinutes())
  return incoming
}

/**
 * Durée estimée : « ça prend 30 minutes », « prévoir 2 heures ».
 * Renvoie aussi la plage de texte à retirer du titre de la tâche.
 */
export function parseEstimate(text, maskedText = text) {
  const folded = fold(maskedText)

  const withVerb = /(ca prend|ça prend|prend|prevoir|prévoir|estime|estimée|duree de|durée de)\s+(environ\s+)?(\d+)\s*(heures?|h|minutes?|min|jours?|semaines?)/i.exec(folded)
  const bare = withVerb
    ? null
    : /(environ\s+)?(\d+)\s*(heures?|minutes?|min)\b(?!\s*h)/i.exec(folded)

  const match = withVerb || bare
  if (!match) return null

  const offset = withVerb ? 2 : 1
  const value = parseInt(match[offset + 1], 10)
  const unit = match[offset + 2]

  let minutes = value
  if (/heur|^h$/.test(unit)) minutes = value * 60
  else if (/jour/.test(unit)) minutes = value * 60 * 8
  else if (/semaine/.test(unit)) minutes = value * 60 * 8 * 5
  else if (/min/.test(unit)) minutes = value

  return { minutes, raw: match[0], range: [match.index, match.index + match[0].length - 1] }
}

/** Libellé humain d'une échéance, en français. */
export function humanizeDue(date, { withTime = true } = {}) {
  if (!date) return ''
  const now = new Date()
  const delta = daysBetween(now, date)
  const time = withTime && date.getHours() !== 9 ? ` à ${String(date.getHours()).padStart(2, '0')}h${String(date.getMinutes()).padStart(2, '0')}` : ''

  if (delta === 0) return `Aujourd'hui${time}`
  if (delta === 1) return `Demain${time}`
  if (delta === -1) return `Hier${time}`
  if (delta === 2) return `Après-demain${time}`
  if (delta > 2 && delta < 7) return `${capitalizeWord(WEEKDAYS[date.getDay()])}${time}`
  if (delta >= 7 && delta < 14) return `Semaine prochaine · ${capitalizeWord(WEEKDAYS[date.getDay()])}${time}`
  if (delta < 0) return `Retard de ${Math.abs(delta)} j · ${date.getDate()}/${date.getMonth() + 1}${time}`
  return `${date.getDate()} ${capitalizeWord(MONTHS[date.getMonth()])}${date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : ''}${time}`
}

function capitalizeWord(word = '') {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Prochaine occurrence d'une récurrence après une date donnée. */
export function nextOccurrence(rrule, fromDate, anchor = new Date()) {
  if (!rrule) return null
  const base = fromDate ? new Date(fromDate) : new Date(anchor)
  switch (rrule) {
    case 'daily': return addDays(base, 1)
    case 'weekly': return addDays(base, 7)
    case 'monthly': return addMonths(base, 1)
    case 'yearly': return addMonths(base, 12)
    case 'workdays': {
      let next = addDays(base, 1)
      while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1)
      return next
    }
    case 'weekly-day': {
      const targetDay = base.getDay()
      const next = addDays(base, 7)
      next.setDate(next.getDate() + ((targetDay - next.getDay() + 7) % 7))
      return next
    }
    case 'interval': return addDays(base, 2)
    default: return null
  }
}

export { ORDINALS }
