import { create } from 'zustand'
import { storage, SETTINGS_ID } from '../lib/storage.js'
import * as cloudSync from '../lib/sync.js'
import { interpret } from '../nlu/parser.js'
import { interpretWithAi } from '../nlu/ai.js'
import { runAgent } from '../agent/runAgent.js'
import { buildAnswer, filterTasks, sortTasks, matchesRange } from '../nlu/answers.js'
import { nextOccurrence, fromISODate, toISODate } from '../nlu/dates.js'
import { CATEGORIES } from '../nlu/lexicon.js'
import { uid, capitalize } from '../lib/utils.js'
import { seedDemoTasks } from '../data/demo.js'

const DEFAULT_SETTINGS = {
  language: 'fr-FR',
  aiEnabled: false,
  agentMode: true,
  voiceReply: true,
  googleVoice: true,
  googleVoiceName: 'Kore',
  rate: 0.98,
  pitch: 1,
  voiceName: null,
  showVoiceDock: true,
  autoListenOnLoad: false,
  continuous: true,
  interimResults: true,
  autoCreateOnSilence: false,
  confirmDestructive: true,
  density: 'confortable',
  highContrast: false,
  reduceMotion: false,
  accent: 'violet',
  showConfidence: true,
  soundOnCapture: true,
  onboardingDone: false,
  demoLoaded: false,
}

const MAX_MESSAGES = 60
const MAX_UNDO = 12
let cloudPushTimer = null

