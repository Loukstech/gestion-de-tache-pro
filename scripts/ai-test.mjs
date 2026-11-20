import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { geminiMiddleware } from '../server/gemini.js'
import { agentMiddleware } from '../server/agent.js'
import { executeTool } from '../src/agent/runAgent.js'
import { adaptAiResult } from '../src/nlu/ai.js'

const now = new Date(2026, 10, 19, 8, 30)
test('interprétation IA : création contrôlée et catégories', () => {
  const result = adaptAiResult({ intent: 'create', tasks: [{ title: 'Appeler le dentiste', category: 'sante', priority: 'medium', dueAt: '2026-11-20T15:00', dueHasTime: true }] }, 'appeler le dentiste demain', now)
  assert.equal(result.tasks[0].category, 'sante')
  assert.equal(new Date(result.tasks[0].dueAt).getHours(), 15)
  assert.equal(result.tasks[0].done, false)
})
test('interprétation IA : rejette les opérations et données non autorisées', () => {
  assert.throws(() => adaptAiResult({ intent: 'delete' }, 'test', now))
  assert.throws(() => adaptAiResult({ intent: 'create', tasks: [{ title: 'test', category: '__proto__', priority: 'medium' }] }, 'test', now))
  assert.throws(() => adaptAiResult({ intent: 'create', tasks: [{ title: 'test', category: 'perso', priority: 'medium', dueAt: '2026-02-31T15:00' }] }, 'test', now))
  assert.equal(adaptAiResult({ intent: 'unsupported' }, 'test', now), null)
})
test('interprétation IA : les filtres sont bornés', () => {
  const result = adaptAiResult({ intent: 'list', filters: { status: 'open', category: 'travail', range: 'tomorrow' } }, 'demain', now)
  assert.equal(result.filters.category, 'travail')
  assert.throws(() => adaptAiResult({ intent: 'list', filters: { range: 'invented' } }, 'test', now))
})
test('serveur : clé non exposée, contrôle origine et requête Gemini simulée', async () => {
  let sent
  const middleware = geminiMiddleware({ apiKey: 'secret-test', fetchImpl: async (url, options) => {
    sent = { url, options }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"intent":"unsupported"}' }] } }] }) }
  } })
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const status = await fetch(`${url}/api/ai/status`)
    assert.deepEqual(await status.json(), { configured: true, keyCount: 1 })
    const body = JSON.stringify({ text: 'mes tâches', now: '2026-11-19T08:30' })
    const rejected = await fetch(`${url}/api/ai/interpret`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body })
    assert.equal(rejected.status, 403)
    const response = await fetch(`${url}/api/ai/interpret`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { result: { intent: 'unsupported' } })
    assert.equal(sent.options.headers['x-goog-api-key'], 'secret-test')
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('serveur : bascule automatique vers la clé valide suivante', async () => {
  const tried = []
  const middleware = geminiMiddleware({ apiKeys: 'cle-invalide,cle-valide', fetchImpl: async (url, options) => {
    const key = options.headers['x-goog-api-key']
    tried.push(key)
    if (key === 'cle-invalide') return { ok: false, status: 429 }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"intent":"unsupported"}' }] } }] }) }
  } })
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const status = await fetch(`${url}/api/ai/status`)
    assert.deepEqual(await status.json(), { configured: true, keyCount: 2 })
    const response = await fetch(`${url}/api/ai/interpret`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: url },
      body: JSON.stringify({ text: 'mes tâches', now: '2026-11-19T08:30' }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { result: { intent: 'unsupported' } })
    assert.deepEqual(tried, ['cle-invalide', 'cle-valide'])
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('serveur agent : statut, origine et conservation des appels d’outils', async () => {
  let sent
  const modelParts = [
    { functionCall: { name: 'create_tasks', args: { tasks: [{ title: 'Appeler Paul' }] }, id: 'call_1' }, thoughtSignature: 'signature' },
  ]
  const middleware = agentMiddleware({ apiKey: 'secret-agent', fetchImpl: async (url, options) => {
    sent = JSON.parse(options.body)
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: modelParts } }] }) }
  } })
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const status = await fetch(`${url}/api/ai/status`)
    assert.deepEqual(await status.json(), { configured: true, keyCount: 1, agent: true })
    const body = JSON.stringify({ text: 'crée une tâche', now: '2026-11-20T10:00', history: [], tasks: [] })
    const rejected = await fetch(`${url}/api/ai/agent`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body })
    assert.equal(rejected.status, 403)
    const response = await fetch(`${url}/api/ai/agent`, { method: 'POST', headers: { 'content-type': 'application/json', origin: url }, body })
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.calls[0].name, 'create_tasks')
    assert.deepEqual(data.parts, modelParts)
    assert.equal(sent.tools[0].functionDeclarations.length >= 8, true)
    assert.equal(sent.systemInstruction.parts[0].text.includes('2026-11-20T10:00'), true)
    assert.equal(sent.contents.at(-1).role, 'user')
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('agent outils : création locale, confirmation suppression et filtres bornés', async () => {
  const state = {
    tasks: [{ id: 't1', title: 'Tâche existante', done: false, category: 'divers', priority: 'medium', tags: [] }],
    filters: {},
    view: 'dashboard',
  }
  Object.assign(state, {
    addTasks: async (drafts) => {
      const created = drafts.map((draft) => ({ id: `t${state.tasks.length + 1}`, ...draft, done: false }))
      state.tasks = [...state.tasks, ...created]
      return created
    },
    updateTask: async (id, patch) => { state.tasks = state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)) },
    setDone: async (id, done) => { state.tasks = state.tasks.map((task) => (task.id === id ? { ...task, done } : task)) },
    deleteMany: async (ids) => { state.tasks = state.tasks.filter((task) => !ids.includes(task.id)) },
    setFilters: (patch) => { state.filters = { ...state.filters, ...patch } },
    setView: (view) => { state.view = view },
    restoreFromUndo: async () => true,
  })
  const store = { get: () => state, set: (patch) => Object.assign(state, patch) }
  const now = new Date(2026, 10, 20, 10, 0)

  const created = await executeTool(store, { name: 'create_tasks', args: { tasks: [{ title: 'Appeler Paul demain à 15h', priority: 'urgent', category: 'invalide', dueAt: '2026-11-21T15:00' }] } }, now)
  assert.equal(created.ok, true)
  assert.equal(created.tasks[0].dueAt, '2026-11-21T15:00')
  assert.equal(['low', 'medium', 'high', 'critical'].includes(created.tasks[0].priority), true)
  assert.equal(['travail', 'perso', 'sante', 'courses', 'maison', 'finance', 'etudes', 'famille', 'transport', 'admin', 'loisir', 'rdv', 'divers'].includes(created.tasks[0].category), true)

  const refused = await executeTool(store, { name: 'delete_tasks', args: { task_ids: ['t1'] } }, now)
  assert.equal(refused.ok, false)
  assert.equal(state.tasks.some((task) => task.id === 't1'), true)

  const done = await executeTool(store, { name: 'complete_tasks', args: { task_ids: ['t1'] } }, now)
  assert.equal(done.ok, true)
  assert.equal(state.tasks.find((task) => task.id === 't1').done, true)

  const filtered = await executeTool(store, { name: 'set_filters', args: { status: 'open', range: 'invented', sort: 'smart' } }, now)
  assert.equal(filtered.ok, true)
  assert.equal(state.filters.range, undefined)
  assert.equal(state.filters.status, 'open')
  assert.equal(state.view, 'tasks')

  const deleted = await executeTool(store, { name: 'delete_tasks', args: { task_ids: ['t1'], confirmed_by_user: true } }, now)
  assert.equal(deleted.ok, true)
  assert.equal(state.tasks.some((task) => task.id === 't1'), false)
})
