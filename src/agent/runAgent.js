/**
 * Boucle d'agent : observer → raisonner → agir → vérifier → répondre.
 * Le modèle tourne côté serveur (clé protégée) ; les outils s'exécutent ici,
 * uniquement avec des arguments validés.
 */
import { filterTasks } from '../nlu/answers.js'
import { interpret } from '../nlu/parser.js'
import { CATEGORIES, PRIORITIES } from '../nlu/lexicon.js'
import { aiUrl } from '../lib/ai-url.js'

const MAX_STEPS = 6
const CATEGORY_KEYS = Object.keys(CATEGORIES)
const PRIORITY_KEYS = Object.keys(PRIORITIES)
const STATUS_KEYS = ['open', 'done', 'all']
const RANGE_KEYS = ['today', 'tomorrow', 'week', 'next-week', 'month', 'overdue', 'someday', 'upcoming']
const SORT_KEYS = ['smart', 'due', 'priority', 'created', 'alpha']
const VIEWS = ['dashboard', 'assistant', 'today', 'tasks', 'calendar', 'analytics']

const oneOf = (value, allowed, fallback = null) => (allowed.includes(value) ? value : fallback)
const clean = (value, max = 250) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const ids = (value) => (Array.isArray(value) ? value.map((id) => clean(id, 80)).filter(Boolean).slice(0, 30) : [])

export function localTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseDueAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(value)) return null
  const date = new Date(value.length === 10 ? `${value}T12:00` : value)
  if (Number.isNaN(date.getTime())) return null
  // Le reste de l'app stocke les échéances en heure locale naive
  // (voir toLocalDateTime dans nlu/dates.js), pas en ISO UTC.
  return value.length === 10 ? `${value}T12:00` : value
}

function compactTask(task) {
  return {
    id: task.id,
    title: task.title,
    done: Boolean(task.done),
    category: task.category,
    priority: task.priority,
    dueAt: task.dueAt || null,
    notes: task.notes || '',
    tags: task.tags || [],
  }
}

function normalizeDraft(draft, now) {
  if (!draft || typeof draft !== 'object') return null
  const rawTitle = clean(draft.title, 240)
  if (!rawTitle) return null
  const local = interpret(`ajoute une tâche ${rawTitle}`, { now }).tasks[0]
  return {
    title: local?.title || rawTitle,
    notes: clean(draft.notes, 1000) || local?.notes || '',
    category: oneOf(draft.category, CATEGORY_KEYS, null) || local?.category || 'divers',
    priority: oneOf(draft.priority, PRIORITY_KEYS, null) || local?.priority || 'medium',
    dueAt: parseDueAt(draft.dueAt) || local?.dueAt || null,
    dueHasTime: draft.dueHasTime === true || Boolean(local?.dueHasTime),
    tags: (Array.isArray(draft.tags) && draft.tags.length ? draft.tags : local?.tags || []).slice(0, 10).map((tag) => clean(tag, 40)),
    subtasks: (Array.isArray(draft.subtasks) && draft.subtasks.length ? draft.subtasks : local?.subtasks || []).slice(0, 12).map((subtask) =>
      typeof subtask === 'string' ? { id: `sub-${Math.random().toString(36).slice(2, 9)}`, title: clean(subtask, 160), done: false } : subtask,
    ),
    source: 'agent',
  }
}

function sanitizeFilters(input) {
  if (!input || typeof input !== 'object') return {}
  const filters = {}
  if (STATUS_KEYS.includes(input.status)) filters.status = input.status
  if (RANGE_KEYS.includes(input.range)) filters.range = input.range
  if (CATEGORY_KEYS.includes(input.category)) filters.category = input.category
  if (PRIORITY_KEYS.includes(input.priority)) filters.priority = input.priority
  if (typeof input.query === 'string') filters.query = clean(input.query, 200)
  if (SORT_KEYS.includes(input.sort)) filters.sort = input.sort
  return filters
}