const mergeTasks = (local, remote) => {
  const byId = new Map()
  ;[...(local || []), ...(remote || [])].forEach((task) => {
    if (!task?.id) return
    const previous = byId.get(task.id)
    const stamp = (value) => new Date(value?.updatedAt || value?.createdAt || 0).getTime()
    if (!previous || stamp(task) >= stamp(previous)) byId.set(task.id, task)
  })
  return [...byId.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
}

const openTasks = (tasks) => (tasks || []).filter((task) => !task.done)
const contextHint = (tasks) => {
  const open = openTasks(tasks)
  if (!open.length) return 'Rien en cours de ton côté.'
  const urgent = open.filter((task) => task.priority === 'high' || task.priority === 'critical').length
  return `Tu as ${open.length} tâche${open.length > 1 ? 's' : ''} en cours${urgent ? `, dont ${urgent} prioritaire${urgent > 1 ? 's' : ''}` : ''}.`
}

const CHAT_ANSWERS = {
  greeting: (now, tasks) => {
    const hour = now.getHours()
    const hello = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
    return { headline: 'Salut !', spoken: `${hello} ! ${contextHint(tasks)} Qu’est-ce qu’on fait ?` }
  },
  wellbeing: (now, tasks) => ({ headline: 'Je vais bien', spoken: `Très bien, merci ! ${contextHint(tasks)} On s’en occupe ensemble ?` }),
  thanks: () => ({ headline: 'Avec plaisir', spoken: 'Avec plaisir ! Je suis là si tu as besoin.' }),
  comprehension: () => ({ headline: 'Oui', spoken: 'Oui, je te suis parfaitement. Dis-moi ce que tu veux faire.' }),
  identity: () => ({ headline: 'TaskVox Pro', spoken: 'Je suis TaskVox Pro, ton gestionnaire de tâches vocal. Je peux créer, retrouver, modifier et supprimer tes tâches en français.' }),
  time: (now) => ({ headline: 'Heure actuelle', spoken: `Il est ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.` }),
  date: (now) => ({ headline: 'Aujourd’hui', spoken: `Nous sommes le ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.` }),
  generic: (now, tasks) => ({ headline: 'Je suis là', spoken: `Je suis là, je t’écoute. ${contextHint(tasks)} Dis-moi une tâche à créer, à retrouver ou à terminer.` }),
}

export const useTaskStore = create((set, get) => ({
  /* ------------------------------ état ------------------------------ */
  ready: false,
  storageBackend: 'indexeddb',
  tasks: [],
  messages: [],
  settings: { ...DEFAULT_SETTINGS },
  undoStack: [],
  pendingConfirmation: null,
  activeTaskId: null,
  view: 'dashboard',
  filters: { query: '', category: null, priority: null, tag: null, status: 'open', range: null, sort: 'smart' },
  assistant: { thinking: false },
  lastAction: null,
  toast: null,
  cloud: {
    connected: false,
    email: null,
    busy: false,
    dirty: false,
    error: null,
    lastSync: null,
  },

  /* --------------------------- hydratation --------------------------- */
  async hydrate() {
    const [tasks, messages, settings] = await Promise.all([
      storage.getAll('tasks'),
      storage.getAll('messages'),
      storage.get('settings', SETTINGS_ID),
    ])
    const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) }
    set({
      tasks: (tasks || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      messages: (messages || [])
        .sort((a, b) => a.at - b.at)
        .slice(-MAX_MESSAGES),
      settings: merged,
      ready: true,
      storageBackend: storage.backend,
    })
    queueMicrotask(() => get().initCloud())
  },

  persistSettings(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    storage.put('settings', { id: SETTINGS_ID, ...settings })
  },

  /* ----------------------- synchronisation cloud ----------------------- */
  async initCloud() {
    const session = cloudSync.getSession()
    if (!session) return
    set({ cloud: { ...get().cloud, connected: true, email: session.email || null, busy: true, error: null } })
    await get().pullCloud()
  },

  async signInCloud(email, password) {
    set({ cloud: { ...get().cloud, busy: true, error: null } })
    try {
      const session = await cloudSync.signIn(email, password)
      set({ cloud: { ...get().cloud, connected: true, email: session.email || email, busy: false, error: null } })
      await get().pullCloud()
      return true
    } catch (error) {
      set({ cloud: { ...get().cloud, busy: false, error: error.message } })
      return false
    }
  },

  async signUpCloud(email, password) {
    set({ cloud: { ...get().cloud, busy: true, error: null } })
    try {
      const session = await cloudSync.signUp(email, password)
      set({ cloud: { ...get().cloud, connected: true, email: session.email || email, busy: false, error: null } })
      await get().pullCloud()
      return true
    } catch (error) {
      set({ cloud: { ...get().cloud, busy: false, error: error.message } })
      return false
    }
  },

  async signOutCloud() {
    await cloudSync.signOut()
    if (cloudPushTimer) {
      clearTimeout(cloudPushTimer)
      cloudPushTimer = null
    }
    set({ cloud: { connected: false, email: null, busy: false, dirty: false, error: null, lastSync: null } })
  },

  async flushCloud() {
    const cloud = get().cloud
    if (!cloud.connected || cloud.busy) return
    set({ cloud: { ...cloud, busy: true, error: null } })
    try {
      const at = await cloudSync.pushTasks(get().tasks)
      set({ cloud: { ...get().cloud, busy: false, dirty: false, lastSync: at, error: null } })
    } catch (error) {
      set({ cloud: { ...get().cloud, busy: false, error: error.message } })
    }
  },

  async pullCloud() {
    const cloud = get().cloud
    if (!cloud.connected) return
    set({ cloud: { ...cloud, busy: true, error: null } })
    try {
      const row = await cloudSync.pullTasks()
      if (!row) {
        const at = await cloudSync.pushTasks(get().tasks)
        set({ cloud: { ...get().cloud, busy: false, dirty: false, lastSync: at, error: null } })
        return
      }
      const merged = mergeTasks(get().tasks, row.tasks)
      set({ tasks: merged })
      await storage.clear('tasks')
      await storage.putMany('tasks', merged)
      set({ cloud: { ...get().cloud, busy: false, dirty: false, lastSync: row.updated_at, error: null } })
    } catch (error) {
      set({ cloud: { ...get().cloud, busy: false, error: error.message } })
    }
  },

  syncNow() {
    if (!get().cloud.connected) return
    return get().cloud.dirty ? get().flushCloud() : get().pullCloud()
  },

  /* ------------------------------ tâches ------------------------------ */
  snapshot() {
    const stack = [...get().undoStack, { tasks: get().tasks, at: Date.now() }].slice(-MAX_UNDO)
    set({ undoStack: stack })
  },

  async commitTasks(tasks) {
    const cloud = get().cloud
    set({ tasks, cloud: cloud.connected ? { ...cloud, dirty: true } : cloud })
    await storage.putMany('tasks', tasks)
    if (cloud.connected) {
      if (cloudPushTimer) clearTimeout(cloudPushTimer)
      cloudPushTimer = setTimeout(() => {
        cloudPushTimer = null
        get().flushCloud()
      }, 700)
    }
  },

  async addTasks(drafts, meta = {}) {
    const now = new Date()
    get().snapshot()
    const created = drafts.map((draft) => ({
      ...draft,
      id: draft.id || uid('task'),
      createdAt: draft.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      title: capitalize(draft.title || ''),
      subtasks: draft.subtasks || [],
      tags: draft.tags || [],
      source: draft.source || meta.source || 'text',
    }))
    const tasks = [...get().tasks, ...created]
    await get().commitTasks(tasks)
    set({ lastAction: { type: 'create', payload: created.map((task) => task.id) } })
    return created
  },

  async addTask(draft, meta) {
    const [task] = await get().addTasks([draft], meta)
    return task
  },

  async updateTask(id, patch) {
    get().snapshot()
    const now = new Date().toISOString()
    const tasks = get().tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: now } : task))
    await get().commitTasks(tasks)
    set({ lastAction: { type: 'update', payload: id } })
  },

  async updateMany(ids, patch) {
    if (!ids.length) return []
    get().snapshot()
    const now = new Date().toISOString()
    const idSet = new Set(ids)
    const tasks = get().tasks.map((task) => (idSet.has(task.id) ? { ...task, ...patch, updatedAt: now } : task))
    await get().commitTasks(tasks)
    return tasks.filter((task) => idSet.has(task.id))
  },

  async toggleTask(id) {
    const task = get().tasks.find((entry) => entry.id === id)
    if (!task) return null
    return get().setDone(id, !task.done)
  },

  async setDone(id, done) {
    get().snapshot()
    const now = new Date()
    let tasks = get().tasks.map((entry) =>
      entry.id === id ? { ...entry, done, completedAt: done ? now.toISOString() : null, updatedAt: now.toISOString() } : entry,
    )

    // Récurrence : compléter une tâche répétitive régénère l'occurrence suivante.
    const target = tasks.find((entry) => entry.id === id)
    if (done && target?.recurrence?.rrule) {
      const nextDate = nextOccurrence(target.recurrence.rrule, fromISODate(target.dueAt) || now, now)
      if (nextDate) {
        const clone = {
          ...target,
          id: uid('task'),
          done: false,
          completedAt: null,
          dueAt: nextDate.toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          subtasks: (target.subtasks || []).map((sub) => ({ ...sub, id: uid('sub'), done: false })),
        }
        tasks = [...tasks, clone]
      }
    }

    await get().commitTasks(tasks)
    set({ lastAction: { type: 'done', payload: id, done } })
    return tasks.find((entry) => entry.id === id)
  },

  async deleteTask(id) {
    get().snapshot()
    const tasks = get().tasks.filter((task) => task.id !== id)
    await get().commitTasks(tasks)
    set({ lastAction: { type: 'delete', payload: id }, activeTaskId: get().activeTaskId === id ? null : get().activeTaskId })
  },

  async deleteMany(ids) {
    if (!ids.length) return []
    get().snapshot()
    const idSet = new Set(ids)
    const removed = get().tasks.filter((task) => idSet.has(task.id))
    const tasks = get().tasks.filter((task) => !idSet.has(task.id))
    await get().commitTasks(tasks)
    set({ lastAction: { type: 'delete-many', payload: removed.map((task) => task.id) } })
    return removed
  },

  async togglePin(id) {
    const task = get().tasks.find((entry) => entry.id === id)
    if (!task) return
    await get().updateTask(id, { pinned: !task.pinned })
  },

  async toggleSubtask(taskId, subtaskId) {
    const task = get().tasks.find((entry) => entry.id === taskId)
    if (!task) return
    const subtasks = (task.subtasks || []).map((sub) => (sub.id === subtaskId ? { ...sub, done: !sub.done } : sub))
    const allDone = subtasks.length > 0 && subtasks.every((sub) => sub.done)
    await get().updateTask(taskId, { subtasks, done: allDone ? true : task.done, completedAt: allDone ? new Date().toISOString() : task.completedAt })
  },

  async restoreFromUndo() {
    const stack = [...get().undoStack]
    const last = stack.pop()
    if (!last) return false
    const tasks = last.tasks
    set({ undoStack: stack })
    await get().commitTasks(tasks)
    return true
  },

  /* ---------------------------- assistant ---------------------------- */
  pushMessage(message) {
    const messages = [...get().messages, { id: uid('msg'), at: Date.now(), ...message }].slice(-MAX_MESSAGES)
    set({ messages })
    storage.put('messages', messages[messages.length - 1])
    return messages
  },

  clearConversation() {
    set({ messages: [] })
    storage.clear('messages')
  },

  /**
   * Point d'entrée unique du langage naturel (voix OU texte).
   * Retourne { answer, created, matched } pour que l'UI puisse réagir.
   */
  async runNaturalLanguage(rawText, meta = {}) {
    const now = new Date()
    set({ assistant: { thinking: true } })

    const text = String(rawText || '').trim()
    if (!text) {
      set({ assistant: { thinking: false } })
      return null
    }

    get().pushMessage({ role: 'user', text, source: meta.source || 'text' })

    // Confirmation en attente ?
    const pending = get().pendingConfirmation
    if (pending) {
      const folded = text.toLowerCase()
      const confirmed = /^(oui|ok|okay|d'accord|dac|confirme|confirmer|vas[- ]y|allez|fait[- ]le|fais[- ]le|sure|yes|valide|valider)\b/.test(folded)
      const cancelled = /^(non|annule|annuler|stop|laisse|jamais|no)\b/.test(folded)
      if (confirmed || cancelled) {
        set({ pendingConfirmation: null })
        if (cancelled) {
          const answer = {
            kind: 'confirm-cancel',
            headline: 'Action annulée',
            spoken: "D'accord, je ne fais rien.",
            groups: [],
            stats: [],
            chips: [],
          }
          get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
          set({ assistant: { thinking: false } })
          return { answer }
        }
        const result = await executeConfirmed(pending, set, get, now, meta)
        set({ assistant: { thinking: false } })
        return result
      }
    }

    // Mode agent : le modèle raisonne avec l'historique et les tâches, appelle
    // des outils validés, puis répond. Repli silencieux sur le moteur local si
    // le service IA n'est pas disponible (clé absente, hébergement statique…).
    if (get().settings.agentMode !== false) {
      try {
        const agent = await runAgent(text, { get, set })
        if (agent) {
          get().pushMessage({ role: 'assistant', text: agent.answer.spoken, answer: agent.answer })
          set({ assistant: { thinking: false } })
          return agent
        }
      } catch {
        // Repli sur le moteur local.
      }
    }

    let interpretation = interpret(text, { now, source: meta.source })
    // Actions destructrices et modifications restent exclusivement locales.
    // Gemini ne reçoit que la phrase, jamais l'ensemble des tâches.
    if (get().settings.aiEnabled && !interpretation.notice && ['create', 'list', 'search', 'unknown'].includes(interpretation.intent)) {
      try {
        const ai = await interpretWithAi(text, { now, source: meta.source })
        if (ai) interpretation = ai
        else interpretation = { ...interpretation, intent: 'unknown', tasks: [], filters: {} }
      } catch {
        set({ toast: { tone: 'warning', title: 'Gemini indisponible', description: 'Compréhension locale utilisée à la place. Vérifie le résultat.' } })
      }
    }

    // « annule ça » → retour arrière
    if (interpretation.intent === 'undo') {
      const restored = await get().restoreFromUndo()
      const answer = restored
        ? { kind: 'undo', headline: 'Action annulée', spoken: 'Je suis revenu à l’état précédent.', groups: [], stats: [], chips: [{ label: 'Voir mes tâches', command: 'liste mes tâches' }] }
        : { kind: 'undo', headline: 'Rien à annuler', spoken: "Je n'ai aucune action récente à annuler.", groups: [], stats: [], chips: [] }
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
      set({ assistant: { thinking: false } })
      return { answer }
    }

    if (interpretation.intent === 'help') {
      const answer = buildAnswer(interpretation, get().tasks, now)
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
      set({ assistant: { thinking: false } })
      return { answer }
    }

    // Phrase conversationnelle ou négation : on répond, mais on ne crée rien
    // et on ne propose même pas de transformer ça en tâche.
    if (interpretation.intent === 'unknown' && (interpretation.notice === 'conversation' || interpretation.notice === 'negation')) {
      const isNegation = interpretation.notice === 'negation'
      const base = isNegation
        ? { headline: 'D’accord', spoken: 'D’accord, je ne fais rien.' }
        : (CHAT_ANSWERS[interpretation.chatKind] || CHAT_ANSWERS.generic)(now, get().tasks)
      const answer = {
        kind: 'chat',
        ...base,
        groups: [],
        stats: [],
        chips: [
          { label: 'Ajouter une tâche', action: 'create' },
          { label: 'Voir mes tâches', command: 'qu’est-ce que j’ai à faire aujourd’hui' },
        ],
      }
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
      set({ assistant: { thinking: false }, pendingConfirmation: null })
      return { answer }
    }

    if (interpretation.intent === 'create') {
      const created = await get().addTasks(interpretation.tasks, { source: meta.source || 'text', transcript: text })
      const answer = buildAnswer({ ...interpretation, tasks: created }, get().tasks, now)
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer, taskIds: created.map((task) => task.id) })
      set({ assistant: { thinking: false }, pendingConfirmation: null })
      return { answer, created }
    }

    if (interpretation.intent === 'list' || interpretation.intent === 'search') {
      const matched = filterTasks(get().tasks, interpretation.filters, now)
      const answer = buildAnswer(interpretation, matched, now)
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer, taskIds: matched.slice(0, 20).map((task) => task.id) })
      set({ assistant: { thinking: false } })
      return { answer, matched }
    }

    if (interpretation.intent === 'stats') {
      const answer = buildAnswer(interpretation, get().tasks, now)
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
      set({ assistant: { thinking: false } })
      return { answer }
    }

    if (interpretation.intent === 'complete') {
      let matched = filterTasks(get().tasks, { ...interpretation.filters, status: 'open' }, now)
      if (!matched.length && interpretation.filters.query) {
        matched = filterTasks(get().tasks, interpretation.filters, now).filter((task) => !task.done)
      }
      if (matched.length > 1 && !interpretation.targetAll) matched = matched.slice(0, 1)

      if (matched.length > 3 && get().settings.confirmDestructive) {
        set({
          pendingConfirmation: { intent: 'complete', ids: matched.map((task) => task.id) },
          assistant: { thinking: false },
        })
        const answer = {
          kind: 'confirm',
          headline: 'Confirme la validation',
          spoken: `Tu veux vraiment terminer ${matched.length} tâches d'un coup ? Dis oui pour confirmer.`,
          groups: [{ title: 'Concernées', tone: 'warning', tasks: matched.slice(0, 6) }],
          stats: [],
          chips: [
            { label: 'Oui, terminer', command: 'oui' },
            { label: 'Non', command: 'non' },
          ],
        }
        get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
        return { answer, matched }
      }

      const ids = matched.map((task) => task.id)
      for (const id of ids) await get().setDone(id, true)
      const answer = buildAnswer(interpretation, matched, now)
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer, taskIds: ids })
      set({ assistant: { thinking: false } })
      return { answer, matched }
    }

    if (interpretation.intent === 'update') {
      let matched = filterTasks(get().tasks, { ...interpretation.filters, status: 'all' }, now)
      if (!matched.length) matched = filterTasks(get().tasks, { status: 'all', query: interpretation.filters.query }, now)
      const patch = interpretation.patch || {}
      if (!matched.length || !Object.keys(patch).length) {
        const answer = buildAnswer(interpretation, matched, now)
        get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
        set({ assistant: { thinking: false } })
        return { answer, matched }
      }
      const updated = await get().updateMany(matched.slice(0, 3).map((task) => task.id), patch)
      const answer = buildAnswer(interpretation, updated, now)
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer, taskIds: updated.map((task) => task.id) })
      set({ assistant: { thinking: false } })
      return { answer, matched: updated }
    }

    if (interpretation.intent === 'delete') {
      const matched = filterTasks(get().tasks, interpretation.filters, now)
      if (!matched.length) {
        const answer = buildAnswer(interpretation, matched, now)
        get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
        set({ assistant: { thinking: false } })
        return { answer, matched }
      }
      const destructiveAll = matched.length >= get().tasks.length && get().tasks.length > 2
      if ((matched.length > 1 || destructiveAll) && get().settings.confirmDestructive) {
        set({ pendingConfirmation: { intent: 'delete', ids: matched.map((task) => task.id) }, assistant: { thinking: false } })
        const answer = {
          kind: 'confirm',
          headline: 'Confirme la suppression',
          spoken: `Tu veux vraiment supprimer ${matched.length} tâche${matched.length > 1 ? 's' : ''} ? Dis oui pour confirmer, non pour annuler.`,
          groups: [{ title: 'Concernées', tone: 'danger', tasks: matched.slice(0, 6) }],
          stats: [],
          chips: [
            { label: 'Oui, supprimer', command: 'oui' },
            { label: 'Non, garde-les', command: 'non' },
          ],
        }
        get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
        return { answer, matched }
      }
      const removed = await get().deleteMany(matched.map((task) => task.id))
      const answer = buildAnswer(interpretation, removed, now)
      get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
      set({ assistant: { thinking: false } })
      return { answer, matched: removed }
    }

    // Repli : texte non compris mais exploitable comme tâche.
    const fallbackDraft = {
      id: uid('task'),
      title: capitalize(text.replace(/[.?]+$/, '')),
      notes: '',
      done: false,
      priority: 'medium',
      category: 'divers',
      tags: [],
      dueAt: null,
      dueHasTime: false,
      recurrence: null,
      estimateMinutes: null,
      subtasks: [],
      assignee: null,
      pinned: false,
      source: meta.source || 'text',
    }
    const answer = {
      kind: 'unknown',
      headline: 'Je n’ai pas reconnu de commande',
      spoken: `Je n'ai pas compris la commande. Veux-tu que je crée une tâche intitulée « ${fallbackDraft.title} » ? Dis oui pour confirmer.`,
      groups: [],
      stats: [],
      chips: [
        { label: 'Oui, créer la tâche', command: 'oui' },
        { label: 'Voir des exemples', command: 'aide' },
      ],
    }
    set({ pendingConfirmation: { intent: 'create-fallback', draft: fallbackDraft }, assistant: { thinking: false } })
    get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
    return { answer }
  },

  /* ------------------------------ données ------------------------------ */
  async loadDemoData() {
    const drafts = seedDemoTasks()
    const created = await get().addTasks(drafts, { source: 'demo' })
    get().persistSettings({ demoLoaded: true, onboardingDone: true })
    return created
  },

  async clearAllTasks() {
    get().snapshot()
    await get().commitTasks([])
    set({ activeTaskId: null })
  },

  async importTasks(list) {
    const incoming = Array.isArray(list) ? list : []
    const created = await get().addTasks(
      incoming.map((item) => ({
        ...item,
        id: uid('task'),
        createdAt: item.createdAt || new Date().toISOString(),
      })),
      { source: 'import' },
    )
    return created
  },

  exportData() {
    const { tasks, settings, messages } = get()
    return {
      app: 'TaskVox Pro',
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
      messages,
      settings,
    }
  },

  setView(view) {
    set({ view })
  },

  setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } })
  },

  resetFilters() {
    set({ filters: { query: '', category: null, priority: null, tag: null, status: 'open', range: null, sort: 'smart' } })
  },

  setActiveTask(id) {
    set({ activeTaskId: id })
  },

  setToast(toast) {
    set({ toast })
  },

  /* --------------------------- sélecteurs --------------------------- */
  visibleTasks() {
    const { tasks, filters } = get()
    const filtered = filterTasks(tasks, {
      status: filters.status,
      range: filters.range,
      category: filters.category,
      priority: filters.priority,
      tag: filters.tag,
      query: filters.query || null,
    })
    return sortTasks(filtered, filters.sort)
  },
}))

