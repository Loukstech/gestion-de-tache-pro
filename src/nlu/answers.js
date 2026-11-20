/**
 * Générateur de réponses de l'assistant.
 * Transforme une intention + un ensemble de tâches en réponse **structurée** :
 * un texte parlé clair, des groupes triés, des chiffres et des actions rapides.
 */
import { CATEGORIES, CATEGORY_ORDER, PRIORITIES, PRIORITY_ORDER } from './lexicon.js'
import { daysBetween, humanizeDue, fromISODate } from './dates.js'
import { capitalize, truncate } from '../lib/utils.js'
import { fuzzyScore } from '../lib/utils.js'

const MAX_PER_GROUP = 8

/* ------------------------------------------------------------------ */
/* Sélection                                                          */
/* ------------------------------------------------------------------ */

export function filterTasks(tasks, filters = {}, now = new Date()) {
  let result = [...tasks]

  if (filters.status === 'open') result = result.filter((task) => !task.done)
  else if (filters.status === 'done') result = result.filter((task) => task.done)

  if (filters.category) result = result.filter((task) => task.category === filters.category)
  if (filters.priority) result = result.filter((task) => task.priority === filters.priority)
  if (filters.tag) result = result.filter((task) => (task.tags || []).includes(filters.tag))
  if (filters.pinned) result = result.filter((task) => task.pinned)

  if (filters.range) {
    result = result.filter((task) => matchesRange(task, filters.range, now))
  }

  if (filters.query) {
    const query = filters.query
    result = result
      .map((task) => {
        const haystack = [task.title, task.notes, CATEGORIES[task.category]?.label, ...(task.tags || []), task.assignee || ''].join(' ')
        return { task, score: fuzzyScore(query, haystack) }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.task)
  }

  return result
}

export function matchesRange(task, range, now = new Date()) {
  const due = fromISODate(task.dueAt)
  switch (range) {
    case 'overdue':
      return Boolean(due) && !task.done && due.getTime() < now.getTime()
    case 'today': {
      if (!due) return false
      const delta = daysBetween(now, due)
      return delta === 0 || (!task.done && delta < 0)
    }
    case 'tomorrow':
      return Boolean(due) && daysBetween(now, due) === 1
    case 'week':
      return Boolean(due) && daysBetween(now, due) >= 0 && daysBetween(now, due) <= 7
    case 'next-week': {
      if (!due) return false
      const delta = daysBetween(now, due)
      return delta >= 7 && delta <= 14
    }
    case 'month':
      return Boolean(due) && due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear()
    case 'someday':
      return !due
    case 'upcoming':
      return Boolean(due) && daysBetween(now, due) >= 0
    default:
      return true
  }
}

const RANGE_LABELS = {
  overdue: 'en retard',
  today: "aujourd'hui",
  tomorrow: 'demain',
  week: 'dans les 7 prochains jours',
  'next-week': 'la semaine prochaine',
  month: 'ce mois-ci',
  someday: 'sans échéance',
  upcoming: 'à venir',
}

/* ------------------------------------------------------------------ */
/* Tri                                                                */
/* ------------------------------------------------------------------ */

export function sortTasks(tasks, mode = 'smart') {
  const rank = (task) => PRIORITIES[task.priority]?.rank ?? 2
  return [...tasks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (mode === 'due') {
      if (!a.dueAt && !b.dueAt) return 0
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt) - new Date(b.dueAt)
    }
    if (mode === 'priority') return rank(b) - rank(a)
    if (rank(b) !== rank(a)) return rank(b) - rank(a)
    if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt)
    if (a.dueAt) return -1
    if (b.dueAt) return 1
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
}

/* ------------------------------------------------------------------ */
/* Réponses                                                           */
/* ------------------------------------------------------------------ */

