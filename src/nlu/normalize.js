/**
 * Normalisation du français oral.
 *
 * La dictée vocale renvoie du texte brut, parfois fautif : "vingt septembre",
 * "a quinze heure trente", "j'aimerais rajouter", apostrophes typographiques…
 * Ce module nettoie tout ça AVANT l'analyse sémantique.
 */

const UNITES = {
  zero: 0, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8,
  neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15,
  seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
}

const TEEN_SUFFIX = ['sept', 'huit', 'neuf']
const UNITES_LIST = ['un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']

/** Mot après lequel « un / une » est un article, pas le chiffre 1. */
const NOUN_AFTER_ONE = /^(tache|tâche|taches|tâches|rappel|action|truc|chose|idee|idée|note|liste|affaire|course|courses|chose|element|élément|etape|étape)$/i

/**
 * Convertit les nombres écrits en lettres en chiffres :
 * « dix-sept heures trente » → « 17 heures 30 », « dans trois jours » → « dans 3 jours ».
 */
export function wordsToNumber(sentence) {
  const expanded = String(sentence)
    .toLowerCase()
    // « dix-sept » → « dix sept », « quatre-vingt-dix » → « quatre vingt dix »…
    // mais « après-demain », « week-end » et les #hashtags sont préservés.
    .replace(/\b(dix|vingt|trente|quarante|cinquante|soixante)-(sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|un|deux|trois|quatre|cinq|six)\b/g, '$1 $2')
    .replace(/\bquatre-vingt(s)?-(un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize)\b/g, 'quatre vingt $2')
    .replace(/\bquatre-vingts?\b/g, 'quatre vingt')
    .replace(/\b(soixante)-(dix|onze|douze|treize|quatorze|quinze|seize)\b/g, '$1 $2')

  const tokens = expanded.split(/\s+/).filter(Boolean)
  const out = []
  let i = 0

  while (i < tokens.length) {
    const a = tokens[i]
    const b = tokens[i + 1]
    const c = tokens[i + 2]

    // quatre-vingt(-N)
    if (a === 'quatre' && (b === 'vingt' || b === 'vingts')) {
      if (c && UNITES_LIST.includes(c)) { out.push(String(80 + valueOfUnit(c))); i += 3; continue }
      out.push('80'); i += 2; continue
    }

    // soixante-dix … soixante-seize
    if (a === 'soixante' && ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'].includes(b)) {
      out.push(String(60 + valueOfUnit(b))); i += 2; continue
    }

    // dix-sept / dix-huit / dix-neuf
    if (a === 'dix' && TEEN_SUFFIX.includes(b)) {
      out.push(String(10 + valueOfUnit(b))); i += 2; continue
    }

    // vingt-cinq, trente et un, etc.
    if (UNITES[a] !== undefined) {
      const base = UNITES[a]
      if (UNITES_LIST.includes(b)) { out.push(String(base + valueOfUnit(b))); i += 2; continue }
      if (b === 'et' && UNITES_LIST.includes(c)) { out.push(String(base + valueOfUnit(c))); i += 3; continue }
      out.push(String(base)); i += 1; continue
    }

    // cent / mille : composition simple
    if (a === 'cent' || a === 'cents') {
      const previous = Number(out[out.length - 1])
      if (out.length && !Number.isNaN(previous) && b && UNITES_LIST.includes(b)) {
        out[out.length - 1] = String(previous * 100 + valueOfUnit(b))
        i += 2
        continue
      }
      if (out.length && !Number.isNaN(previous)) { out[out.length - 1] = String(previous * 100); i += 1; continue }
      if (b && UNITES_LIST.includes(b)) { out.push(String(100 + valueOfUnit(b))); i += 2; continue }
      out.push('100'); i += 1; continue
    }

    // un / une : chiffre seulement devant une unité de temps ou de quantité
    if ((a === 'un' || a === 'une') && /^(jour|jours|semaine|semaines|mois|an|ans|annee|annees|heure|heures|minute|minutes|min|h|quart)$/.test(b || '')) {
      out.push('1'); i += 1; continue
    }

    out.push(tokens[i])
    i += 1
  }

  return out.join(' ')
}

function valueOfUnit(word) {
  if (word === 'un' || word === 'une') return 1
  return UNITES[word] ?? UNITES_LIST.indexOf(word) + 1
}

