/**
 * TaskVox NLU — moteur de compréhension du langage naturel en français.
 *
 * Aucun service payant, aucune API externe : tout s'exécute dans le navigateur.
 * L'API publique est `interpret(phrase)` ; brancher plus tard un LLM (OpenAI,
 * Mistral, Gemini…) revient à écrire un adaptateur renvoyant le même objet.
 */
import { fold, normalizeFrench, cutRanges, wordRegex, boundaryRegex } from './normalize.js'
import { CATEGORIES, CATEGORY_ORDER, PRIORITIES, AUTO_TAGS, RECURRENCE_PATTERNS } from './lexicon.js'
import { parseDateExpression, parseEstimate, toLocalDateTime, WEEKDAYS } from './dates.js'
import { capitalize, uid } from '../lib/utils.js'

/* ------------------------------------------------------------------ */
/* Motifs d'intention                                                 */
/* ------------------------------------------------------------------ */

const CREATION_HINTS = [
  boundaryRegex("ajoute|ajouter|ajoutez|ajoutes|note|noter|enregistre|enregistrer|crée|cree|creer|mémorise|memorise"),
  boundaryRegex("nouvelle tâche|nouvelle tache|nouveau rappel|une tâche|une tache|un rappel"),
  boundaryRegex("je dois|j'ai à|j'ai a|il faut que|il faut|faut que|besoin de"),
  boundaryRegex("rappelle-moi|rappelle moi|ne pas oublier|n'oublie pas|pense à|pense a"),
  boundaryRegex("planifie|planifier|programmer|programme"),
]

const QUERY_HINTS = [
  boundaryRegex('liste|lister|affiche|afficher|montre|montrer|voir'),
  boundaryRegex("quelles|quels|quelle|quel"),
  boundaryRegex("qu'est-ce que|qu est ce que|qu'est ce que|quels sont|quelles sont"),
  boundaryRegex('rappelle-moi ce|redonne|récapitule|recapitule|fais le point'),
  boundaryRegex('combien|statistique|statistiques|stats|bilan|résumé|resume|synthèse|synthese|productivité'),
  boundaryRegex('cherche|chercher|recherche|trouve|trouver'),
  boundaryRegex('agenda|planning|calendrier'),
]

const INTENT_RULES = [
  {
    intent: 'help',
    patterns: [
      boundaryRegex('aide|aide-moi|help'),
      /comment (ca|ça|tu|vous|on)\s*(marche|fonctionne)/i,
      /qu'est[- ]ce que (tu|vous) (sais|peux|peut) faire/i,
      boundaryRegex('commandes vocales|exemples de commandes|exemples de phrases|raccourcis clavier'),
    ],
  },
  {
    intent: 'undo',
    patterns: [/annule (ca|ça|la derniere|la dernière|tout)|retour arriere|revenir en arriere|^undo$/i],
  },
  {
    intent: 'stats',
    patterns: [
      boundaryRegex('statistiques|statistique|stats|bilan|résumé|resume|synthèse|synthese|productivité|tableau de bord'),
      /combien (de|j'ai|il|il me)/i,
      /ou j'en suis|comment ca avance|comment ça avance/i,
    ],
  },
  {
    intent: 'delete',
    patterns: [
      boundaryRegex('supprime|supprimer|supprimes|efface|effacer|enleve|enlève|enlever|retire|retirer|jette|vire'),
      /annule (mon|ma|mes|le|la|les)\b/i,
    ],
  },
  {
    intent: 'complete',
    patterns: [
      boundaryRegex("termine(?!e|es|ée|ées|és)|terminer|finis(?!\s*(?:e|es|ée|ées))|j'ai fini|j ai fini|coche(?!r)|cocher|valide(?!s)|valider|bouclé|boucle"),
      boundaryRegex("marque|marquer|considère|considere"),
      /c'est fait|c est fait/i,
    ],
  },
  {
    intent: 'update',
    patterns: [
      boundaryRegex('modifie|modifier|change|changer|renomme|renommer|édite|edite'),
      boundaryRegex('decale|décale|reporte|reporter|repousse|repousser'),
      /^passe\b/i,
      boundaryRegex('mets à jour|met a jour|mets a jour'),
      /priorit(e|é)\s+(haute|critique|basse|normale|moyenne)/i,
    ],
  },
  {
    intent: 'search',
    patterns: [boundaryRegex('cherche|chercher|recherche|rechercher|trouve|trouver|retrouve')],
  },
  {
    intent: 'list',
    patterns: [
      boundaryRegex('liste|lister|affiche|afficher|montre|montrer|donne-moi|donne moi|redonne|récapitule|recapitule'),
      /qu'est[- ]?ce que (j'ai|je dois|il me|il reste)|que (dois-je|dois je)|quelles (sont|taches)|quels sont|quoi faire|qu'est[- ]?ce qu'il me reste|j'ai (a|à) faire|il me reste/i,
      boundaryRegex('mes taches|mes tâches|la liste|mon agenda|mon planning|mon programme'),
      boundaryRegex('en retard|restantes|non terminees|non terminées|ce qui reste'),
    ],
  },
]

const NEGATION_GUARD = boundaryRegex('non|laisse tomber|annule tout|jamais|pas besoin|arrete|arrête|stop|tais-toi')