export function buildAnswer(interpretation, tasks, now = new Date()) {
  switch (interpretation.intent) {
    case 'create': return answerCreate(interpretation, tasks, now)
    case 'list': return answerList(interpretation, tasks, now)
    case 'search': return answerSearch(interpretation, tasks, now)
    case 'complete': return answerComplete(interpretation, tasks, now)
    case 'delete': return answerDelete(interpretation, tasks, now)
    case 'update': return answerUpdate(interpretation, tasks, now)
    case 'stats': return answerStats(interpretation, tasks, now)
    case 'help': return answerHelp(interpretation)
    case 'undo': return answerUndo(interpretation)
    default: return answerUnknown(interpretation)
  }
}

function answerCreate(interpretation, allTasks, now) {
  const created = interpretation.tasks
  if (!created.length) {
    return {
      kind: 'error',
      headline: "Je n'ai pas saisi le titre",
      spoken: "Je n'ai pas compris quoi noter. Peux-tu reformuler, par exemple : ajoute une tâche préparer le rapport client pour demain.",
      groups: [],
      stats: [],
      chips: [
        { label: 'Voir des exemples', command: 'aide' },
      ],
    }
  }

  const lines = created.map((task) => {
    const bits = []
    if (task.dueAt) bits.push(humanizeDue(fromISODate(task.dueAt)))
    if (task.priority !== 'medium') bits.push(`priorité ${PRIORITIES[task.priority].label.toLowerCase()}`)
    bits.push(CATEGORIES[task.category].label)
    return { task, label: bits.join(' · ') }
  })

  const spoken = created.length === 1
    ? `C'est noté. ${lines[0].task.title}. ${describeOne(lines[0].task, now)} J'ai classé ça dans ${CATEGORIES[lines[0].task.category].label}.`
    : `J'ai créé ${created.length} tâches. ${lines.map((line, index) => `${index + 1}. ${line.task.title}, ${describeOne(line.task, now)}`).join(' ')}`

  return {
    kind: 'create',
    headline: created.length === 1 ? 'Tâche créée' : `${created.length} tâches créées`,
    spoken,
    groups: [{ title: 'Ce que j’ai compris', tone: 'success', tasks: created, meta: lines.map((line) => line.label) }],
    stats: created.flatMap((task) => {
      const out = []
      if (task.dueAt) out.push({ label: 'Échéance', value: humanizeDue(fromISODate(task.dueAt)) })
      out.push({ label: 'Priorité', value: PRIORITIES[task.priority].label })
      out.push({ label: 'Catégorie', value: CATEGORIES[task.category].label })
      if (task.tags?.length) out.push({ label: 'Tags', value: task.tags.join(', ') })
      if (task.recurrence) out.push({ label: 'Récurrence', value: task.recurrence.label })
      if (task.estimateMinutes) out.push({ label: 'Estimé', value: formatMinutes(task.estimateMinutes) })
      return out
    }),
    chips: [
      { label: "Qu'est-ce que j'ai à faire ?", command: "qu'est-ce que j'ai à faire aujourd'hui" },
      { label: 'Mes urgentes', command: 'liste mes tâches urgentes' },
    ],
    undoable: true,
  }
}

function describeOne(task, now) {
  const bits = []
  if (task.dueAt) bits.push(humanizeDue(fromISODate(task.dueAt), { withTime: task.dueHasTime }))
  if (task.priority === 'critical') bits.push("c'est critique")
  else if (task.priority === 'high') bits.push("c'est prioritaire")
  else if (task.priority === 'low') bits.push('pas pressé')
  if (task.recurrence) bits.push(task.recurrence.label.toLowerCase())
  return bits.join(', ')
}