async function executeConfirmed(pending, set, get, now, meta) {
  if (pending.intent === 'delete') {
    const removed = await get().deleteMany(pending.ids)
    const answer = {
      kind: 'delete',
      headline: removed.length > 1 ? `${removed.length} tâches supprimées` : 'Tâche supprimée',
      spoken: removed.length > 1 ? `C'est fait, ${removed.length} tâches ont été supprimées.` : `J'ai supprimé « ${removed[0]?.title} ».`,
      groups: [{ title: 'Supprimées', tone: 'danger', tasks: removed.slice(0, 8) }],
      stats: [],
      chips: [{ label: 'Annuler', command: null, action: 'undo' }],
      undoable: true,
    }
    get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
    return { answer, matched: removed }
  }

  if (pending.intent === 'complete') {
    const matched = []
    for (const id of pending.ids) {
      await get().setDone(id, true)
      const task = get().tasks.find((entry) => entry.id === id)
      if (task) matched.push(task)
    }
    const answer = {
      kind: 'complete',
      headline: `${matched.length} tâches terminées`,
      spoken: `Parfait, ${matched.length} tâches sont terminées. Tu es à jour.`,
      groups: [{ title: 'Validées', tone: 'success', tasks: matched.slice(0, 8) }],
      stats: [],
      chips: [
        { label: 'Ce qui reste', command: "qu'est-ce qu'il me reste à faire" },
        { label: 'Annuler', command: null, action: 'undo' },
      ],
      undoable: true,
    }
    get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
    return { answer, matched }
  }

  if (pending.intent === 'create-fallback') {
    const created = await get().addTasks([pending.draft], meta)
    const answer = {
      kind: 'create',
      headline: 'Tâche créée',
      spoken: `C'est noté : ${created[0].title}. Je l'ai placée dans ${CATEGORIES[created[0].category].label}.`,
      groups: [{ title: 'Créée', tone: 'success', tasks: created }],
      stats: [{ label: 'Catégorie', value: CATEGORIES[created[0].category].label }],
      chips: [{ label: 'Mes tâches', command: 'liste mes tâches' }],
      undoable: true,
    }
    get().pushMessage({ role: 'assistant', text: answer.spoken, answer })
    return { answer, created }
  }

  return { answer: null }
}