// Une phrase qui n'est pas une consigne : question, bavardage, confirmation seule.
// Elle ne doit jamais devenir une tâche implicite.
const QUESTION_GUARD = [
  /^(?:est[- ]?ce\b|est ce\b|qu'est[- ]?ce\b|qu est ce\b|comment\b|pourquoi\b|quand\b|où\b|ou\b|qui\b|combien\b|quel(?:le|s|les)?\b)/i,
  /\?\s*$/,
  /\b(?:tu|vous)\s+(?:me\s+|m'|te\s+|t'|nous\s+|vous\s+)?(?:comprends|comprend|entends|entend|écoutes|écoute|parles|parle|sais|savez|peux|pouvez|connais|connaissez)\b/i,
]

const SMALL_TALK_GUARD = [
  /^(?:bonjour|bonsoir|salut|coucou|hello|hey|ok\b|okay\b|d'accord\b|dac\b|merci\b|pardon\b|excuse(?:z|-moi)?\b|oui\b|non\b|peut[- ]?être\b)/i,
  /^(?:je t'aime|je vous aime|j'aime|ça va\b|ca va\b|tu vas bien\b|vous allez bien\b)/i,
]

const CONVERSATION_GUARDS = [...QUESTION_GUARD, ...SMALL_TALK_GUARD]

function matchesConversation(value) {
  const raw = String(value || '')
  const foldedValue = fold(raw)
  return CONVERSATION_GUARDS.some((pattern) => pattern.test(raw) || pattern.test(foldedValue))
}

const NOISE_FILLERS = [
  boundaryRegex("s'il te plait|stp|s'il vous plait|svp|merci beaucoup|merci", 'gi'),
  boundaryRegex("est-ce que tu peux|est ce que tu peux|peux-tu|pourrais-tu|tu peux|tu pourrais", 'gi'),
  boundaryRegex("il faut que je|il faut que j'|il faut|faut que je|faut que j'|je dois|j'ai à|j'ai a", 'gi'),
  /\bc'est fait\b/gi,
  boundaryRegex("en gestion de tâches|en gestion de tache", 'gi'),
  boundaryRegex("je veux|je voudrais|j'aimerais|j aimerai", 'gi'),
]

const CREATION_PREFIXES = [
  // « ajoute(-moi) une (nouvelle) tâche … » — le lookahead final empêche
  // le motif de mordre dans le premier mot du titre (« il faut » ≠ « arroser »).
  new RegExp(
    `^\\s*(?:bon\\s+)?(?:tu\\s+)?(?:vas\\s+|veux\\s+|peux\\s+|pourrais\\s+)?(?:me\\s+|nous\\s+|m')?` +
      `(?:ajouter|ajoute|ajoutes|ajoutez|crée|cree|crées|creez|creer|enregistre|enregistrer|note|noter|mémorise|memorise|mettre|planifie|programme)(?:[- ](?:moi|me|nous))?(?![\\p{L}])\\s+` +
      `(?:moi\\s+)?(?:une?\\s+|des\\s+|la\\s+|le\\s+|les\\s+)?` +
      `(?:nouvelle\\s+|autre\\s+|petite\\s+)?` +
      `(?:tâches?|taches?|trucs?|choses?|activités?|activites?|actions?|rappels?|items?|éléments?|elements?)?` +
      `\\s*(?:supplémentaire|supplementaire)?\\s*(?:(?:pour|sur|dans|a|à|de)(?![\\p{L}]))?\\s*`,
    'iu',
  ),
  /^\s*(?:nouvelle|nouveau)\s+(?:tâche|tache|rappel|action|truc)\s*(?::|\s)?\s*/i,
  /^\s*(?:tâche|tache|rappel)\s*(?::)\s*/i,
  /^\s*rappelle[- ]moi\s+(?:de|d'|que)?\s*/i,
  /^\s*(?:n'oublie\s+pas\s+de|ne\s+pas\s+oublier\s+de|faut\s+pas\s+oublier\s+de)\s*/i,
  /^\s*(?:je\s+(?:dois|veux|voudrais)|il\s+faut(?:\s+que\s+je)?)(?![\p{L}])\s+/iu,
  /^\s*(?:j'ai\s+(?:besoin|envie)\s+de|besoin\s+de|envie\s+de)\s+/i,
  /^\s*(?:note\s+qu'?il\s+faut\s+|note\s+que\s+je\s+dois\s+|note\s+que\s+)/i,
  /^\s*(?:pense\s+[àa]\s*|à faire\s*[:\s]\s*)/i,
  /^\s*(?:planifie|planifier|programmer|programme|cale|caler)(?![\p{L}])\s+(?:moi\s+)?(?:une?\s+|la\s+)?(?:tâche|tache|rendez-vous|rdv|réunion|reunion)?\s*/iu,
  // Amorces résiduelles après un premier retrait (« … qu'il faut … », « … que je dois … »)
  /^\s*(?:qu'?il\s+faut(?:\s+que\s+je)?|que\s+je\s+dois|qu'?il\s+faut|que\s+je|il\s+faut(?:\s+que\s+je)?|faut(?:\s+que\s+je)?|je\s+dois)(?![\p{L}])\s+/iu,
  /^\s*(?:il\s+faut|faut|je\s+dois|j'ai\s+à|j'ai\s+a)(?![\p{L}])\s*/iu,
  /^\s*(?:qu'il|que|qui|quoi|dont|où|ou)\s+/iu,
  /^\s*(?:et\s+|puis\s+|ensuite\s+|donc\s+|alors\s+|du\s+coup\s+|bon\s+|ben\s+|bah\s+|euh\s+)+/i,
]

/* ------------------------------------------------------------------ */

export function interpret(rawInput, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const rawText = String(rawInput || '').trim()
  const normalized = normalizeFrench(rawInput)
  if (!normalized.trim()) {
    return {
      text: rawText,
      raw: rawInput,
      intent: 'unknown',
      intents: [],
      tasks: [],
      filters: {},
      confidence: 0,
      empty: true,
      notice: matchesConversation(rawText) ? 'conversation' : null,
      now,
    }
  }

  const segments = splitSegments(normalized)
  const results = segments.map((segment) => interpretSegment(segment, now, options))

  // Héritage des entités : « ajoute X demain et Y » → Y hérite de « demain ».
  const inherited = {}
  results.forEach((result) => {
    result.tasks.forEach((task) => {
      if (task.dueAt) inherited.dueAt = task.dueAt
      if (task.category && task.category !== 'divers') inherited.category = task.category
      if (task.priority && task.priority !== 'medium') inherited.priority = task.priority
    })
  })
  results.forEach((result) => {
    result.tasks.forEach((task) => {
      if (!task.dueAt && inherited.dueAt) task.dueAt = inherited.dueAt
      if ((!task.category || task.category === 'divers') && inherited.category) task.category = inherited.category
    })
  })

  const tasks = results.flatMap((result) => result.tasks)
  const intent = pickPrimaryIntent(results)
  const primary = results.find((result) => result.intent === intent) || results[0]

  return {
    text: normalized,
    raw: rawInput,
    now,
    intent,
    intents: results.map((result) => result.intent),
    segments: results.map((result) => result.text),
    tasks,
    filters: primary?.filters || {},
    patch: primary?.patch || null,
    targetAll: Boolean(primary?.targetAll),
    groupBy: primary?.groupBy || null,
    scope: primary?.scope || [],
    notice: results.find((result) => result.notice)?.notice || null,
    confidence: results.reduce((max, result) => Math.max(max, result.confidence || 0), 0),
    mentions: results.flatMap((result) => result.mentions || []),
  }
}

const INTENT_PRIORITY = ['help', 'undo', 'delete', 'complete', 'update', 'search', 'stats', 'list', 'create', 'unknown']

function pickPrimaryIntent(results) {
  const found = results.map((result) => result.intent)
  return INTENT_PRIORITY.find((intent) => found.includes(intent)) || 'unknown'
}

/* ------------------------------------------------------------------ */
/* Découpage multi-tâches                                             */
/* ------------------------------------------------------------------ */

const SPLIT_CONNECTORS = 'puis|ensuite|et aussi|également|egalement|deuxièmement|deuxiemement|troisièmement|troisiemement|autre chose'
const SPLIT_VERB_LOOKAHEAD = new RegExp(
  `(?=(?:^|\\s)(?:ajoute|ajoutez|crée|cree|note|enregistre)\\s+(?:moi\\s+)?(?:une?\\s+|la\\s+)?(?:tâche|tache)?)`,
  'gi',
)
const SPLIT_ET = "et(?=\\s+(?:je dois|il faut|faut|j'ai|rappelle|ne pas oublier|ajoute|crée|cree|note))"

export function splitSegments(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  if (!clean) return []

  let parts = clean.split(/(?<=[.!?;])\s+|\n+/).map((part) => part.trim()).filter(Boolean)

  const step2 = []
  parts.forEach((part) => {
    part.split(new RegExp(`\\s+(?:${SPLIT_CONNECTORS})\\s+`, 'gi'))
      .map((chunk) => chunk.trim()).filter(Boolean).forEach((chunk) => step2.push(chunk))
  })

  const step3 = []
  step2.forEach((part) => {
    part.split(SPLIT_VERB_LOOKAHEAD).map((chunk) => chunk.trim()).filter(Boolean).forEach((chunk) => step3.push(chunk))
  })

  const step4 = []
  step3.forEach((part) => {
    part.split(new RegExp(`\\s+${SPLIT_ET}`, 'gi'))
      .map((chunk) => chunk.replace(/^et\s+/i, '').trim()).filter(Boolean).forEach((chunk) => step4.push(chunk))
  })

  // 5. « ajoute X demain et Y samedi » : chaque membre porte sa propre date.
  const step5 = []
  step4.forEach((part) => {
    splitOnDateBoundary(part).forEach((chunk) => step5.push(chunk))
  })

  return step5.length ? step5 : [clean]
}

const DATE_BOUNDARY = boundaryRegex(
  "aujourd'hui|demain|apres-demain|après-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|week-end|semaine prochaine|cette semaine|mois prochain",
)

/** Coupe avant un « et » lorsque le membre suivant introduit une nouvelle date. */
function splitOnDateBoundary(part) {
  const foldedPart = fold(part)
  const dateHits = [...foldedPart.matchAll(new RegExp(DATE_BOUNDARY.source, 'giu'))]
  if (dateHits.length < 2) return [part]

  const chunks = []
  let cursor = 0
  for (let i = 1; i < dateHits.length; i += 1) {
    const window = foldedPart.slice(dateHits[i - 1].index + dateHits[i - 1][0].length, dateHits[i].index)
    const conjunction = /\bet\b/i.exec(window)
    if (!conjunction) continue
    const cutAt = dateHits[i - 1].index + dateHits[i - 1][0].length + conjunction.index + conjunction[0].length
    chunks.push(part.slice(cursor, cutAt - conjunction[0].length).trim())
    cursor = cutAt
  }
  if (!chunks.length) return [part]
  chunks.push(part.slice(cursor).trim())
  return chunks.map((chunk) => chunk.replace(/^et\s+/i, '').trim()).filter((chunk) => chunk.length > 1)
}

/* ------------------------------------------------------------------ */
/* Interprétation d'un segment                                        */
/* ------------------------------------------------------------------ */

function interpretSegment(segment, now, options) {
  const text = segment.trim()
  if (!text) return { text, intent: 'unknown', confidence: 0, tasks: [], filters: {} }

  const folded = fold(text)
  const intent = detectIntent(text, folded)

  if (intent === 'unknown' && NEGATION_GUARD.test(folded)) {
    return { text, intent: 'unknown', confidence: 0.4, tasks: [], filters: {}, notice: 'negation' }
  }

  switch (intent) {
    case 'create': return buildCreate(text, now, options, 0.95)
    case 'list': return buildList(text, folded, now)
    case 'search': return buildSearch(text, folded, now)
    case 'complete': return buildTargeted(text, folded, now, 'complete')
    case 'delete': return buildTargeted(text, folded, now, 'delete')
    case 'update': return buildUpdate(text, folded, now)
    case 'stats': return buildStats(text, folded, now)
    case 'help': return { text, intent: 'help', confidence: 0.95, tasks: [], filters: {} }
    case 'undo': return { text, intent: 'undo', confidence: 0.9, tasks: [], filters: {} }
    default: {
      if (matchesConversation(text)) {
        return { text, intent: 'unknown', confidence: 0.4, tasks: [], filters: {}, notice: 'conversation' }
      }
      const creation = buildCreate(text, now, options, 0.6, true)
      if (creation.tasks.length && creation.tasks[0].title.length > 2) return { ...creation, implicit: true }
      return { text, intent: 'unknown', confidence: 0.2, tasks: [], filters: {} }
    }
  }
}

export function detectIntent(text, folded = fold(text)) {
  const creationHit = CREATION_HINTS.some((pattern) => pattern.test(folded) || pattern.test(text))
  const queryHit = QUERY_HINTS.filter((pattern) => pattern.test(folded) || pattern.test(text)).length

  for (const rule of INTENT_RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(folded) || pattern.test(text))) continue

    if (rule.intent === 'complete' && creationHit) continue
    if (rule.intent === 'update' && creationHit) continue
    if (rule.intent === 'delete' && creationHit && !/supprime|efface|enleve|enlève|retire/i.test(folded)) continue
    if (rule.intent === 'stats' && creationHit) continue
    if (rule.intent === 'list' && creationHit && queryHit < 2 && !/^(?:montre|affiche|liste|donne|dis|rappelle)[-\s]/i.test(folded)) continue

    return rule.intent
  }

  if (creationHit && !/\?$/.test(text.trim())) return 'create'
  if (queryHit >= 1) return 'list'
  if (/\?$/.test(text.trim()) && /(?:qu'|que|quel|quelle|qui|quoi|combien|ou|où|quand|comment)/.test(folded)) return 'list'
  if (creationHit) return 'create'
  return 'unknown'
}

/* ------------------------------------------------------------------ */
/* Création                                                           */
/* ------------------------------------------------------------------ */

function buildCreate(text, now, options, baseConfidence, implicit = false) {
  let working = text.replace(/\bqu\s+il\s+faut\b/gi, "qu'il faut").replace(/\bc\s+est\b/gi, "c'est")
  let removedPrefix = false

  // 1. On retire d'abord le verbe introducteur (« ajoute une tâche … »),
  //    sinon les tournures de politesse cassent le motif.
  for (const pattern of CREATION_PREFIXES) {
    if (pattern.test(working)) {
      working = working.replace(pattern, '')
      removedPrefix = true
      break
    }
  }

  // 2. Puis les tournures de politesse (remplacées par une espace pour
  //    conserver l'alignement des index) et les amorces résiduelles.
  NOISE_FILLERS.forEach((pattern) => {
    working = working.replace(pattern, ' ')
  })
  working = working
    .replace(/^\s*(?:et\s+|puis\s+|ensuite\s+|donc\s+|alors\s+|du\s+coup\s+|bon\s+|ben\s+|bah\s+|euh\s+)/i, '')
    .replace(/^\s*(?:qu'?il\s+faut(?:\s+que\s+je)?|que\s+je\s+dois|que\s+je|qu'?il\s+faut|il\s+faut(?:\s+que\s+je)?|faut\s+que\s+je|je\s+dois|j'ai\s+(?:besoin|envie)\s+de)(?![\p{L}])\s+/iu, '')

    .replace(/\s{2,}/g, ' ')
    .trim()

  const entities = extractEntities(working, now)
  working = cutRanges(working, entities.ranges)
  working = cleanTitle(working)

  const tasks = []
  if (working.length >= 2) {
    tasks.push(buildTaskDraft(working, entities, now, { source: options.source || 'text' }))
  }

  return {
    text,
    intent: 'create',
    confidence: removedPrefix ? baseConfidence : tasks.length ? baseConfidence * 0.8 : 0.2,
    tasks,
    filters: {},
    mentions: entities.mentions,
    entities,
  }
}

function extractEntities(text, now) {
  const ranges = []
  const mentions = []

  // La durée estimée est extraite AVANT les dates : « environ 1 heure » ne doit
  // jamais devenir une échéance à 01:00. On masque la plage pour l'analyse date.
  const datesFirst = parseDateExpression(text, now)
  const maskedForEstimate = blankRanges(text, datesFirst.ranges)
  const estimateFirst = parseEstimate(text, maskedForEstimate)
  const textForDates = estimateFirst?.range ? blankRanges(text, [estimateFirst.range]) : text

  const dates = parseDateExpression(textForDates, now)
  dates.ranges.forEach((range) => ranges.push(range))
  dates.mentions.forEach((mention) => mentions.push(mention))

  const subtasks = detectSubtasks(text)
  if (subtasks.range) ranges.push(subtasks.range)

  const estimate = estimateFirst
  if (estimate?.range) ranges.push(estimate.range)

  const recurrence = detectRecurrence(text, ranges)
  const priority = detectPriority(text, ranges)
  const category = detectCategory(text, ranges)
  const tags = detectTags(text, priority?.negated)
  const assignee = detectAssignee(text, ranges)

  return { due: dates.due, hasTime: dates.hasTime, ranges, mentions, subtasks, estimate, recurrence, priority, category, tags, assignee }
}

function buildTaskDraft(title, entities, now, extra = {}) {
  return {
    id: uid('task'),
    title,
    notes: '',
    done: false,
    priority: entities.priority?.id || inferPriorityFromDue(entities.due, now) || 'medium',
    category: entities.category?.id || 'divers',
    categoryConfidence: entities.category?.confidence ?? 0,
    categoryMatched: entities.category?.matched || null,
    tags: entities.tags.map((tag) => tag.label),
    dueAt: entities.due ? toLocalDateTime(entities.due) : null,
    dueHasTime: Boolean(entities.hasTime),
    recurrence: entities.recurrence
      ? { rrule: entities.recurrence.rrule, label: entities.recurrence.label, interval: entities.recurrence.interval, weekday: entities.recurrence.weekday }
      : null,
    estimateMinutes: entities.estimate?.minutes || null,
    subtasks: entities.subtasks.steps || [],
    assignee: entities.assignee || null,
    pinned: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
    source: extra.source || 'text',
    transcript: extra.transcript || null,
    auto: {
      priorityFromVoice: entities.priority?.matched || null,
      categoryAlternatives: entities.category?.alternatives || [],
    },
  }
}

function inferPriorityFromDue(due, now) {
  if (!due) return null
  const hours = (due.getTime() - now.getTime()) / 3600000
  if (hours < 0) return null
  if (hours <= 6) return 'critical'
  if (hours <= 26) return 'high'
  return null
}

export function cleanTitle(raw) {
  let title = String(raw || '').replace(/\s+/g, ' ').trim()

  // Connecteurs français susceptibles de rester orphelins après retrait d'une date.
  // Ils ne sont supprimés que s'ils forment un MOT isolé (jamais à l'intérieur
  // d'un autre mot : « a » ne doit pas rogner « arroser »).
  const MOTS = [
    "jusqu'a", "jusqu'à", "a partir de", "à partir de", "lors de", "afin de",
    'avant', 'apres', 'après', 'pour', 'de', 'du', 'des', 'le', 'la', 'les',
    'au', 'aux', 'en', 'et', 'puis', 'sur', 'chez', 'vers', 'dans', 'avec',
    'sans', 'quand', 'lors', 'ce', 'cet', 'cette', 'y', 'a', 'à', 'qui', 'que',
  ]
  const APOSTROPHES = ["d'", "qu'", "l'", "j'", "n'", "s'", "c'", "m'", "t'"]
  const FIN = `(?:${MOTS.join('|')})(?![\\p{L}\\p{N}'])|(?:${APOSTROPHES.join('|')})(?![\\p{L}\\p{N}])|(?:(?:${MOTS.join('|')})\\s+)`
  const DEBUT = `(?:${MOTS.join('|')})(?![\\p{L}\\p{N}'])|(?:${APOSTROPHES.join('|')})(?![\\p{L}\\p{N}'])`
  const finRegex = new RegExp(`(?:[\\s,;:!?]+(?:${FIN}))+[\\s,.;:!?\\u002D]*$`, 'giu')
  const debutRegex = new RegExp(`^(?:(?:${DEBUT})[\\s,;:]+)+`, 'giu')

  title = title
    // Hashtags en tête : déjà capturés comme tags.
    .replace(/^(?:#[\p{L}\p{N}_-]+\s*)+/u, '')
    .replace(/^[\s,.;:!?\-–—]+/, '')
    .replace(/[\s,.;:!?\u002D\u2013\u2014]+$/, '')
    // « … dans la catégorie Santé » : l'information est déjà dans le champ catégorie.
    .replace(/,?\s*(?:dans|en|pour|sous|avec|sur)?\s*(?:la|le|les|une)?\s*cat[ée]gorie(?![\p{L}\p{N}])\s+[\p{L}'\-]{3,24}/giu, '')
    .replace(/(?:avec\s+(?:les|comme)\s+)?(?:[ée]tapes|sous-tâches|sous-taches)\s*[:=].*$/giu, '')
    .replace(/(?:ça|ca)\s+prend\s+(?:environ\s+)?\d+\s*(?:heures?|h|minutes?|min)/gi, '')
    .replace(/(?:durée|duree)\s+(?:de\s+)?\d+\s*(?:heures?|h|minutes?|min)/gi, '')
    .replace(/^[Cc]['’]?est\s+(?:urgent|critique|important|pressé|presse)(?![\p{L}\p{N}]).*$/giu, '')
    .replace(/[,;:\s]+[Cc]['’]?est(?![\p{L}\p{N}'])\s*$/gu, '')
    // Reliquats d'apostrophes (« carte d identité » → « carte d'identité »).
    .replace(/(?<![\p{L}\p{N}])([a-zà-ÿ])\s+(identité|identite|électricité|electricite|eau|essence|habitude|accord|avis|urgence|emploi|équipe|equipe|état|etat|école|ecole|entreprise|argent|huile|ordre|id[ée]e|heure|importance)(?![\p{L}\p{N}])/giu, "$1'$2")
    .replace(finRegex, '')
    .replace(debutRegex, '')
    .replace(finRegex, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;:#\-–—]+$/, '')
    .replace(/^[\s,.;:!?\-–—]+/, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()

  return capitalize(title).replace(/[.]$/, '')
}

/* ------------------------------------------------------------------ */
/* Entités                                                            */
/* ------------------------------------------------------------------ */

/** Remplace des plages de texte par des espaces, en conservant les index. */
function blankRanges(text, ranges) {
  if (!ranges?.length) return text
  let out = text
  ;[...ranges].sort((a, b) => b[0] - a[0]).forEach(([start, end]) => {
    out = out.slice(0, start) + ' '.repeat(Math.max(0, end - start + 1)) + out.slice(end + 1)
  })
  return out
}

const NEGATED_PRIORITY = boundaryRegex('pas|peu|non|sans|guère|guere')

function detectPriority(text, ranges) {
  const folded = fold(text)

  // 1. Une négation devant un mot de priorité inverse le sens :
  //    « pas urgent » = priorité basse, et non haute.
  const negated = new RegExp(`${NEGATED_PRIORITY.source}\\s+([\\p{L}'-]{3,16})`, 'giu')
  let negatedMatch
  while ((negatedMatch = negated.exec(folded)) !== null) {
    const word = negatedMatch[1]
    const low = PRIORITIES.low.keywords.some((keyword) => keyword === word || word.startsWith(keyword.split(' ')[0]))
    const highWord = PRIORITIES.high.keywords.includes(word) || PRIORITIES.critical.keywords.includes(word)
    if (low || highWord) {
      ranges.push([negatedMatch.index, negatedMatch.index + negatedMatch[0].length - 1])
      return { id: 'low', matched: negatedMatch[0], negated: true }
    }
  }

  // 2. Priorité explicite : toutes les occurrences sont retirées du titre,
  //    et c'est le niveau le plus fort qui l'emporte.
  let best = null
  const levelRank = { critical: 4, high: 3, medium: 2, low: 1 }
  for (const key of ['critical', 'high', 'low', 'medium']) {
    for (const keyword of PRIORITIES[key].keywords) {
      const regex = wordRegex(keyword, 'gi')
      let match
      while ((match = regex.exec(folded)) !== null) {
        ranges.push([match.index, match.index + match[0].length - 1])
        if (!best || levelRank[key] > levelRank[best.id]) {
          best = { id: key, matched: text.slice(match.index, match.index + match[0].length) }
        }
        if (regex.lastIndex === match.index) regex.lastIndex += 1
      }
    }
  }
  if (best) return best
  const explicit = folded.match(/priorit(?:e|é)\s+(haute|elevee|élevée|critique|basse|normale|moyenne)/)
  if (explicit) {
    const word = explicit[1]
    return { id: /critiq/.test(word) ? 'critical' : /haut|elev/.test(word) ? 'high' : /basse/.test(word) ? 'low' : 'medium', matched: explicit[0] }
  }
  return null
}

function detectCategory(text, dateRanges = []) {
  const folded = fold(text)

  // On retire d'abord les expressions de date : « vendredi » ne doit pas
  // faire gagner la catégorie Finance à cause de « jours ouvrés ».
  const withoutDates = cutRanges(folded, dateRanges)

  const explicit = folded.match(/(?:dans la|dans le|pour la|categorie|catégorie|range(?:r)? (?:le|la) dans)\s+([a-z' -]{3,24})/)
  if (explicit) {
    const wanted = fold(explicit[1]).trim()
    const exact = CATEGORY_ORDER.find((key) => fold(CATEGORIES[key].label) === wanted || key === wanted)
    if (exact) return { id: exact, matched: explicit[0], explicit: true, confidence: 1 }
    const partial = CATEGORY_ORDER.find((key) => wanted.includes(fold(CATEGORIES[key].label)) || fold(CATEGORIES[key].label).includes(wanted))
    if (partial) return { id: partial, matched: explicit[0], explicit: true, confidence: 0.95 }
  }

  const scores = CATEGORY_ORDER.map((key) => {
    let score = 0
    let matched = null
    CATEGORIES[key].keywords.forEach((keyword) => {
      const hit = wordRegex(fold(keyword)).exec(withoutDates)
      if (hit) {
        score += keyword.includes(' ') ? 6 : 3
        if (!matched) matched = hit[0]
      }
    })
    return { key, score, matched }
  }).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!scores.length) return { id: 'divers', matched: null, confidence: 0, alternatives: [] }
  const best = scores[0]
  return {
    id: best.key,
    matched: best.matched,
    confidence: Math.min(1, best.score / 9),
    alternatives: scores.slice(1, 3).map((entry) => entry.key),
  }
}

function detectRecurrence(text, ranges) {
  const folded = fold(text)
  for (const { pattern, rrule, label } of RECURRENCE_PATTERNS) {
    const match = new RegExp(pattern.source, 'i').exec(folded)
    if (!match) continue
    ranges.push([match.index, match.index + match[0].length - 1])
    let interval = null
    let weekday = null
    if (rrule === 'interval') interval = parseInt(match[2] || match[3] || '2', 10)
    if (rrule === 'weekly-day') weekday = WEEKDAYS.indexOf(String(match[2] || '').replace(/s$/, ''))
    return { rrule, label, interval, weekday, matched: match[0] }
  }
  return null
}

function detectTags(text, negatedPriority = false) {
  const folded = fold(text)
  const tags = []

  ;[...text.matchAll(/#([\p{L}\p{N}][\p{L}\p{N}_-]{1,23})/gu)].forEach((match) => {
    tags.push({ label: match[1].toLowerCase(), fromHashtag: true })
  })

  Object.entries(AUTO_TAGS).forEach(([tag, keywords]) => {
    if (negatedPriority && tag === 'urgent') return
    if (keywords.some((keyword) => wordRegex(keyword).test(folded))) {
      if (!tags.some((entry) => entry.label === tag)) tags.push({ label: tag, fromHashtag: false })
    }
  })

  return tags.slice(0, 5)
}

function detectAssignee(text, ranges) {
  const folded = fold(text)
  const patterns = [
    /(?:voir avec|demander [aà]|confier [aà]|de la part de)\s+([a-zà-ÿ' -]{2,24})/i,
    /(?:^|\s)avec\s+([a-zà-ÿ' -]{3,24})(?=\s*(?:,|$))/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(folded)
    if (!match) continue
    ranges.push([match.index, match.index + match[0].length - 1])
    return capitalize(match[1].trim())
  }
  return null
}

function detectSubtasks(text) {
  const folded = fold(text)
  const trigger = folded.match(/(?:avec les [ée]tapes|avec comme [ée]tapes|les [ée]tapes sont|avec les sous-t[aâ]ches|divise en|d[ée]taille en|en plusieurs [ée]tapes|[ée]tapes)\s*[:=]?\s*/)
  if (!trigger) return { steps: [], range: null }

  const start = trigger.index
  const tail = text.slice(trigger.index + trigger[0].length).replace(/^[\s,:]+/, '')
  const steps = tail
    .split(/\s*(?:,|;|\bet\b|\bpuis\b|\bensuite\b|\benfin\b|\s\d+\s*[).:-]\s)\s*/i)
    .map((step) => step.trim().replace(/[.,;:]+$/, ''))
    .filter((step) => step.length > 2)
    .slice(0, 8)
    .map((step) => ({ id: uid('sub'), title: capitalize(step), done: false }))

  if (!steps.length) return { steps: [], range: null }
  return { steps, range: [start, text.length - 1] }
}

/* ------------------------------------------------------------------ */
/* Requêtes                                                           */
/* ------------------------------------------------------------------ */

const RANGE_TESTS = [
  { range: 'overdue', pattern: boundaryRegex('en retard|retard|depasse|dépassé|expire|expiree') },
  { range: 'today', pattern: boundaryRegex("aujourd'hui|aujourdhui|du jour|ce jour") },
  { range: 'tomorrow', pattern: boundaryRegex('demain') },
  { range: 'week', pattern: boundaryRegex('cette semaine|la semaine|7 prochains jours|sept prochains jours|prochains jours') },
  { range: 'next-week', pattern: boundaryRegex('semaine prochaine') },
  { range: 'month', pattern: boundaryRegex('ce mois|mois-ci|dans le mois') },
  { range: 'someday', pattern: boundaryRegex('sans date|sans echeance|pas de date|non datees|non datées|un jour') },
  { range: 'upcoming', pattern: boundaryRegex('a venir|à venir|futures|prochaines') },
]

function detectRange(folded) {
  for (const { range, pattern } of RANGE_TESTS) {
    if (pattern.test(folded)) return range
  }
  return null
}

function buildList(text, folded, now) {
  const filters = { status: 'open', range: null, category: null, priority: null, tag: null, query: null }
  const scope = []

  const range = detectRange(folded)
  if (range) {
    filters.range = range
    scope.push(RANGE_LABELS_FR[range] || range)
  }

  if (boundaryRegex('urgentes|urgent|critiques|critique|importantes|important|prioritaires').test(folded)) {
    filters.priority = /critiq/.test(folded) ? 'critical' : 'high'
    scope.push(PRIORITIES[filters.priority].label.toLowerCase())
  }

  if (boundaryRegex('terminées|terminees|faites|complétées|completees|finies|accomplies').test(folded)) {
    filters.status = 'done'
    scope.push('terminées')
  } else if (boundaryRegex('toutes|tout').test(folded)) {
    filters.status = 'all'
  }

  if (boundaryRegex('épinglées|epinglees|favorites').test(folded)) filters.pinned = true

  const categoryHit = CATEGORY_ORDER.find((key) => wordRegex(fold(CATEGORIES[key].label)).test(folded))
  if (categoryHit) {
    filters.category = categoryHit
    scope.push(CATEGORIES[categoryHit].label.toLowerCase())
  } else {
    const keywordHit = CATEGORY_ORDER.map((key) => ({
      key,
      score: CATEGORIES[key].keywords.filter((keyword) => wordRegex(fold(keyword)).test(folded)).length,
    })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score)[0]
    if (keywordHit) {
      filters.category = keywordHit.key
      scope.push(CATEGORIES[keywordHit.key].label.toLowerCase())
    }
  }

  const tagMatch = folded.match(/(?:tag|taguees|taguées|étiquette|etiquette)\s+([a-z0-9_-]{2,20})/)
  if (tagMatch) filters.tag = tagMatch[1]

  const groupBy = /par categori?e/.test(folded) ? 'category'
    : /par priorit/.test(folded) ? 'priority'
    : /par (jour|date|echeance)/.test(folded) ? 'due'
    : /par (tag|etiquette)/.test(folded) ? 'tag'
    : null

  if (boundaryRegex('agenda|planning|calendrier').test(folded) && !filters.range) {
    filters.range = 'week'
    filters.view = 'calendar'
  }

  return { text, intent: 'list', confidence: filters.range || filters.category ? 0.85 : 0.7, tasks: [], filters, scope, groupBy }
}

const RANGE_LABELS_FR = {
  overdue: 'en retard',
  today: "aujourd'hui",
  tomorrow: 'demain',
  week: 'cette semaine',
  'next-week': 'la semaine prochaine',
  month: 'ce mois-ci',
  someday: 'sans échéance',
  upcoming: 'à venir',
}

const SEARCH_STOPWORDS = [
  'cherche', 'chercher', 'recherche', 'rechercher', 'trouve', 'trouver', 'retrouve',
  'tout', 'tous', 'toutes', 'ce', 'qui', 'que', 'quoi', 'les', 'la', 'le', 'des', 'du',
  'mes', 'mon', 'ma', 'tache', 'taches', 'tâche', 'tâches', 'concerne', 'concernent',
  'concernant', 'parle', 'parlent', 'sur', 'dans', 'parmi', 'au', 'sujet', 'propos',
  'de', 'et', 'ou', 'a', 'à', 'est', 'sont', 'il', 'elle', 'y', 'en', 'se', 'moi',
  'celles', 'celui', 'celle', 'ceux', 'rapport', 'avec', 'sans', 'pour',
]

function buildSearch(text, folded, now) {
  // Une recherche de catégorie ou de période est un filtre, pas une recherche
  // du mot dans le titre (qui manquerait les tâches déjà classées).
  const list = buildList(text, folded, now)
  const remainder = folded.replace(/\b(?:cherche|chercher|recherche|rechercher|trouve|trouver|retrouve|mes|les|des|la|le|taches?|de|du|pour|dans|en|au|aux|demain|aujourd'hui|aujourdhui|cette|semaine)\b/g, ' ').trim()
  if ((list.filters.category && remainder === fold(CATEGORIES[list.filters.category].label)) || (!remainder && list.filters.range)) {
    return { ...list, intent: 'list' }
  }
  const words = folded
    .replace(/[?!.,;]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !SEARCH_STOPWORDS.includes(word) && word.length > 1)

  const query = [...new Set(words)].join(' ').trim()

  return {
    text,
    intent: 'search',
    confidence: 0.85,
    tasks: [],
    filters: { status: 'all', query: query || folded.trim(), range: null },
    scope: [query],
  }
}

const COMPLETE_PREFIX = /^\s*(?:tu peux |peux-tu )?(?:j'ai fini|j ai fini|je viens de finir|termine|terminer|finis|fini|marque|marquer|met|mettre|passe|coche|cocher|valide|valider|consid[èe]re|boucle|bouclé)\s+(?:la |le |les |mes |mon |ma |toutes |tout )?\s*/i
const DELETE_PREFIX = /^\s*(?:tu peux |peux-tu )?(?:supprime|supprimer|efface|effacer|enleve|enlève|retire|retirer|annule|annuler|vire|jette)\s+(?:la |le |les |mes |mon |ma |toutes |tout )?\s*/i

function buildTargeted(text, folded, now, intent) {
  const prefix = intent === 'complete' ? COMPLETE_PREFIX : DELETE_PREFIX
  let target = text.replace(prefix, '')

  const targetFolded = fold(target)
  const filters = { status: 'all', query: null, range: null, category: null, priority: null }
  const isAll = boundaryRegex('toutes|tout').test(targetFolded) && boundaryRegex('taches|tâches|rappels').test(targetFolded)

  const range = detectRange(targetFolded)
  if (range) {
    filters.range = range
    filters.status = intent === 'complete' ? 'open' : 'all'
  }

  const categoryHit = CATEGORY_ORDER.find((key) => wordRegex(fold(CATEGORIES[key].label)).test(targetFolded))
  if (categoryHit) filters.category = categoryHit

  const priorityHit = /urgent|critique|prioritaire/.test(targetFolded)
    ? (/critiq/.test(targetFolded) ? 'critical' : 'high')
    : null
  if (priorityHit) filters.priority = priorityHit

  // Le reste devient une requête floue sur les titres.
  const dates = parseDateExpression(target, now)
  const cleaned = cutRanges(target, dates.ranges)
  const words = fold(cleaned)
    .replace(/[?!.,;:#]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !TARGET_STOPWORDS.includes(word) && word.length > 1)

  if (words.length) filters.query = [...new Set(words)].join(' ')
  if (intent === 'complete' && !filters.status) filters.status = 'open'

  return { text, intent, confidence: 0.85, tasks: [], filters, targetAll: isAll }
}

const TARGET_STOPWORDS = [
  'la', 'le', 'les', 'des', 'du', 'de', 'une', 'un', 'tache', 'taches', 'tâche', 'tâches',
  'mes', 'mon', 'ma', 'rappel', 'rappels', 'comme', 'fait', 'faite', 'termine', 'terminee',
  'terminée', 'finie', 'complete', 'complété', 'completee', 'toutes', 'tout', 'en', 'au',
  'aux', 'sur', 'dans', 'pour', 'avec', 'et', 'qui', 'que', 'ce', 'cette', 'ces', 'a', 'à',
  'd', 'je', 'j', 'ai', 'fini', 'viens', 'supprime', 'supprimer', 'marque', 'marquer',
  'coche', 'cocher', 'valide', 'valider', 'passe', 'met', 'mettre', 'retard', 'urgence',
  'urgent', 'urgentes', 'critique', 'critiques',
]

function buildUpdate(text, folded, now) {
  const filters = { status: 'all', query: null, range: null, category: null, priority: null }
  const patch = {}

  const entities = extractEntities(text, now)
  if (entities.due) {
    patch.dueAt = toLocalDateTime(entities.due)
    patch.dueHasTime = entities.hasTime
  }
  if (entities.priority) patch.priority = entities.priority.id
  if (entities.category?.explicit) patch.category = entities.category.id
  if (entities.recurrence) patch.recurrence = { rrule: entities.recurrence.rrule, label: entities.recurrence.label }
  if (entities.estimate) patch.estimateMinutes = entities.estimate.minutes

  // « décale à demain » sans date détectée : on relit le complément.
  const shift = folded.match(/(?:decale|décale|reporte|pousse|repousse)\s+(?:a|à|d'un|d'une|de|au|pour)?\s*([a-z' -]{3,28})$/)
  if (shift && !entities.due) {
    const reparsed = parseDateExpression(shift[1].trim(), now)
    if (reparsed.due) patch.dueAt = toLocalDateTime(reparsed.due)
  }

  const target = cleanTitle(cutRanges(text, entities.ranges))
  const words = fold(target)
    .replace(/[?!.,;:#]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !UPDATE_STOPWORDS.includes(word) && word.length > 1)

  if (words.length) filters.query = [...new Set(words)].join(' ')

  return { text, intent: 'update', confidence: 0.8, tasks: [], filters, patch }
}

const UPDATE_STOPWORDS = [
  ...TARGET_STOPWORDS,
  'modifie', 'modifier', 'change', 'changer', 'decale', 'décale', 'reporte', 'repousse',
  'pousse', 'renomme', 'priorite', 'priorité', 'haute', 'basse', 'normale', 'moyenne',
  'critique', 'elevee', 'élevée', 'demain', 'aujourdhui', "aujourd'hui", 'lundi', 'mardi',
  'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'semaine', 'prochaine', 'h',
  'heure', 'heures', 'urgent', 'urgente', 'important', 'importante',
]

function buildStats(text, folded, now) {
  const filters = { status: 'open', range: null, category: null, priority: null }
  const range = detectRange(folded)
  if (range) filters.range = range
  const categoryHit = CATEGORY_ORDER.find((key) => wordRegex(fold(CATEGORIES[key].label)).test(folded))
  if (categoryHit) filters.category = categoryHit
  return { text, intent: 'stats', confidence: 0.9, tasks: [], filters }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export function describeUnderstanding(interpretation) {
  const parts = []
  if (interpretation.tasks.length) {
    parts.push(`${interpretation.tasks.length} tâche${interpretation.tasks.length > 1 ? 's' : ''} détectée${interpretation.tasks.length > 1 ? 's' : ''}`)
  }
  interpretation.tasks.forEach((task) => {
    const details = []
    if (task.dueAt) details.push('échéance comprise')
    if (task.priority !== 'medium') details.push(`priorité ${PRIORITIES[task.priority]?.label}`)
    if (task.category !== 'divers') details.push(`classée en ${CATEGORIES[task.category]?.label}`)
    if (details.length) parts.push(`« ${task.title} » : ${details.join(', ')}`)
  })
  return parts.join(' · ')
}

export { CATEGORIES, CATEGORY_ORDER, PRIORITIES, WEEKDAYS }