function answerList(interpretation, tasks, now) {
  const { filters, groupBy, scope = [] } = interpretation
  const selected = sortTasks(tasks, groupBy === 'due' ? 'due' : 'smart')
  const label = scope.length ? scope.join(' ') : null

  if (!selected.length) {
    return {
      kind: 'list',
      headline: 'Rien à signaler',
      spoken: label
        ? `Aucune tâche ${label}. Tu es à jour sur ce point.`
        : "Tu n'as aucune tâche en cours. Tout est terminé, bravo.",
      groups: [],
      stats: [],
      emptyState: true,
      chips: [
        { label: 'Ajouter une tâche', command: null, action: 'create' },
        { label: 'Voir tout', command: 'liste toutes mes tâches' },
      ],
    }
  }

  const groups = groupBy === 'category'
    ? groupByCategory(selected)
    : groupBy === 'priority'
      ? groupByPriority(selected)
      : groupBy === 'tag'
        ? groupByTag(selected)
        : groupByDue(selected, now)

  const overdue = selected.filter((task) => matchesRange(task, 'overdue', now)).length
  const today = selected.filter((task) => matchesRange(task, 'today', now)).length

  const spokenParts = []
  spokenParts.push(
    label
      ? `${selected.length} tâche${selected.length > 1 ? 's' : ''} ${label}.`
      : `${selected.length} tâche${selected.length > 1 ? 's' : ''} à suivre.`,
  )
  if (overdue) spokenParts.push(`${overdue} en retard.`)
  if (today) spokenParts.push(`${today} pour aujourd'hui.`)
  groups.slice(0, 3).forEach((group) => {
    if (!group.tasks.length) return
    const first = group.tasks.slice(0, Math.min(3, group.tasks.length))
    spokenParts.push(`${group.title} : ${first.map((task) => task.title).join(', ')}${group.tasks.length > first.length ? ` et ${group.tasks.length - first.length} autre${group.tasks.length - first.length > 1 ? 's' : ''}` : ''}.`)
  })

  return {
    kind: 'list',
    headline: label ? capitalize(label) : 'Tes tâches',
    subheadline: `${selected.length} résultat${selected.length > 1 ? 's' : ''}`,
    spoken: spokenParts.join(' '),
    groups: groups.map((group) => ({ ...group, tasks: group.tasks.slice(0, MAX_PER_GROUP), hidden: Math.max(0, group.tasks.length - MAX_PER_GROUP) })),
    stats: [
      { label: 'Total', value: String(selected.length) },
      { label: 'En retard', value: String(overdue), tone: overdue ? 'danger' : undefined },
      { label: "Aujourd'hui", value: String(today), tone: today ? 'warning' : undefined },
      { label: 'Sans date', value: String(selected.filter((task) => !task.dueAt).length) },
    ],
    chips: buildListChips(filters),
  }
}

function buildListChips(filters) {
  const chips = []
  if (filters.range !== 'today') chips.push({ label: "Aujourd'hui", command: "liste mes tâches d'aujourd'hui" })
  if (filters.range !== 'overdue') chips.push({ label: 'En retard', command: 'liste mes tâches en retard' })
  if (filters.range !== 'week') chips.push({ label: 'Cette semaine', command: 'liste mes tâches de cette semaine' })
  if (filters.status !== 'done') chips.push({ label: 'Terminées', command: 'liste mes tâches terminées' })
  chips.push({ label: 'Par catégorie', command: 'liste mes tâches par catégorie' })
  return chips.slice(0, 4)
}

function groupByDue(tasks, now) {
  const buckets = [
    { title: 'En retard', tone: 'danger', tasks: [] },
    { title: "Aujourd'hui", tone: 'warning', tasks: [] },
    { title: 'Demain', tone: 'info', tasks: [] },
    { title: 'Cette semaine', tone: 'neutral', tasks: [] },
    { title: 'Plus tard', tone: 'neutral', tasks: [] },
    { title: 'Sans échéance', tone: 'muted', tasks: [] },
  ]
  tasks.forEach((task) => {
    if (task.done) { buckets[4].tasks.push(task); return }
    const due = fromISODate(task.dueAt)
    if (!due) { buckets[5].tasks.push(task); return }
    const delta = daysBetween(now, due)
    if (due.getTime() < now.getTime() && delta <= 0) buckets[0].tasks.push(task)
    else if (delta === 0) buckets[1].tasks.push(task)
    else if (delta === 1) buckets[2].tasks.push(task)
    else if (delta <= 7) buckets[3].tasks.push(task)
    else buckets[4].tasks.push(task)
  })
  return buckets.filter((bucket) => bucket.tasks.length)
}