/** Statistiques prêtes à l'emploi pour le tableau de bord. */
export function computeStats(tasks, now = new Date()) {
  const open = tasks.filter((task) => !task.done)
  const done = tasks.filter((task) => task.done)
  const overdue = open.filter((task) => matchesRange(task, 'overdue', now))
  const today = open.filter((task) => matchesRange(task, 'today', now))
  const week = open.filter((task) => matchesRange(task, 'week', now))
  const someday = open.filter((task) => !task.dueAt)

  const byCategory = Object.keys(CATEGORIES).map((key) => ({
    key,
    label: CATEGORIES[key].label,
    color: CATEGORIES[key].color,
    icon: CATEGORIES[key].icon,
    open: open.filter((task) => task.category === key).length,
    done: done.filter((task) => task.category === key).length,
  }))

  const completedLast7 = done.filter((task) => {
    if (!task.completedAt) return false
    const diff = (now.getTime() - new Date(task.completedAt).getTime()) / 86400000
    return diff <= 7
  })

  const streak = computeStreak(done, now)

  return {
    total: tasks.length,
    open: open.length,
    done: done.length,
    overdue: overdue.length,
    today: today.length,
    week: week.length,
    someday: someday.length,
    completionRate: tasks.length ? Math.round((done.length / tasks.length) * 100) : 0,
    byCategory: byCategory.filter((entry) => entry.open + entry.done > 0),
    completedLast7: completedLast7.length,
    streak,
    pinned: open.filter((task) => task.pinned).length,
  }
}

function computeStreak(doneTasks, now) {
  const days = new Set(
    doneTasks
      .filter((task) => task.completedAt)
      .map((task) => toISODate(new Date(task.completedAt))),
  )
  let streak = 0
  const cursor = new Date(now)
  if (!days.has(toISODate(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(toISODate(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
