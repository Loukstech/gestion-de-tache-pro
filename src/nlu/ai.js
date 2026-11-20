import { interpret } from './parser.js'
import { CATEGORIES, PRIORITIES } from './lexicon.js'

const ranges = ['today', 'tomorrow', 'week', 'next-week', 'month', 'overdue', 'someday', 'upcoming']
const localTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const category = (value) => typeof value === 'string' && Object.hasOwn(CATEGORIES, value) ? value : null
const priority = (value) => typeof value === 'string' && Object.hasOwn(PRIORITIES, value) ? value : null

// Treat model output as untrusted data; only create/list/search are accepted.
export function adaptAiResult(result, text, now, source = 'text') {
  if (!result || typeof result !== 'object') throw new Error('Réponse IA invalide')
  if (result.intent === 'unsupported') return null
  if (result.intent === 'create') {
    if (!Array.isArray(result.tasks) || !result.tasks.length || result.tasks.length > 10) throw new Error('Tâches IA invalides')
    const tasks = result.tasks.map((item) => {
      if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 250 || !category(item.category) || !priority(item.priority)) throw new Error('Tâche IA invalide')
      const parsed = interpret(`ajoute une tâche ${item.title.trim()}`, { now, source }).tasks[0]
      if (!parsed) throw new Error('Titre de tâche invalide')
      // Recover locally supported entities (recurrence, tags, duration) for a single task.
      const local = result.tasks.length === 1 ? interpret(text, { now, source }).tasks[0] : null
      let dueAt = local?.dueAt || null
      let dueHasTime = local?.dueHasTime || false
      if (item.dueAt != null) {
        if (typeof item.dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.dueAt)) throw new Error('Date IA invalide')
        const date = new Date(item.dueAt)
        if (Number.isNaN(date.getTime()) || localTime(date) !== item.dueAt) throw new Error('Date IA invalide')
        dueAt = date.toISOString(); dueHasTime = item.dueHasTime === true
      }
      return { ...parsed, title: item.title.trim(), category: item.category, priority: item.priority, dueAt, dueHasTime,
        recurrence: local?.recurrence || null, tags: local?.tags || [], subtasks: local?.subtasks || [], estimateMinutes: local?.estimateMinutes || null }
    })
    return { text, intent: 'create', tasks, filters: {}, confidence: 0.7, scope: [], mentions: [] }
  }
  if (result.intent === 'list' || result.intent === 'search') {
    const f = result.filters
    if (!f || typeof f !== 'object') throw new Error('Filtres IA invalides')
    if (f.category != null && !category(f.category) || f.priority != null && !priority(f.priority) || f.range != null && !ranges.includes(f.range) || f.status != null && !['open', 'done', 'all'].includes(f.status) || f.query != null && (typeof f.query !== 'string' || f.query.length > 200)) throw new Error('Filtres IA invalides')
    const filters = { status: f.status || 'open', range: f.range || null, category: f.category || null, priority: f.priority || null, query: f.query?.trim() || null }
    const rangeLabels = { today: "aujourd'hui", tomorrow: 'demain', week: 'cette semaine', 'next-week': 'la semaine prochaine', month: 'ce mois-ci', overdue: 'en retard', someday: 'sans échéance', upcoming: 'à venir' }
    const scope = [filters.category && CATEGORIES[filters.category].label.toLowerCase(), filters.priority && PRIORITIES[filters.priority].label.toLowerCase(), filters.range && rangeLabels[filters.range], filters.status === 'done' && 'terminées'].filter(Boolean)
    return { text, intent: result.intent === 'search' && filters.query ? 'search' : 'list', tasks: [], filters, scope, confidence: 0.7, mentions: [] }
  }
  throw new Error('Intention IA invalide')
}

export async function interpretWithAi(text, { now = new Date(), source = 'text' } = {}) {
  const response = await fetch('/api/ai/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, now: localTime(now) }), signal: AbortSignal.timeout(18000) })
  if (!response.ok) throw new Error('Gemini indisponible')
  const data = await response.json()
  return adaptAiResult(data.result, text, now, source)
}