function groupByCategory(tasks) {
  const map = new Map()
  tasks.forEach((task) => {
    const key = task.category || 'divers'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(task)
  })
  return CATEGORY_ORDER.filter((key) => map.has(key)).map((key) => ({
    title: CATEGORIES[key].label,
    tone: 'neutral',
    color: CATEGORIES[key].color,
    tasks: map.get(key),
  }))
}

function groupByPriority(tasks) {
  return PRIORITY_ORDER.filter((key) => tasks.some((task) => task.priority === key)).map((key) => ({
    title: PRIORITIES[key].label,
    tone: key === 'critical' ? 'danger' : key === 'high' ? 'warning' : 'neutral',
    color: PRIORITIES[key].color,
    tasks: tasks.filter((task) => task.priority === key),
  }))
}

function groupByTag(tasks) {
  const map = new Map()
  tasks.forEach((task) => {
    const tags = task.tags?.length ? task.tags : ['sans tag']
    tags.forEach((tag) => {
      if (!map.has(tag)) map.set(tag, [])
      map.get(tag).push(task)
    })
  })
  return [...map.entries()].map(([tag, list]) => ({ title: `#${tag}`, tone: 'neutral', tasks: list }))
}

function answerSearch(interpretation, tasks, now) {
  const query = interpretation.filters.query || ''
  if (!tasks.length) {
    return {
      kind: 'search',
      headline: 'Aucun résultat',
      spoken: `Je n'ai rien trouvé pour « ${query} ». Essaie avec un autre mot-clé.`,
      groups: [],
      stats: [],
      emptyState: true,
      chips: [{ label: 'Voir toutes mes tâches', command: 'liste toutes mes tâches' }],
    }
  }
  return {
    kind: 'search',
    headline: `Résultats pour « ${truncate(query, 40)} »`,
    subheadline: `${tasks.length} correspondance${tasks.length > 1 ? 's' : ''}`,
    spoken: `J'ai trouvé ${tasks.length} tâche${tasks.length > 1 ? 's' : ''} pour « ${query} ». ${tasks.slice(0, 3).map((task) => task.title).join(', ')}.`,
    groups: [{ title: 'Correspondances', tone: 'neutral', tasks: tasks.slice(0, MAX_PER_GROUP), hidden: Math.max(0, tasks.length - MAX_PER_GROUP) }],
    stats: [],
    chips: [
      { label: 'Filtrer les urgentes', command: `cherche ${query} urgentes` },
      { label: 'Tout afficher', command: 'liste toutes mes tâches' },
    ],
  }
}

function answerComplete(interpretation, tasks, now) {
  if (!tasks.length) {
    return {
      kind: 'complete',
      headline: 'Aucune tâche à valider',
      spoken: "Je n'ai trouvé aucune tâche en cours correspondant à cette demande.",
      groups: [],
      stats: [],
      emptyState: true,
      chips: [{ label: 'Voir mes tâches', command: 'liste mes tâches' }],
    }
  }
  const many = tasks.length > 1
  return {
    kind: 'complete',
    headline: many ? `${tasks.length} tâches terminées` : 'Tâche terminée',
    spoken: many
      ? `C'est fait, ${tasks.length} tâches sont terminées : ${tasks.slice(0, 3).map((task) => task.title).join(', ')}.`
      : `Parfait, « ${tasks[0].title} » est terminée. ${encouragement()}`,
    groups: [{ title: 'Validées', tone: 'success', tasks: tasks.slice(0, MAX_PER_GROUP) }],
    stats: [],
    chips: [
      { label: 'Ce qui reste', command: "qu'est-ce qu'il me reste à faire" },
      { label: 'Annuler', command: null, action: 'undo' },
    ],
    undoable: true,
  }
}