const REPLACEMENTS = [
  // Verbes de création mal transcrits
  [/\b(rajoute|rajouter|re ajoute)\b/g, 'ajoute'],
  [/\b(crée|cree|créé|créee|creee|créez|crees)\b/g, 'crée'],
  // Heures — mais jamais une durée (« environ 2 heures » ≠ « à 2 heures »)
  [/(?<!pendant |durée |duree |environ |près de |pres de )\b(\d{1,2})\s*heures?\s+(\d{1,2})\b/gi, '$1h$2'],
  [/(?<!pendant |durée |duree |environ )\b(\d{1,2})\s*heures?\s+et\s+demie\b/gi, '$1h30'],
  [/(?<!pendant |durée |duree |environ |près de |pres de )\b(\d{1,2})\s*heures?\b/gi, '$1h'],
  [/\b(\d{1,2})\s*:\s*(\d{2})\b/g, '$1h$2'],
  [/\b(\d{1,2})\s+h\s+(\d{1,2})\b/gi, '$1h$2'],
  [/\b(\d{1,2})\s+h\b/gi, '$1h'],
  // Orthographe courante en dictée vocale
  [/\b(aujourd'hui|aujourdhui|aujourd hui|ojourd'hui)\b/gi, "aujourd'hui"],
  [/\b(apres-demain|apres demain|après demain)\b/gi, 'après-demain'],
  [/\b(apres midi|apres-midi|après midi|aprem)\b/gi, 'après-midi'],
  [/\b(tout de suite|tous de suite|toute de suite)\b/gi, 'tout de suite'],
  [/\b(week-end|weekend|week end|ouiquende)\b/gi, 'week-end'],
  [/\b(rendez vous|rendez-vous|rdv.)\b/gi, 'rdv'],
  [/\b(s'il te plait|s'il te plaît|stp|s'il vous plait|s'il vous plaît|svp)\b/gi, 'stp'],
  [/\b(tâche|tache|tàche)\b/gi, 'tâche'],
  [/\b(d'abord|d abord|dabbord)\b/gi, "d'abord"],
]

const FILLER_WORDS = /^(bon|ben|bah|euh|eu|bin|hein|voilà|voila|donc|alors|du coup|en fait|stp|svp|merci)$/i

/**
 * Nettoie un énoncé parlé : nombres en chiffres, heures normalisées,
 * tics de langage retirés, ponctuation stabilisée.
 */
export function normalizeFrench(input = '') {
  let text = String(input).replace(/\s+/g, ' ').trim()
  if (!text) return ''

  // 0. Apostrophes typographiques -> apostrophe droite (crucial pour les \b)
  text = text.replace(/[\u2018\u2019\u02bc\u2032`]/g, "'")

  // 1. Ponctuation dictée -> ponctuation réelle
  text = text
    .replace(/\bvirgule\b/gi, ',')
    .replace(/\bpoint d'exclamation\b/gi, '!')
    .replace(/\bpoint d'interrogation\b/gi, '?')
    .replace(/\bdeux points\b/gi, ':')
    .replace(/\bpoint virgule\b/gi, ';')
    .replace(/\bdièse\b/g, '#')
    .replace(/\bà la ligne\b/gi, '\n')
    .replace(/\bpoint\b(?!\s*(?:d'|de))/gi, '.')

  // 2. Nombres en lettres -> chiffres (AVANT les heures : « dix-sept heures trente »
  //    devient « 17 heures 30 » puis « 17h30 »).
  text = wordsToNumber(text)

  // 3. Remplacements canoniques (heures, orthographe de dictée vocale)
  REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement)
  })

  // 4. Nettoyage final
  text = text
    .split(' ')
    .filter((word) => !FILLER_WORDS.test(word.replace(/[.,!?;:]/g, '')))
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,;:])(?=\S)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return text
}

/**
 * Pliage : sans accents, en minuscules, apostrophes droites.
 * La longueur est strictement conservée (les indices restent alignés
 * avec le texte d'origine), ce qui permet de découper proprement.
 */
export function fold(text = '') {
  return String(text)
    .replace(/[\u2018\u2019\u02bc\u2032`]/g, "'")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Bornes de « mot » compatibles avec le français : l'apostrophe fait partie
 * du mot (dossier-travail, j'ai, l'équipe). `\b` natif échoue sur ces cas.
 */
/**
 * Bornes de mot adaptées au français.
 *  - à gauche : l'apostrophe fait partie du mot (« d'électricité », « j'ai »),
 *    donc on refuse qu'une lettre précède directement le motif ;
 *  - à droite : borne stricte, les pluriels sont gérés par le lexique.
 */
export const WBL = "(?<![\\p{L}\\p{N}_'])"
export const WBR = "\\b"


const withUnicode = (flags) => (flags.includes('u') ? flags : `${flags}u`)

/** Construit une RegExp avec bornes françaises sûres autour d'un motif littéral. */
export function wordRegex(literal, flags = 'i') {
  const escaped = String(literal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${WBL}${escaped}${WBR}`, withUnicode(flags))
}

/** Construit une RegExp à partir d'un motif brut avec bornes françaises. */
export function boundaryRegex(source, flags = 'i') {
  return new RegExp(`${WBL}(?:${source})${WBR}`, withUnicode(flags))
}

/** Retire tous les segments [start, end] d'un texte, puis recolle proprement. */
export function cutRanges(text, ranges) {
  if (!ranges?.length) return cleanup(text)
  const merged = []
  ;[...ranges].sort((a, b) => a[0] - b[0]).forEach(([start, end]) => {
    const last = merged[merged.length - 1]
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  })

  let result = ''
  let cursor = 0
  merged.forEach(([start, end]) => {
    result += `${text.slice(cursor, start)} \u0000 `
    cursor = end + 1
  })
  result += text.slice(cursor)

  return result
    .split('\u0000')
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^[\s,.;:!?\-–—]+|[\s,.;:!?\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
}

function cleanup(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}