/** Exécute un appel d'outil. Ne touche jamais à une donnée non validée. */
export async function executeTool(store, call, now) {
  const get = store.get
  const args = call.args && typeof call.args === 'object' ? call.args : {}
  const tasks = get().tasks

  switch (call.name) {
    case 'list_tasks': {
      const filters = sanitizeFilters(args)
      const selected = filterTasks(tasks, filters, now)
      return {
        ok: true,
        count: selected.length,
        tasks: selected.slice(0, 40).map(compactTask),
        view: { kind: 'list', tasks: selected.slice(0, 40), filters },
      }
    }
    case 'create_tasks': {
      const drafts = Array.isArray(args.tasks) ? args.tasks.slice(0, 10) : []
      const normalized = drafts.map((draft) => normalizeDraft(draft, now)).filter(Boolean)
      if (!normalized.length) return { ok: false, error: 'Aucun titre valide.' }
      const created = await get().addTasks(normalized, { source: 'agent' })
      return { ok: true, count: created.length, tasks: created.map(compactTask), view: { kind: 'list', tasks: created, title: 'Ce que j’ai créé' } }
    }
    case 'update_task': {
      const task = tasks.find((item) => item.id === args.task_id)
      if (!task) return { ok: false, error: 'Tâche introuvable.' }
      const patch = {}
      if (typeof args.patch?.title === 'string' && clean(args.patch.title)) patch.title = clean(args.patch.title)
      if (typeof args.patch?.notes === 'string') patch.notes = clean(args.patch.notes, 1000)
      if (CATEGORY_KEYS.includes(args.patch?.category)) patch.category = args.patch.category
      if (PRIORITY_KEYS.includes(args.patch?.priority)) patch.priority = args.patch.priority
      if (typeof args.patch?.dueAt === 'boolean') patch.dueAt = null
      else if (parseDueAt(args.patch?.dueAt)) patch.dueAt = parseDueAt(args.patch.dueAt)
      if (typeof args.patch?.done === 'boolean') return executeTool(store, { name: args.patch.done ? 'complete_tasks' : 'reopen_tasks', args: { task_ids: [task.id] } }, now)
      await get().updateTask(task.id, patch)
      return { ok: true, task: compactTask(get().tasks.find((item) => item.id === task.id)) }
    }
    case 'complete_tasks':
    case 'reopen_tasks': {
      const wanted = ids(args.task_ids)
      const found = wanted.filter((id) => tasks.some((task) => task.id === id))
      if (!found.length) return { ok: false, error: 'Aucune tâche correspondante.' }
      const done = call.name === 'complete_tasks'
      for (const id of found) await get().setDone(id, done)
      return { ok: true, count: found.length, task_ids: found }
    }
    case 'delete_tasks': {
      const wanted = ids(args.task_ids)
      if (args.confirmed_by_user !== true) return { ok: false, error: 'Confirmation explicite requise avant suppression.' }
      const found = wanted.filter((id) => tasks.some((task) => task.id === id))
      if (!found.length) return { ok: false, error: 'Aucune tâche correspondante.' }
      await get().deleteMany(found)
      return { ok: true, count: found.length, task_ids: found }
    }
    case 'set_filters': {
      const filters = sanitizeFilters(args)
      get().setFilters(filters)
      get().setView('tasks')
      return { ok: true, filters }
    }
    case 'navigate': {
      const view = oneOf(args.view, VIEWS)
      if (!view) return { ok: false, error: 'Vue inconnue.' }
      get().setView(view)
      return { ok: true, view }
    }
    case 'undo': {
      const restored = await get().restoreFromUndo()
      return { ok: restored, message: restored ? 'Dernière action annulée.' : 'Rien à annuler.' }
    }
    default:
      return { ok: false, error: `Outil inconnu : ${call.name}` }
  }
}

function buildAnswer(text, views) {
  const groups = []
  const stats = []
  for (const view of views) {
    if (view.kind === 'list' && view.tasks?.length) {
      groups.push({ title: view.title || 'Résultats', tone: 'info', tasks: view.tasks, meta: view.tasks.map(() => '') })
    }
  }
  let spoken = clean(text, 1200)
  if (!spoken) {
    const created = views.find((view) => view.kind === 'list' && view.title)
    spoken = created?.tasks?.length
      ? `C'est fait : ${created.tasks.length} tâche${created.tasks.length > 1 ? 's' : ''} créée${created.tasks.length > 1 ? 's' : ''}.`
      : "C'est fait. Tu veux que je vérifie autre chose ?"
  }
  return {
    kind: 'agent',
    headline: 'Agent',
    spoken,
    groups,
    stats,
    chips: [
      { label: 'Voir mes tâches', command: 'liste mes tâches' },
      { label: 'Qu’est-ce que j’ai aujourd’hui ?', command: 'qu’est-ce que j’ai à faire aujourd’hui' },
    ],
  }
}

/**
 * Lance la boucle. Retourne null si le service IA n'est pas disponible,
 * pour que l'app repasse sur le moteur local sans casser l'expérience.
 */
export async function runAgent(text, store) {
  const get = store.get
  const now = new Date()
  const history = get().messages.slice(0, -1).map((message) => ({
    role: message.role === 'user' ? 'user' : 'assistant',
    text: message.text || message.answer?.spoken || '',
  }))
  const actions = []
  const views = []

  for (let step = 0; step < MAX_STEPS; step += 1) {
    let response
    try {
      response = await fetch(aiUrl('/api/ai/agent'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          history,
          now: localTime(now),
          tasks: get().tasks.map(compactTask),
          actions,
        }),
        signal: AbortSignal.timeout(25000),
      })
    } catch {
      return null
    }
    if (!response.ok) return null
    let data
    try { data = await response.json() } catch { return null }

    if (!Array.isArray(data.calls) || !data.calls.length) {
      return { answer: buildAnswer(data.text || '', views), steps: actions.length + 1 }
    }

    const results = []
    for (const call of data.calls) {
      const result = await executeTool(store, call, now)
      results.push({ id: call.id, name: call.name, result })
      if (result.view) views.push(result.view)
    }
    actions.push({ modelParts: data.parts, results })
  }

  return { answer: buildAnswer('', views), steps: actions.length, incomplete: true }
}