function answerDelete(interpretation, tasks, now) {
  if (!tasks.length) {
    return {
      kind: 'delete',
      headline: 'Rien à supprimer',
      spoken: "Je n'ai trouvé aucune tâche correspondant à cette demande.",
      groups: [],
      stats: [],
      emptyState: true,
      chips: [{ label: 'Voir mes tâches', command: 'liste mes tâches' }],
    }
  }
  return {
    kind: 'delete',
    headline: tasks.length > 1 ? `${tasks.length} tâches supprimées` : 'Tâche supprimée',
    spoken: tasks.length > 1
      ? `J'ai supprimé ${tasks.length} tâches.`
      : `J'ai supprimé « ${tasks[0].title} ».`,
    groups: [{ title: 'Supprimées', tone: 'danger', tasks: tasks.slice(0, MAX_PER_GROUP) }],
    stats: [],
    chips: [{ label: 'Annuler', command: null, action: 'undo' }],
    undoable: true,
  }
}

function answerUpdate(interpretation, tasks, now) {
  if (!tasks.length) {
    return {
      kind: 'update',
      headline: 'Tâche introuvable',
      spoken: "Je n'ai pas trouvé la tâche à modifier. Donne-moi son nom exact.",
      groups: [],
      stats: [],
      emptyState: true,
      chips: [{ label: 'Voir mes tâches', command: 'liste mes tâches' }],
    }
  }
  const patch = interpretation.patch || {}
  const changes = []
  if (patch.dueAt) changes.push(`échéance ${humanizeDue(fromISODate(patch.dueAt))}`)
  if (patch.priority) changes.push(`priorité ${PRIORITIES[patch.priority].label.toLowerCase()}`)
  if (patch.category) changes.push(`catégorie ${CATEGORIES[patch.category].label}`)
  if (patch.estimateMinutes) changes.push(`durée estimée ${formatMinutes(patch.estimateMinutes)}`)
  if (patch.recurrence) changes.push(patch.recurrence.label.toLowerCase())

  return {
    kind: 'update',
    headline: tasks.length > 1 ? `${tasks.length} tâches mises à jour` : 'Tâche mise à jour',
    spoken: `${tasks.length > 1 ? `${tasks.length} tâches ont été mises à jour` : `« ${tasks[0].title} » a été mise à jour`}${changes.length ? ` : ${changes.join(', ')}.` : '.'}`,
    groups: [{ title: 'Modifiées', tone: 'info', tasks: tasks.slice(0, MAX_PER_GROUP) }],
    stats: [],
    chips: [{ label: 'Voir le détail', command: `cherche ${tasks[0].title}` }],
    undoable: true,
  }
}

function answerStats(interpretation, allTasks, now) {
  const total = allTasks.length
  const done = allTasks.filter((task) => task.done).length
  const open = total - done
  const overdue = allTasks.filter((task) => matchesRange(task, 'overdue', now)).length
  const today = allTasks.filter((task) => matchesRange(task, 'today', now)).length
  const week = allTasks.filter((task) => !task.done && matchesRange(task, 'week', now)).length
  const someday = allTasks.filter((task) => !task.done && !task.dueAt).length
  const rate = total ? Math.round((done / total) * 100) : 0

  const byCategory = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORIES[key].label,
    color: CATEGORIES[key].color,
    count: allTasks.filter((task) => !task.done && task.category === key).length,
  })).filter((entry) => entry.count > 0).sort((a, b) => b.count - a.count)

  const byPriority = PRIORITY_ORDER.map((key) => ({
    key,
    label: PRIORITIES[key].label,
    color: PRIORITIES[key].color,
    count: allTasks.filter((task) => !task.done && task.priority === key).length,
  })).filter((entry) => entry.count > 0)

  const spoken = [
    `Voici ton bilan.`,
    `${open} tâche${open > 1 ? 's' : ''} en cours sur ${total} au total, soit ${rate} pourcent de complétion.`,
    overdue ? `${overdue} en retard, à traiter en premier.` : 'Aucun retard, très bien.',
    today ? `${today} pour aujourd'hui.` : '',
    week ? `${week} sur les 7 prochains jours.` : '',
    byCategory[0] ? `Le plus gros volume est sur ${byCategory[0].label} avec ${byCategory[0].count} tâche${byCategory[0].count > 1 ? 's' : ''}.` : '',
    someday ? `${someday} sans échéance : pense à les dater.` : '',
  ].filter(Boolean).join(' ')

  return {
    kind: 'stats',
    headline: 'Ton bilan',
    subheadline: `${open} en cours · ${rate} % complété`,
    spoken,
    groups: [],
    stats: [
      { label: 'En cours', value: String(open) },
      { label: 'Terminées', value: String(done), tone: 'success' },
      { label: 'En retard', value: String(overdue), tone: overdue ? 'danger' : undefined },
      { label: "Aujourd'hui", value: String(today), tone: today ? 'warning' : undefined },
      { label: '7 jours', value: String(week) },
      { label: 'Sans date', value: String(someday) },
    ],
    breakdown: { byCategory, byPriority },
    chips: [
      { label: 'Voir les retards', command: 'liste mes tâches en retard' },
      { label: "Priorités d'aujourd'hui", command: "qu'est-ce que je dois faire aujourd'hui" },
    ],
  }
}

