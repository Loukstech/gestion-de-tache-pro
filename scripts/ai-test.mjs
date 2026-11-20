import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { geminiMiddleware } from '../server/gemini.js'
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