function answerHelp() {
  const examples = [
    { command: 'Ajoute une tâche appeler le client Dupont demain à 15h, c’est urgent', intent: 'Création + date + heure + priorité' },
    { command: 'Je dois faire les courses samedi matin', intent: 'Création + classification automatique (Courses)' },
    { command: 'Crée une tâche préparer la réunion lundi avec les étapes : faire les slides, inviter l’équipe, réserver la salle', intent: 'Création + sous-tâches' },
    { command: 'Paie la facture d’électricité tous les mois', intent: 'Création + récurrence + catégorie Finance' },
    { command: "Qu'est-ce que j'ai à faire aujourd'hui ?", intent: 'Réponse structurée du jour' },
    { command: 'Liste mes tâches en retard par priorité', intent: 'Filtre retard + groupement' },
    { command: 'Combien de tâches j’ai cette semaine ?', intent: 'Bilan chiffré' },
    { command: 'Cherche tout ce qui concerne le dossier Alpha', intent: 'Recherche floue' },
    { command: 'J’ai fini appeler le client Dupont', intent: 'Complétion vocale' },
    { command: 'Reporte préparer la réunion à vendredi', intent: 'Modification d’échéance' },
    { command: 'Supprime acheter du pain', intent: 'Suppression' },
    { command: 'Annule ça', intent: 'Retour arrière sur la dernière action' },
  ]
  return {
    kind: 'help',
    headline: 'Ce que je sais faire',
    spoken: "Je comprends le français naturel. Tu peux créer des tâches en parlant, les classer, demander ce que tu as à faire aujourd'hui, chercher, terminer, reporter ou supprimer. Essaie par exemple : ajoute une tâche appeler le client demain à quinze heures, c'est urgent.",
    groups: [],
    stats: [],
    examples,
    chips: [
      { label: "Tâches du jour", command: "qu'est-ce que j'ai à faire aujourd'hui" },
      { label: 'Mon bilan', command: 'donne-moi mes statistiques' },
    ],
  }
}

function answerUndo() {
  return {
    kind: 'undo',
    headline: 'Action annulée',
    spoken: "C'est annulé, je suis revenu en arrière.",
    groups: [],
    stats: [],
    chips: [],
  }
}

function answerUnknown(interpretation) {
  const text = interpretation.text || ''
  return {
    kind: 'unknown',
    headline: 'Je reformule ?',
    spoken: `Je n'ai pas bien compris « ${truncate(text, 80)} ». Tu peux dire par exemple : ajoute une tâche préparer le rapport pour demain, ou bien : qu'est-ce que j'ai à faire aujourd'hui.`,
    groups: [],
    stats: [],
    chips: [
      { label: 'Créer avec ce texte', command: null, action: 'force-create' },
      { label: 'Voir des exemples', command: 'aide' },
      { label: 'Mes tâches du jour', command: "qu'est-ce que j'ai à faire aujourd'hui" },
    ],
  }
}

function encouragement() {
  const pool = [
    'Bien joué.',
    'Une de moins.',
    'Tu avances.',
    'Excellent.',
    'Continue comme ça.',
  ]
  return pool[Math.floor(Math.random() * pool.length)]
}

export function formatMinutes(minutes) {
  if (!minutes) return ''
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest}` : `${hours} h`
}

export { RANGE_LABELS }
